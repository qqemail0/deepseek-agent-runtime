#!/usr/bin/env node
import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadConfig, type AgentConfig } from "../config/load-config.js";
import { AgentOrchestrator } from "../core/orchestrator.js";
import { CostPrecisionEngine } from "../core/cost-precision-engine.js";
import { DeepSeekProvider } from "../providers/deepseek-provider.js";
import { SkillLoader } from "../skills/skill-loader.js";
import type { AttachedContextFile, PermissionMode, ThinkingMode } from "../core/types.js";

const program = new Command();

interface SharedOptions {
  cwd: string;
  model?: string;
  thinking?: "auto" | ThinkingMode;
  apiBaseUrl?: string;
  apiKey?: string;
  network: boolean;
  compress: boolean;
  attach: string[];
  disableSkill: string[];
}

interface RunOptions extends SharedOptions {
  dryRun: boolean;
  yes: boolean;
  deny: boolean;
  fullAccess: boolean;
  maxTurns?: string;
  stream: boolean;
  progress: boolean;
  trace: boolean;
  json: boolean;
}

interface ChatOptions extends SharedOptions {
  yes: boolean;
  deny: boolean;
  fullAccess: boolean;
  maxTurns?: string;
  stream: boolean;
  progress: boolean;
  trace: boolean;
}

program
  .name("ds-agent")
  .description("DeepSeek-first local AI agent runtime")
  .version("0.1.0");

addSharedOptions(program
  .command("run")
  .argument("<task...>", "Task for the local agent")
  .option("--dry-run", "Build context and route without calling the model", false)
  .option("-y, --yes", "Auto-approve non-forbidden tools", false)
  .option("--deny", "Deny every non-safe tool", false)
  .option("--full-access", "Allow every tool except forbidden operations", false)
  .option("--max-turns <auto|number>", "Maximum agent loop turns, or auto for task-based routing")
  .option("--stream", "Stream model output as it arrives", true)
  .option("--no-stream", "Disable streaming and print only the final answer")
  .option("--progress", "Print agent progress to stderr", process.stderr.isTTY)
  .option("--no-progress", "Hide progress lines")
  .option("--trace", "Print reasoning trace, tool summaries, and cache recommendations", false)
  .option("--json", "Print a structured JSON result and disable streaming/progress", false))
  .action(async (taskParts: string[], options: RunOptions) => {
    const execution = await runCliAgent(taskParts.join(" "), options, { dryRun: options.dryRun });

    if (options.json) {
      console.log(JSON.stringify(toJsonResult(execution.result, execution.config, options.dryRun), null, 2));
      return;
    }

    printCliFinalContent(execution.result.content, execution.streamedText, execution.streamEnabled);
    printRunDiagnostics(execution.result, execution.config, options.dryRun, { trace: options.trace });
  });

addSharedOptions(program
  .command("chat")
  .description("Start an interactive CLI conversation with persistent in-session context")
  .option("-y, --yes", "Auto-approve non-forbidden tools", false)
  .option("--deny", "Deny every non-safe tool", false)
  .option("--full-access", "Allow every tool except forbidden operations", false)
  .option("--max-turns <auto|number>", "Maximum agent loop turns, or auto for task-based routing")
  .option("--stream", "Stream model output as it arrives", true)
  .option("--no-stream", "Disable streaming and print only the final answer")
  .option("--progress", "Print agent progress to stderr", process.stderr.isTTY)
  .option("--no-progress", "Hide progress lines")
  .option("--trace", "Print reasoning trace, tool summaries, and cache recommendations", false))
  .action(async (options: ChatOptions) => {
    await runCliChat(options);
  });

addSharedOptions(program
  .command("context")
  .argument("<task...>", "Task to classify and build context for"))
  .action(async (taskParts: string[], options: SharedOptions) => {
    const cwd = path.resolve(options.cwd);
    prepareApiKey(options.apiKey);
    const config = applyApiBaseURL(await loadConfig(cwd), options.apiBaseUrl);
    const orchestrator = new AgentOrchestrator(config);
    const result = await orchestrator.run({
      cwd,
      task: taskParts.join(" "),
      dryRun: true,
      modelOverride: normalizeModelOverride(options.model),
      thinkingOverride: normalizeThinkingOverride(options.thinking),
      disabledSkillPaths: options.disableSkill,
      attachedFiles: await readCliAttachments(options.attach),
      networkEnabled: options.network,
      autoCompressContext: options.compress
    });
    console.log(result.content);
    printRunDiagnostics(result, config, true);
  });

