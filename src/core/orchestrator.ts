import { createHash } from "node:crypto";
import type { AgentConfig } from "../config/load-config.js";
import { TokenUsageStore } from "../cache/token-usage-store.js";
import { ToolRegistry, parseArguments } from "../tools/tool-registry.js";
import { estimateTokens } from "../utils/text.js";
import { AlgorithmOptimizer } from "./algorithm-optimizer.js";
import { ContextManager } from "./context-manager.js";
import { CostPrecisionEngine } from "./cost-precision-engine.js";
import { ModelRouter } from "./model-router.js";
import { PermissionManager } from "./permission-manager.js";
import type {
  AgentMessage,
  AgentProgressEvent,
  AgentRunOptions,
  AgentRunResult,
  AgentTurnLimit,
  BuiltContext,
  ModelProvider,
  ModelRoute,
  TaskProfile,
  ToolCall,
  ToolExecutionResult
} from "./types.js";

export class AgentOrchestrator {
  private readonly optimizer = new AlgorithmOptimizer();
  private readonly router: ModelRouter;
  private readonly cost: CostPrecisionEngine;
  private readonly registry: ToolRegistry;

  constructor(
    private readonly config: AgentConfig,
    private readonly provider?: ModelProvider,
    private readonly confirm?: (prompt: string) => Promise<boolean>
  ) {
    this.router = new ModelRouter(config);
    this.cost = new CostPrecisionEngine(config);
    this.registry = new ToolRegistry(config);
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    throwIfAborted(options.signal);
    await emitProgress(options, { stage: "route", message: "Classifying task and routing model.", percent: 8 });
    const profile = this.optimizer.classifyTask(options.task);
    const route = applyOverrides(this.router.route(profile), options);
    const directOperation = planDirectDesktopOpen(options.task);
    const selectedToolNames = directOperation ? ["desktop_open"] : this.registry.selectToolNames(profile, options.task);

    await emitProgress(options, {
      stage: "context",
      message: directOperation ? "High-confidence direct desktop operation; skipping model tokens." : "Selecting project context and building cache-friendly prompt.",
      percent: 18,
      detail: { model: route.model, thinking: route.thinking, tools: selectedToolNames, directConfidence: directOperation?.confidence }
    });

    const context = directOperation
      ? buildDirectOperationContext(options.task, directOperation.reason, selectedToolNames, this.config.contextBudgetTokens)
      : await new ContextManager(this.config, options.cwd).build(options.task, profile, selectedToolNames, {
        conversationSummary: options.conversationSummary,
        disabledSkillPaths: options.disabledSkillPaths,
        attachedFiles: options.attachedFiles,
        networkEnabled: options.networkEnabled,
        autoCompressContext: options.autoCompressContext
      });
    throwIfAborted(options.signal);
    const loadedSkillNames = getLoadedSkillNames(context);
    await emitProgress(options, {
      stage: "context",
      message: loadedSkillNames.length ? `Loaded skills: ${loadedSkillNames.join(", ")}.` : "No task-specific skill body loaded.",
      percent: 26,
      detail: {
        items: context.items.length,
        skills: loadedSkillNames,
        stablePrefixHash: context.budgetReport.stablePrefixHash
      }
    });
    const usageStore = new TokenUsageStore(options.cwd);
    const trace = buildDecisionTrace(profile, route, selectedToolNames, context, directOperation?.reason);

    if (options.dryRun) {
      return emptyUsageResult(renderDryRun(route, profile, context), route, profile, context, [], trace, this.cost);
    }

    const permission = new PermissionManager({
      mode: options.permissionMode ?? this.config.permissionMode,
      confirm: this.confirm
    });

    if (directOperation) {
      if (options.networkEnabled === false && directOperation.args.kind === "url") {
        const result = failure("Network access is disabled by desktop settings.");
        return emptyUsageResult("Operation blocked: network access is disabled.", route, profile, context, [result], trace, this.cost);
      }
      return this.runDirectDesktopOperation(options, route, profile, context, directOperation, permission, trace);
    }

    if (!this.provider) {
      throw new Error("No model provider configured.");
    }

    const schemas = this.registry.schemas(selectedToolNames);
    const messages: AgentMessage[] = withJsonInstruction(context.messages, route.responseFormat);
    const usage = [];
    const toolResults: ToolExecutionResult[] = [];
    const reasoning: string[] = [...trace];
    const seenToolCalls = new Map<string, ToolExecutionResult>();
    const maxTurns = resolveAgentMaxTurns(options.maxTurns, this.config.maxAgentTurns, profile, route, selectedToolNames.length);
    reasoning.push(`Turn budget: ${maxTurns} (${options.maxTurns === "auto" ? "auto" : "fixed"}).`);
    let finalContent = "";

    for (let turn = 0; turn < maxTurns; turn += 1) {
      throwIfAborted(options.signal);
      await emitProgress(options, {
        stage: "model",
        message: `Calling ${route.model} turn ${turn + 1}/${maxTurns}.`,
        percent: Math.min(86, 24 + turn * 10)
      });
      const response = await this.provider.complete({
        route,
        messages,
        tools: schemas,
        turn,
        onStream: options.onStream,
        signal: options.signal
      });
      throwIfAborted(options.signal);
      const usageRecord = this.cost.usageFromResponse(route, response);
      usage.push(usageRecord);
      await usageStore.append(usageRecord);
      if (response.reasoningContent?.trim()) {
        reasoning.push(response.reasoningContent.trim());
      }

      if (!response.toolCalls.length) {
        finalContent = mergeAssistantText(finalContent, response.content);
        if (shouldRequestContinuation(response.finishReason) && turn < maxTurns - 1) {
          reasoning.push(`Model finish_reason=${response.finishReason}; requesting an automatic continuation to avoid truncating the answer.`);
          messages.push(response.message);
          messages.push({
            role: "user",
            content: "Continue exactly from where the previous answer stopped. Do not repeat earlier text. Keep the same language and formatting."
          });
          await emitProgress(options, {
            stage: "model",
            message: "Output hit the model token limit; requesting continuation.",
            percent: Math.min(94, 34 + turn * 10)
          });
          continue;
        }

        if (shouldRequestContinuation(response.finishReason)) {
          reasoning.push(`Model finish_reason=${response.finishReason}; turn budget exhausted, returning the visible partial answer.`);
        }
        const final = formatPossiblyPartialAnswer(finalContent || response.content || "(empty response)", response.finishReason, turn, maxTurns);
        appendQualityGateWarnings(reasoning, this.cost.finalSelfCheck(final, context, toolResults));
        await emitProgress(options, { stage: "final", message: "Final answer received.", percent: 100 });
        return {
          content: final,
          route,
          profile,
          context,
          usage,
          toolResults,
          reasoning,
          completedFiles: extractCompletedFiles(toolResults),
          requestCache: this.cost.summarize([usage.at(-1)!].filter(Boolean)),
          conversationCache: this.cost.summarize(usage)
        };
      }

      if (response.content?.trim()) {
        finalContent = mergeAssistantText(finalContent, response.content);
      }
      messages.push(response.message);

      for (const call of response.toolCalls) {
        throwIfAborted(options.signal);
        const hash = this.registry.toolCallHash(call);
        const cached = seenToolCalls.get(hash);
        if (cached) {
          messages.push(toolMessage(call.id, `Reused previous result:\n${cached.summary}`));
          continue;
        }

        const tool = this.registry.get(call.function.name);
        if (!tool) {
          const result = failure(`Unknown tool: ${call.function.name}`);
          seenToolCalls.set(hash, result);
          toolResults.push(result);
          messages.push(toolMessage(call.id, result.summary));
          continue;
        }

        try {
          const args = parseArguments(call.function.arguments);
          if (options.networkEnabled === false && isNetworkToolCall(call.function.name, args)) {
            const result = failure("Network access is disabled by desktop settings.");
            seenToolCalls.set(hash, result);
            toolResults.push(result);
            messages.push(toolMessage(call.id, result.summary));
            continue;
          }

          const decision = await permission.check(tool, call);
          throwIfAborted(options.signal);
          if (!decision.allowed) {
            const result = failure(`Permission denied: ${decision.reason}`);
            seenToolCalls.set(hash, result);
            toolResults.push(result);
            messages.push(toolMessage(call.id, result.summary));
            continue;
          }

          await emitProgress(options, {
            stage: "tool",
            message: `Running tool ${tool.name}.`,
            percent: Math.min(92, 34 + turn * 10),
            detail: { tool: tool.name }
          });
          const result = await this.registry.execute(call, options.cwd);
          throwIfAborted(options.signal);
          seenToolCalls.set(hash, result);
          toolResults.push(result);
          messages.push(toolMessage(call.id, result.summary || result.content));
        } catch (error) {
          const result = failure(formatToolError(call, error));
          seenToolCalls.set(hash, result);
          toolResults.push(result);
          messages.push(toolMessage(call.id, result.summary));
        }
      }
    }

    if (toolResults.length && this.provider) {
      reasoning.push(`Turn budget ${maxTurns} reached after tool execution; requesting final synthesis without additional tool calls.`);
      messages.push({
        role: "user",
        content: [
          "The agent loop reached the turn budget after tool execution.",
          "Do not call any more tools. Based only on the existing observations and tool results, give the most complete final answer possible.",
          "If something is unfinished, say exactly what remains and what the next request should be."
        ].join("\n")
      });
      await emitProgress(options, {
        stage: "model",
        message: "Turn budget reached; synthesizing final answer without more tools.",
        percent: 96
      });
      const response = await this.provider.complete({
        route,
        messages,
        tools: [],
        turn: maxTurns,
        onStream: options.onStream,
        signal: options.signal
      });
      throwIfAborted(options.signal);
      const usageRecord = this.cost.usageFromResponse(route, response);
      usage.push(usageRecord);
      await usageStore.append(usageRecord);
      if (response.reasoningContent?.trim()) {
        reasoning.push(response.reasoningContent.trim());
      }
      const content = mergeAssistantText(finalContent, response.content) || renderTurnLimitFallback(maxTurns, toolResults, finalContent);
      appendQualityGateWarnings(reasoning, this.cost.finalSelfCheck(content, context, toolResults));
      await emitProgress(options, { stage: "final", message: "Final answer synthesized after turn limit.", percent: 100 });
      return {
        content,
        route,
        profile,
        context,
        usage,
        toolResults,
        reasoning,
        completedFiles: extractCompletedFiles(toolResults),
        requestCache: this.cost.summarize([usage.at(-1)!].filter(Boolean)),
        conversationCache: this.cost.summarize(usage)
      };
    }

    const content = renderTurnLimitFallback(maxTurns, toolResults, finalContent);
    appendQualityGateWarnings(reasoning, this.cost.finalSelfCheck(content, context, toolResults));
    return {
      content,
      route,
      profile,
      context,
      usage,
      toolResults,
      reasoning,
      completedFiles: extractCompletedFiles(toolResults),
      requestCache: this.cost.summarize([usage.at(-1)!].filter(Boolean)),
      conversationCache: this.cost.summarize(usage)
    };
  }

  private async runDirectDesktopOperation(
    options: AgentRunOptions,
    route: ModelRoute,
    profile: AgentRunResult["profile"],
    context: BuiltContext,
    directOperation: DirectDesktopOperation,
    permission: PermissionManager,
    trace: string[]
  ): Promise<AgentRunResult> {
    const call: ToolCall = {
      id: "direct-desktop-open",
      type: "function",
      function: {
        name: "desktop_open",
        arguments: JSON.stringify(directOperation.args)
      }
    };
    const tool = this.registry.get("desktop_open");
    if (!tool) {
      const result = failure("desktop_open tool is not registered.");
      return emptyUsageResult("Operation was not executed: desktop_open is not registered.", route, profile, context, [result], trace, this.cost);
    }

    await emitProgress(options, { stage: "permission", message: "Checking desktop operation permission.", percent: 34, detail: directOperation.args });
    const decision = await permission.check(tool, call);
    throwIfAborted(options.signal);
    if (!decision.allowed) {
      const result = failure(`Permission denied: ${decision.reason}`);
      return emptyUsageResult("Operation was not executed: permission was not granted.", route, profile, context, [result], trace, this.cost);
    }

    await emitProgress(options, { stage: "tool", message: "Running tool desktop_open.", percent: 72, detail: directOperation.args });
    throwIfAborted(options.signal);
    const result = await this.registry.execute(call, options.cwd);
    await emitProgress(options, { stage: result.ok ? "final" : "error", message: result.ok ? "Desktop operation completed." : "Desktop operation failed.", percent: 100 });
    return emptyUsageResult(
      result.ok ? `Desktop operation executed: ${result.summary}` : `Operation failed: ${result.summary}`,
      route,
      profile,
      context,
      [result],
      [...trace, `Direct tool call: desktop_open ${JSON.stringify(directOperation.args)}`, `Tool result: ${result.summary}`],
      this.cost
    );
  }
}