program
  .command("models")
  .description("List models from the configured DeepSeek-compatible API")
  .option("--cwd <path>", "Workspace directory", process.cwd())
  .option("--api-base-url <url>", "Custom DeepSeek-compatible base URL")
  .option("--api-key <key>", "API key for this command only")
  .action(async (options: Pick<SharedOptions, "cwd" | "apiBaseUrl" | "apiKey">) => {
    const cwd = path.resolve(options.cwd);
    prepareApiKey(options.apiKey);
    const provider = new DeepSeekProvider(applyApiBaseURL(await loadConfig(cwd), options.apiBaseUrl));
    const models = await provider.listModels();
    for (const model of models) {
      console.log(`${model.id}\t${model.ownedBy}`);
    }
  });

program
  .command("skills")
  .description("List or inspect project/global skills")
  .option("--cwd <path>", "Workspace directory", process.cwd())
  .option("--search <query>", "Filter skills by name, scope, or description")
  .option("--read <nameOrPath>", "Read one SKILL.md by name or path")
  .action(async (options: { cwd: string; search?: string; read?: string }) => {
    const cwd = path.resolve(options.cwd);
    const loader = new SkillLoader(cwd);
    if (options.read) {
      const target = options.read.trim();
      const skill = /[\\/]|SKILL\.md$/i.test(target)
        ? await loader.loadSkillByPath(path.resolve(target), 4000, { includeGlobal: true })
        : await loader.loadSkill(target, 4000, { includeGlobal: true });
      if (!skill) {
        throw new Error(`Skill not found: ${target}`);
      }
      console.log(`# ${skill.name} (${skill.scope})`);
      console.log(`Path: ${skill.path}`);
      console.log(`Description: ${skill.description}\n`);
      console.log(skill.body);
      return;
    }

    const query = options.search?.toLowerCase();
    const skills = (await loader.listSkills({ includeGlobal: true }))
      .filter((skill) => !query || `${skill.name} ${skill.scope} ${skill.description}`.toLowerCase().includes(query));
    for (const skill of skills) {
      console.log(`[${skill.scope}] ${skill.name}\t${skill.tokens} tokens\t${skill.description}`);
    }
  });

program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function addSharedOptions<T extends Command>(command: T): T {
  return command
    .option("--cwd <path>", "Workspace directory", process.cwd())
    .option("--model <id>", "Force a model id instead of auto routing")
    .option("--thinking <mode>", "Thinking mode: auto, enabled, disabled", "auto")
    .option("--api-base-url <url>", "Custom DeepSeek-compatible base URL")
    .option("--api-key <key>", "API key for this command only")
    .option("--network", "Allow network-capable tools and direct URL opens", true)
    .option("--no-network", "Disable network-capable operations")
    .option("--compress", "Enable automatic context compression", true)
    .option("--no-compress", "Disable automatic context compression")
    .option("--attach <path>", "Attach a text file to the request", collectOption, [])
    .option("--disable-skill <path>", "Disable a skill path for this request", collectOption, []) as T;
}

function collectOption(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function prepareApiKey(apiKey?: string): void {
  if (apiKey?.trim()) {
    process.env.DEEPSEEK_API_KEY = apiKey.trim();
  }
}

function applyApiBaseURL(config: AgentConfig, apiBaseURL?: string): AgentConfig {
  const normalized = apiBaseURL?.trim().replace(/\/+$/, "");
  if (!normalized) {
    return config;
  }
  return {
    ...config,
    deepseek: {
      ...config.deepseek,
      baseURL: normalized
    }
  };
}

function normalizeModelOverride(model?: string): string | undefined {
  const value = model?.trim();
  return value && value !== "auto" ? value : undefined;
}

function normalizeThinkingOverride(value?: "auto" | ThinkingMode): ThinkingMode | undefined {
  return value === "enabled" || value === "disabled" ? value : undefined;
}

function normalizeMaxTurnsOption(value?: string): number | "auto" | undefined {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return undefined;
  }
  if (text === "auto") {
    return "auto";
  }
  const numeric = Number(text);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 16 ? numeric : undefined;
}