function shouldRequestContinuation(finishReason?: string): boolean {
  return /length|max_tokens|token_limit|truncated/i.test(String(finishReason || ""));
}

export function resolveAgentMaxTurns(
  requested: AgentTurnLimit | undefined,
  configured: number,
  profile: TaskProfile,
  route: ModelRoute,
  selectedToolCount: number
): number {
  if (typeof requested === "number" && Number.isInteger(requested)) {
    return clampTurnLimit(requested);
  }
  if (requested !== "auto") {
    return clampTurnLimit(configured);
  }

  let turns = profile.needsTools ? 5 : 3;
  turns += Math.max(0, profile.complexity - 2);
  if (selectedToolCount > 2) turns += 2;
  if (profile.kind === "edit" || profile.kind === "debug") turns += 2;
  if (profile.kind === "refactor") turns += 4;
  if (profile.kind === "shell" || profile.kind === "git") turns += 1;
  if (profile.domains?.some((domain) => ["agent", "desktop", "tool", "skill"].includes(domain))) turns += 1;
  if (route.thinking === "enabled") turns += 1;
  if (route.reasoningEffort === "max" || /pro/i.test(route.model)) turns += 1;
  return clampTurnLimit(turns);
}

function clampTurnLimit(value: number): number {
  return Math.min(16, Math.max(1, Math.trunc(value)));
}

function formatPossiblyPartialAnswer(content: string, finishReason: string | undefined, turn: number, maxTurns: number): string {
  if (!shouldRequestContinuation(finishReason) || turn < maxTurns - 1) {
    return content;
  }
  return [
    content,
    "",
    "\u3010\u72b6\u6001\u3011\u56de\u7b54\u8fbe\u5230\u5f53\u524d\u8f6e\u6b21\u9884\u7b97\uff0c\u4e0a\u9762\u662f\u5df2\u63a5\u6536\u7684\u53ef\u89c1\u5185\u5bb9\u3002\u5982\u679c\u9700\u8981\u7ee7\u7eed\uff0c\u53ef\u76f4\u63a5\u53d1\u9001\u201c\u7ee7\u7eed\u201d\u3002"
  ].join("\n");
}

function renderTurnLimitFallback(maxTurns: number, toolResults: ToolExecutionResult[], partialContent: string): string {
  const successfulTools = toolResults.filter((item) => item.ok).length;
  const failedTools = toolResults.length - successfulTools;
  const toolLine = toolResults.length
    ? `\u5df2\u6267\u884c\u5de5\u5177 ${toolResults.length} \u6b21\uff0c\u6210\u529f ${successfulTools} \u6b21\uff0c\u5931\u8d25 ${failedTools} \u6b21\u3002`
    : "\u672c\u8f6e\u672a\u5f97\u5230\u53ef\u7528\u7684\u6700\u7ec8\u56de\u7b54\u3002";
  const prefix = partialContent.trim() ? `${partialContent.trim()}\n\n` : "";
  return `${prefix}\u3010\u72b6\u6001\u3011\u5df2\u8fbe\u5230\u5f53\u524d Agent Loop \u8f6e\u6b21\u4e0a\u9650\uff08${maxTurns}\uff09\u3002${toolLine}\n\u5efa\u8bae\uff1a\u53d1\u9001\u201c\u7ee7\u7eed\u201d\u6216\u5c06\u8f6e\u6b21\u8bbe\u4e3a\u201c\u81ea\u52a8\u201d\uff0c\u8fd0\u884c\u65f6\u4f1a\u6839\u636e\u4efb\u52a1\u590d\u6742\u5ea6\u81ea\u52a8\u5206\u914d\u66f4\u5408\u9002\u7684\u8f6e\u6b21\u9884\u7b97\u3002`;
}

function mergeAssistantText(previous: string, next: string): string {
  const left = String(previous || "");
  const right = String(next || "");
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  if (left.endsWith(right)) {
    return left;
  }
  if (right.startsWith(left)) {
    return right;
  }

  const overlap = suffixPrefixOverlap(left, right);
  return overlap > 0 ? `${left}${right.slice(overlap)}` : `${left}${right}`;
}

function suffixPrefixOverlap(left: string, right: string): number {
  const max = Math.min(left.length, right.length, 4000);
  for (let size = max; size > 0; size -= 1) {
    if (left.slice(-size) === right.slice(0, size)) {
      return size;
    }
  }
  return 0;
}

function applyOverrides(route: ModelRoute, options: AgentRunOptions): ModelRoute {
  return {
    ...route,
    model: options.modelOverride?.trim() || route.model,
    thinking: options.thinkingOverride ?? route.thinking,
    source: options.modelOverride?.trim() ? "manual" : "auto"
  };
}

export interface DirectDesktopOperation {
  args: {
    target: string;
    kind: "path" | "url" | "app";
  };
  reason: string;
  confidence: number;
}