async function runCliChat(options: ChatOptions): Promise<void> {
  const rl = createInterface({ input, output });
  const turns: Array<{ role: "user" | "assistant"; content: string }> = [];
  console.error("DeepSeek Agent CLI chat. Commands: /exit, /quit, /new");
  try {
    while (true) {
      const task = (await rl.question("> ")).trim();
      if (!task) {
        continue;
      }
      if (/^\/(?:exit|quit)$/i.test(task)) {
        break;
      }
      if (/^\/new$/i.test(task)) {
        turns.length = 0;
        console.error("[chat] context cleared");
        continue;
      }

      const execution = await runCliAgent(task, options, {
        conversationSummary: buildCliConversationSummary(turns),
        confirm: async (prompt) => /^y(?:es)?$/i.test((await rl.question(`${prompt}\nApprove? (y/N) `)).trim())
      });
      printCliFinalContent(execution.result.content, execution.streamedText, execution.streamEnabled);
      printRunDiagnostics(execution.result, execution.config, false, { trace: options.trace });
      turns.push({ role: "user", content: task }, { role: "assistant", content: execution.result.content });
      trimCliTurns(turns);
    }
  } finally {
    rl.close();
  }
}

async function runCliAgent(
  task: string,
  options: RunOptions | ChatOptions,
  runOptions: {
    dryRun?: boolean;
    conversationSummary?: string;
    confirm?: (prompt: string) => Promise<boolean>;
  } = {}
): Promise<{
  result: Awaited<ReturnType<AgentOrchestrator["run"]>>;
  config: AgentConfig;
  streamedText: string;
  streamEnabled: boolean;
}> {
  const cwd = path.resolve(options.cwd);
  prepareApiKey(options.apiKey);
  const config = applyApiBaseURL(await loadConfig(cwd), options.apiBaseUrl);
  const dryRun = Boolean(runOptions.dryRun);
  const permissionMode: PermissionMode = options.fullAccess ? "full_access" : options.yes ? "allow" : options.deny ? "deny" : config.permissionMode;
  const provider = dryRun ? undefined : new DeepSeekProvider(config);
  const orchestrator = new AgentOrchestrator(config, provider, runOptions.confirm ?? confirmPrompt);
  const jsonMode = "json" in options && Boolean(options.json);
  const streamEnabled = Boolean(options.stream !== false && !dryRun && !jsonMode);
  const progressEnabled = Boolean(options.progress && !jsonMode);
  let streamedText = "";
  const result = await orchestrator.run({
    cwd,
    task,
    dryRun,
    permissionMode,
    maxTurns: normalizeMaxTurnsOption(options.maxTurns) ?? "auto",
    modelOverride: normalizeModelOverride(options.model),
    thinkingOverride: normalizeThinkingOverride(options.thinking),
    conversationSummary: runOptions.conversationSummary,
    disabledSkillPaths: options.disableSkill,
    attachedFiles: await readCliAttachments(options.attach),
    networkEnabled: options.network,
    autoCompressContext: options.compress,
    onProgress: progressEnabled ? createCliProgressPrinter() : undefined,
    onStream: streamEnabled
      ? async (event) => {
        if (event.type !== "content" || !event.delta) {
          return;
        }
        streamedText += event.delta;
        process.stdout.write(event.delta);
      }
      : undefined
  });

  return { result, config, streamedText, streamEnabled };
}

async function readCliAttachments(paths: string[] = []): Promise<AttachedContextFile[]> {
  const files: AttachedContextFile[] = [];
  for (const filePath of paths.slice(0, 8)) {
    const resolved = path.resolve(filePath);
    const stat = await fs.stat(resolved);
    if (!stat.isFile() || stat.size > 2_000_000) {
      continue;
    }
    const buffer = await fs.readFile(resolved);
    if (buffer.includes(0)) {
      continue;
    }
    files.push({
      path: resolved,
      name: path.basename(resolved),
      size: stat.size,
      content: buffer.toString("utf8").slice(0, 80_000)
    });
  }
  return files;
}

function printCliFinalContent(content: string, streamedText: string, streamEnabled: boolean): void {
  const final = String(content || "");
  const streamed = String(streamedText || "");
  if (!streamEnabled || !streamed) {
    process.stdout.write(`${final}\n`);
    return;
  }
  if (final && final !== streamed) {
    if (final.startsWith(streamed)) {
      process.stdout.write(final.slice(streamed.length));
    } else if (!streamed.includes(final)) {
      process.stdout.write(`\n\n${final}`);
    }
  }
  if (!streamed.endsWith("\n")) {
    process.stdout.write("\n");
  }
}