export function planDirectDesktopOpen(task: string): DirectDesktopOperation | undefined {
  const text = task.trim();
  const hasOpenIntent = hasDesktopOpenIntent(text);

  const bingSearch = text.match(/(?:bing|\u5fc5\u5e94).{0,12}(?:\u641c\u7d22|\u641c|search)\s*([^\n\uff0c\u3002]+)/i);
  if (hasOpenIntent && bingSearch?.[1]?.trim()) {
    return {
      args: {
        target: `https://www.bing.com/search?q=${encodeURIComponent(bingSearch[1].trim())}`,
        kind: "url"
      },
      reason: "Explicit Bing search request detected; using desktop_open without a model call.",
      confidence: 0.95
    };
  }

  const genericSearch = text.match(/(?:\u641c\u7d22|\u641c|search)\s*([^\n\uff0c\u3002]+)/i);
  if (hasOpenIntent && genericSearch?.[1]?.trim()) {
    return {
      args: {
        target: `https://www.bing.com/search?q=${encodeURIComponent(genericSearch[1].trim())}`,
        kind: "url"
      },
      reason: "Explicit browser search request detected; using desktop_open without a model call.",
      confidence: 0.92
    };
  }

  const pathTarget = hasOpenIntent ? openPathTarget(text) : undefined;
  if (pathTarget) {
    return {
      args: {
        target: pathTarget,
        kind: "path"
      },
      reason: "Explicit local path or workspace open request detected; using desktop_open without a model call.",
      confidence: 0.93
    };
  }

  const url = extractUrl(text);
  if (url && (hasOpenIntent || isBareUrlRequest(text, url))) {
    return {
      args: {
        target: normalizeUrl(url),
        kind: "url"
      },
      reason: "Explicit URL open request detected; using desktop_open without a model call.",
      confidence: 0.96
    };
  }

  const siteTarget = siteAlias(text);
  if (hasOpenIntent && siteTarget) {
    return {
      args: {
        target: siteTarget,
        kind: "url"
      },
      reason: "Known website open request detected; using desktop_open without a model call.",
      confidence: 0.9
    };
  }

  if (!hasOpenIntent) {
    return undefined;
  }

  const appTarget = appAlias(text);
  if (appTarget) {
    return {
      args: {
        target: appTarget,
        kind: "app"
      },
      reason: "Known local app launch request detected; using desktop_open without a model call.",
      confidence: 0.9
    };
  }

  return undefined;
}

function hasDesktopOpenIntent(text: string): boolean {
  return /(\u6253\u5f00|\u542f\u52a8|\u8bbf\u95ee|\u6d4f\u89c8|\u6253\u5f00\u4e00\u4e0b|\u5e2e\u6211\u6253\u5f00|open|launch|visit|browse|go to)/i.test(text);
}