function printRunDiagnostics(
  result: Awaited<ReturnType<AgentOrchestrator["run"]>>,
  config: AgentConfig,
  dryRun: boolean,
  options: { trace?: boolean } = {}
): void {
  console.error(`\n[route] ${result.route.model} | thinking=${result.route.thinking} | source=${result.route.source || "auto"}`);
  console.error(`[context] used=${result.context.budgetReport.usedTokens}, cacheable=${result.context.budgetReport.cacheablePrefixTokens}, volatile=${result.context.budgetReport.volatileTailTokens}, prefix=${result.context.budgetReport.cacheablePrefixHash || result.context.budgetReport.stablePrefixHash}`);
  const loadedSkills = result.context.items.filter((item) => item.type === "skill_body").map((item) => item.id);
  if (loadedSkills.length) {
    console.error(`[skills] ${loadedSkills.join(", ")}`);
  }
  if (result.completedFiles.length) {
    console.error(`[files] ${result.completedFiles.join(", ")}`);
  }
  if (result.toolResults.length) {
    const okCount = result.toolResults.filter((item) => item.ok).length;
    console.error(`[tools] ${okCount}/${result.toolResults.length} ok`);
  }
  if (!dryRun) {
    const cost = new CostPrecisionEngine(config);
    const cacheHealth = cost.cacheHealth(result.usage, result.context);
    console.error(`[cost] ${cost.formatUsageZh(result.usage)}`);
    console.error(`[cache] request ${(result.requestCache.cacheHitRate * 100).toFixed(1)}% (${result.requestCache.cacheHitTokens} hit / ${result.requestCache.cacheMissTokens} miss) | grade ${cacheHealth.grade}`);
    if (options.trace) {
      for (const recommendation of cacheHealth.recommendations) {
        console.error(`[cache-tip] ${recommendation}`);
      }
    }
  }
  if (options.trace) {
    if (result.reasoning.length) {
      console.error("\n[trace]");
      result.reasoning.forEach((item, index) => console.error(`${index + 1}. ${item}`));
    }
    if (result.toolResults.length) {
      console.error("\n[tool-results]");
      result.toolResults.forEach((item, index) => console.error(`${index + 1}. ${item.ok ? "ok" : "failed"} ${item.risk}: ${item.summary}`));
    }
  }
}

function createCliProgressPrinter(): (event: { stage: string; message: string; percent?: number }) => void {
  let last = "";
  return (event) => {
    const line = `[${event.stage}] ${event.percent ?? "-"}% ${event.message}`;
    if (line !== last) {
      console.error(line);
      last = line;
    }
  };
}

function toJsonResult(result: Awaited<ReturnType<AgentOrchestrator["run"]>>, config: AgentConfig, dryRun: boolean): Record<string, unknown> {
  const cost = new CostPrecisionEngine(config);
  return {
    content: result.content,
    route: result.route,
    profile: result.profile,
    dryRun,
    usage: result.usage,
    cost: dryRun ? undefined : cost.formatUsageZh(result.usage),
    requestCache: result.requestCache,
    conversationCache: result.conversationCache,
    cacheHealth: dryRun ? undefined : cost.cacheHealth(result.usage, result.context),
    completedFiles: result.completedFiles,
    tools: result.toolResults.map((item) => ({
      ok: item.ok,
      risk: item.risk,
      summary: item.summary,
      metadata: item.metadata
    })),
    context: {
      estimatedTokens: result.context.estimatedTokens,
      selectedToolNames: result.context.selectedToolNames,
      budgetReport: result.context.budgetReport,
      items: result.context.items.map((item) => ({
        id: item.id,
        type: item.type,
        stable: item.stable,
        score: item.score,
        tokens: item.tokens
      }))
    },
    reasoning: result.reasoning
  };
}

function buildCliConversationSummary(turns: Array<{ role: "user" | "assistant"; content: string }>): string {
  return turns
    .slice(-8)
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${compactCliText(turn.content, 700)}`)
    .join("\n");
}

function trimCliTurns(turns: Array<{ role: "user" | "assistant"; content: string }>): void {
  if (turns.length > 40) {
    turns.splice(0, turns.length - 40);
  }
}

function compactCliText(text: string, maxChars: number): string {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
}

async function confirmPrompt(prompt: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${prompt}\n`);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