function extractUrl(text: string): string | undefined {
  const explicit = text.match(/https?:\/\/[^\s"'<>\uff0c\u3002]+/i)?.[0];
  if (explicit) {
    return explicit;
  }
  return text.match(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s"'<>\uff0c\u3002]*)?/i)?.[0];
}

function normalizeUrl(url: string): string {
  const trimmed = url.replace(/[\uff0c\u3002,.]+$/g, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function siteAlias(text: string): string | undefined {
  const aliases: Array<[RegExp, string]> = [
    [/\bgithub\b|\u6253\u5f00github/i, "https://github.com"],
    [/\bgoogle\b|\u8c37\u6b4c/i, "https://www.google.com"],
    [/\bbing\b|\u5fc5\u5e94/i, "https://www.bing.com"],
    [/\bbaidu\b|\u767e\u5ea6/i, "https://www.baidu.com"],
    [/\bnpm\b/i, "https://www.npmjs.com"],
    [/\bdeepseek\b/i, "https://chat.deepseek.com"],
    [/\bchatgpt\b|\bopenai\b/i, "https://chatgpt.com"],
    [/\byoutube\b/i, "https://www.youtube.com"],
    [/\bzhihu\b|\u77e5\u4e4e/i, "https://www.zhihu.com"],
    [/\bbilibili\b|\bb\u7ad9\b|\u54d4\u54e9\u54d4\u54e9/i, "https://www.bilibili.com"]
  ];
  return aliases.find(([pattern]) => pattern.test(text))?.[1];
}

function openPathTarget(text: string): string | undefined {
  if (/(\u5f53\u524d|\u8fd9\u4e2a|\u672c\u5730|current|this).{0,8}(\u5de5\u4f5c\u533a|\u9879\u76ee|\u76ee\u5f55|\u6587\u4ef6\u5939|workspace|project|folder|directory)/i.test(text)) {
    return ".";
  }

  if (isVaguePathOpenRequest(text)) {
    return undefined;
  }

  const quoted = text.match(/["'`\u201c\u2018]([^"'`\u201d\u2019]+(?:[\\/]|\\.[a-z0-9]{1,12}\b)[^"'`\u201d\u2019]*)["'`\u201d\u2019]/i)?.[1];
  if (quoted) {
    return cleanOpenTarget(quoted);
  }

  const absolute = text.match(/[a-zA-Z]:\\[^\n\r\uff0c\u3002]+|\\\\[^\n\r\uff0c\u3002]+/)?.[0];
  if (absolute) {
    return cleanOpenTarget(absolute);
  }

  const target = stripOpenIntent(text);
  if (!target || /(\u6d4f\u89c8\u5668|browser|\u7f51\u9875|website|\u7f51\u7ad9)$/i.test(target)) {
    return undefined;
  }
  if (/^(\u5de5\u4f5c\u533a|\u9879\u76ee|\u76ee\u5f55|\u6587\u4ef6\u5939|workspace|project|folder|directory)$/i.test(target)) {
    return /^(\u5de5\u4f5c\u533a|\u9879\u76ee|workspace|project)$/i.test(target) ? "." : undefined;
  }
  if (looksLikeLocalPathTarget(target)) {
    return cleanOpenTarget(target);
  }

  return undefined;
}

function isVaguePathOpenRequest(text: string): boolean {
  const trimmed = text.trim();
  if (/(\u5f53\u524d|\u8fd9\u4e2a|\u672c\u5730|\u5de5\u4f5c\u533a|\u9879\u76ee|current|this|local|workspace|project)/i.test(trimmed)) {
    return false;
  }
  if (/["'`\u201c\u2018]|[a-zA-Z]:\\|\\\\|\.{1,2}[\\/]|\/|\.[a-z0-9]{1,12}\b/i.test(trimmed)) {
    return false;
  }
  return /^(?:\u8bf7|\u8bf7\u4f60|\u5e2e\u6211|\u9ebb\u70e6|\u80fd\u4e0d\u80fd|\u53ef\u4ee5)?\s*(?:\u6253\u5f00|\u542f\u52a8|open|launch)\s*(?:\u6587\u4ef6\u76ee\u5f55|\u6587\u4ef6\u5939|\u76ee\u5f55|\u8def\u5f84|\u6587\u4ef6|folder|directory|path|file|files)\s*$/i.test(trimmed);
}

function looksLikeLocalPathTarget(target: string): boolean {
  return /^(?:\.{1,2}[\\/]|[\w .@-]+[\\/][\w .@\\/.-]+)$/i.test(target) || looksLikeLocalFileName(target);
}

function looksLikeLocalFileName(target: string): boolean {
  return /^[\w .@-]+\.(?:json|md|mdx|txt|ts|tsx|js|jsx|mjs|cjs|css|scss|html|vue|svelte|py|rs|go|java|c|cc|cpp|h|hpp|cs|php|rb|swift|kt|yml|yaml|toml|ini|env|lock|sql|sh|ps1|bat|cmd|gitignore|npmrc)$/i.test(target)
    || /^(?:readme|license|dockerfile|makefile|package-lock|pnpm-lock|yarn.lock)$/i.test(target);
}

function stripOpenIntent(text: string): string {
  return text
    .replace(/^(?:\u8bf7|\u8bf7\u4f60|\u5e2e\u6211|\u9ebb\u70e6|\u80fd\u4e0d\u80fd|\u53ef\u4ee5)?\s*/i, "")
    .replace(/(?:\u6253\u5f00|\u542f\u52a8|\u8bbf\u95ee|\u6d4f\u89c8|open|launch|visit|browse|go to)\s*/i, "")
    .replace(/^(?:\u4e00\u4e0b|\u8fd9\u4e2a|\u5f53\u524d|\u672c\u5730|\u6587\u4ef6|\u76ee\u5f55|\u6587\u4ef6\u5939|\u8def\u5f84|file|folder|directory|path)\s*/i, "")
    .trim();
}

function cleanOpenTarget(value: string): string {
  return value.trim().replace(/[\uff0c\u3002]+$/g, "").replace(/^["'`]+|["'`]+$/g, "");
}

function isBareUrlRequest(text: string, url: string): boolean {
  const remainder = text.replace(url, "").trim();
  return remainder.length <= 12 && !/(\u4fee\u6539|\u5b9e\u73b0|\u4fee\u590d|\u5206\u6790|\u4ee3\u7801|\u6587\u4ef6|\u9879\u76ee|git|diff|test|build|fix|implement|code)/i.test(text);
}

function appAlias(text: string): string | undefined {
  const aliases: Array<[RegExp, string]> = [
    [/vscode|visual studio code|\bcode\b/i, "code"],
    [/chrome|\u8c37\u6b4c\u6d4f\u89c8\u5668/i, "chrome"],
    [/edge|\u6d4f\u89c8\u5668|browser/i, "msedge"],
    [/notepad|\u8bb0\u4e8b\u672c/i, "notepad"],
    [/calculator|calc|\u8ba1\u7b97\u5668/i, "calc"],
    [/explorer|\u8d44\u6e90\u7ba1\u7406\u5668|\u6587\u4ef6\u7ba1\u7406\u5668/i, "explorer"],
    [/wechat|\u5fae\u4fe1/i, "wechat"],
    [/\bqq\b/i, "qq"],
    [/feishu|\u98de\u4e66|lark/i, "feishu"],
    [/dingtalk|\u9489\u9489/i, "dingtalk"],
    [/powershell/i, "powershell"],
    [/\bcmd\b|\u547d\u4ee4\u63d0\u793a\u7b26/i, "cmd"],
    [/terminal|windows terminal|\u7ec8\u7aef/i, "wt"]
  ];
  return aliases.find(([pattern]) => pattern.test(text))?.[1];
}

function isNetworkToolCall(toolName: string, args: Record<string, unknown>): boolean {
  if (toolName === "mcp_tool") {
    return true;
  }
  if (toolName === "desktop_open" && String(args.kind ?? "path") === "url") {
    return true;
  }
  return false;
}

function buildDecisionTrace(profile: AgentRunResult["profile"], route: ModelRoute, selectedToolNames: string[], context: BuiltContext, directReason?: string): string[] {
  const loadedSkillNames = getLoadedSkillNames(context);
  const domains = profile.domains?.length ? profile.domains.join(", ") : "general";
  const confidence = typeof profile.confidence === "number" ? `${Math.round(profile.confidence * 100)}%` : "n/a";
  const signals = profile.signals?.length ? profile.signals.join(", ") : "none";
  const gates = profile.qualityGates?.length ? profile.qualityGates.join(", ") : "grounded_answer, concise_final";
  const cache = context.budgetReport;
  return [
    `Intent: kind=${profile.kind}, domains=${domains}, complexity=${profile.complexity}/5, risk=${profile.risk}, confidence=${confidence}.`,
    `Signals: ${signals}.`,
    `Strategy: mode=${profile.executionMode ?? "inspect_first"}, contextPolicy=${profile.contextPolicy ?? "focused"}, qualityGates=${gates}.`,
    `Model route: model=${route.model}, thinking=${route.thinking}, maxTokens=${route.maxTokens}, source=${route.source || "auto"}.`,
    `Tool plan: ${selectedToolNames.join(", ") || "none"}.`,
    `Skill plan: ${loadedSkillNames.join(", ") || "none"}.`,
    `Context plan: items=${context.items.length}, used=${cache.usedTokens}/${cache.budgetTokens}, dynamicBudget=${cache.dynamicBudgetTokens}, cacheable=${cache.cacheablePrefixTokens ?? cache.stableTokens}, volatile=${cache.volatileTailTokens ?? cache.dynamicTokens}, projectedWarmHit=${Math.round((cache.projectedWarmCacheHitRate ?? cache.stableRatio) * 1000) / 10}%, target=${Math.round((cache.targetCacheHitRate ?? 0.991) * 1000) / 10}%, prefix=${cache.cacheablePrefixHash || cache.stablePrefixHash}, tail=${cache.dynamicTailHash}, compression=${cache.compressionLevel}, cacheStrategy=${cache.cacheStrategy}.`,
    directReason ? `Direct operation: ${directReason}` : "Execution path: standard Agent Loop."
  ];
}

function getLoadedSkillNames(context: BuiltContext): string[] {
  return context.items
    .filter((item) => item.type === "skill_body")
    .map((item) => item.content.match(/^Loaded skill \(([^)]+)\): ([^\n]+)/)?.[2] ?? item.id);
}

function buildDirectOperationContext(task: string, reason: string, selectedToolNames: string[], budgetTokens: number): BuiltContext {
  const systemContent = [
    "Prompt prefix version: direct-desktop-operation/v1",
    "This turn is a deterministic local desktop operation. Do not call the model unless the direct operation is ambiguous."
  ].join("\n");
  const userContent = `Current task:\n${task}\n\nDirect operation reason:\n${reason}`;
  const stableTokens = estimateTokens(systemContent);
  const dynamicTokens = estimateTokens(userContent);
  const usedTokens = stableTokens + dynamicTokens;
  return {
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent }
    ],
    items: [
      {
        id: "direct-desktop-operation",
        type: "tool_brief",
        stable: true,
        score: 10,
        tokens: stableTokens,
        content: systemContent
      },
      {
        id: "direct-task",
        type: "diagnostic",
        stable: false,
        score: 10,
        tokens: dynamicTokens,
        content: userContent
      }
    ],
    selectedToolNames,
    estimatedTokens: usedTokens,
    budgetReport: {
      budgetTokens,
      dynamicBudgetTokens: dynamicTokens,
      usedTokens,
      stableTokens,
      dynamicTokens,
      cacheablePrefixTokens: stableTokens,
      volatileTailTokens: dynamicTokens,
      compressedTokensSaved: 0,
      compressionLevel: "none",
      stablePrefixHash: hashText(systemContent),
      cacheablePrefixHash: hashText(systemContent),
      dynamicTailHash: hashText(userContent),
      itemCount: 2,
      droppedItemCount: 0,
      stableRatio: stableTokens / Math.max(1, usedTokens),
      targetCacheHitRate: 0.991,
      projectedWarmCacheHitRate: stableTokens / Math.max(1, usedTokens),
      minimumDynamicTokens: dynamicTokens,
      optionalDynamicTokens: 0,
      dynamicTokenCeilingForTarget: Math.max(0, Math.floor(stableTokens * (1 - 0.991) / 0.991)),
      dynamicTokensOverTarget: Math.max(0, dynamicTokens - Math.max(0, Math.floor(stableTokens * (1 - 0.991) / 0.991))),
      targetReachableWithoutPadding: dynamicTokens <= Math.max(0, Math.floor(stableTokens * (1 - 0.991) / 0.991)),
      stablePaddingTokensForTarget: Math.max(0, Math.ceil((dynamicTokens * 0.991 / (1 - 0.991)) - stableTokens)),
      cacheStrategy: "excellent",
      recommendations: ["Direct desktop operation skipped model tokens and avoided project context loading."]
    }
  };
}

function emptyUsageResult(
  content: string,
  route: ModelRoute,
  profile: AgentRunResult["profile"],
  context: BuiltContext,
  toolResults: ToolExecutionResult[],
  reasoning: string[],
  cost: CostPrecisionEngine
): AgentRunResult {
  return {
    content,
    route,
    profile,
    context,
    usage: [],
    toolResults,
    reasoning,
    completedFiles: extractCompletedFiles(toolResults),
    requestCache: cost.summarize([]),
    conversationCache: cost.summarize([])
  };
}

function appendQualityGateWarnings(reasoning: string[], check: { ok: boolean; warnings: string[] }): void {
  if (!check.ok) {
    reasoning.push(`Quality gates: ${check.warnings.join(" | ")}`);
  }
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function emitProgress(options: AgentRunOptions, event: AgentProgressEvent): Promise<void> {
  await options.onProgress?.(event);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("Agent run interrupted by user.");
    error.name = "AbortError";
    throw error;
  }
}

function withJsonInstruction(messages: AgentMessage[], responseFormat: string): AgentMessage[] {
  if (responseFormat !== "json_object") {
    return [...messages];
  }

  const jsonInstruction: AgentMessage = {
    role: "user",
    content: [
      "Return valid json only.",
      "Example JSON:",
      "{\"answer\":\"concise result\",\"confidence\":0.8,\"next_steps\":[]}"
    ].join("\n")
  };
  return [...messages, jsonInstruction];
}

function toolMessage(toolCallId: string, content: string): AgentMessage {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content
  };
}

function failure(message: string): ToolExecutionResult {
  return {
    ok: false,
    risk: "safe",
    content: message,
    summary: message
  };
}

function formatToolError(call: ToolCall, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/JSON|Unterminated string|Unexpected end|Unexpected token/i.test(message)) {
    return [
      `Tool call ${call.function.name} was not executed because its arguments were not valid JSON.`,
      `Parser error: ${message}`,
      "Retry with a complete JSON object using only the tool schema fields.",
      `Raw argument preview: ${call.function.arguments.slice(0, 600)}`
    ].join("\n");
  }
  return message;
}

function renderDryRun(route: unknown, profile: unknown, context: { selectedToolNames: string[]; estimatedTokens: number; budgetReport: unknown; items: Array<{ id: string; type: string; stable: boolean; score: number; tokens: number }> }): string {
  return JSON.stringify({
    route,
    profile,
    selectedTools: context.selectedToolNames,
    estimatedContextTokens: context.estimatedTokens,
    budgetReport: context.budgetReport,
    contextItems: context.items.map((item) => ({
      id: item.id,
      type: item.type,
      stable: item.stable,
      score: item.score,
      tokens: item.tokens
    }))
  }, null, 2);
}

export function extractCompletedFiles(results: ToolExecutionResult[]): string[] {
  const files = new Set<string>();
  for (const result of results) {
    if (!result.ok) {
      continue;
    }
    const metadata = result.metadata ?? {};
    const auditValue = metadata.audit;
    const hasAuditPaths = Array.isArray(auditValue) && auditValue.some((item) =>
      Boolean((item as { path?: unknown })?.path)
    );
    const explicitlyUnmodified = metadata.modified === false || metadata.checkOnly === true;
    const isModified = metadata.modified === true || (!explicitlyUnmodified && hasAuditPaths);
    if (!isModified) {
      continue;
    }
    const pathValue = metadata.path;
    if (typeof pathValue === "string") {
      files.add(pathValue);
    }
    const pathsValue = metadata.paths;
    if (Array.isArray(pathsValue)) {
      for (const item of pathsValue) {
        if (typeof item === "string") {
          files.add(item);
        }
      }
    }
    if (Array.isArray(auditValue)) {
      for (const item of auditValue) {
        const auditPath = (item as { path?: unknown })?.path;
        if (typeof auditPath === "string" && auditPath.trim()) {
          files.add(auditPath.trim());
        }
      }
    }
  }
  return [...files].sort();
}
