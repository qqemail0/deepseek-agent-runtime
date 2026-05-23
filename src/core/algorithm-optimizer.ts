import type { ContextItem, TaskProfile } from "./types.js";
import { estimateTokens } from "../utils/text.js";

export class AlgorithmOptimizer {
  rankContextItems(task: string, items: ContextItem[]): ContextItem[] {
    const keywords = extractKeywords(task);
    return items
      .map((item) => ({
        ...item,
        score: item.score + relevanceScore(item.content, keywords) + typeBoost(item)
      }))
      .sort((a, b) => {
        if (a.stable !== b.stable) {
          return a.stable ? -1 : 1;
        }
        if (a.stable && b.stable) {
          const orderDelta = stableOrder(a) - stableOrder(b);
          return orderDelta || a.id.localeCompare(b.id);
        }
        return b.score - a.score;
      });
  }

  fitBudget(items: ContextItem[], budgetTokens: number): ContextItem[] {
    const selected: ContextItem[] = [];
    let used = 0;

    for (const item of items) {
      const tokens = item.tokens || estimateTokens(item.content);
      if (used + tokens > budgetTokens && !item.stable) {
        continue;
      }
      selected.push({ ...item, tokens });
      used += tokens;
      if (used >= budgetTokens) {
        break;
      }
    }

    return selected;
  }

  scoreFilePath(task: string, filePath: string): number {
    const keywords = extractKeywords(task);
    const loweredPath = filePath.toLowerCase();
    const loweredTask = task.toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      const loweredKeyword = keyword.toLowerCase();
      if (loweredKeyword.length >= 3 && loweredPath.includes(loweredKeyword)) {
        score += 8;
      }
    }

    if (/ui|desktop|electron|\u684c\u9762|\u754c\u9762|\u6c49\u5316|\u524d\u7aef/i.test(loweredTask) && /src\/desktop\/renderer\//.test(loweredPath)) {
      score += 28;
    }
    if (/token|cache|\u7f13\u5b58|\u547d\u4e2d|\u6210\u672c|\u4e0a\u4e0b\u6587/i.test(loweredTask) && /src\/core\/(context-manager|cost-precision-engine|algorithm-optimizer|model-router)\.ts/.test(loweredPath)) {
      score += 30;
    }
    if (/\u667a\u80fd|\u667a\u80fd\u5ea6|\u7cbe\u51c6|\u8def\u7531|\u8c03\u5ea6|agent|orchestrator|runtime|thinking|reasoning|model route|model-router/i.test(loweredTask)
      && /src\/core\/(orchestrator|algorithm-optimizer|context-manager|model-router|cost-precision-engine|types)\.ts/.test(loweredPath)) {
      score += 36;
    }
    if (/\u5de5\u5177|tool|shell|file|git|\u8c03\u7528|\u53bb\u91cd/i.test(loweredTask) && /(src\/tools\/|src\/core\/orchestrator\.ts)/.test(loweredPath)) {
      score += 22;
    }
    if (/skill|\u6280\u80fd/i.test(loweredTask) && /src\/skills\//.test(loweredPath)) {
      score += 20;
    }
    if (/\u914d\u7f6e|config|provider|deepseek|\u6a21\u578b|api/i.test(loweredTask) && /(src\/config\/|src\/providers\/|src\/core\/model-router\.ts)/.test(loweredPath)) {
      score += 18;
    }
    if (/\u5bf9\u8bdd|\u5386\u53f2|\u8fde\u7eed|stream|\u8f93\u51fa|\u601d\u8003/i.test(loweredTask) && /src\/desktop\/renderer\/app\.js|src\/core\/orchestrator\.ts|src\/providers\/deepseek-provider\.ts/.test(loweredPath)) {
      score += 24;
    }

    return score;
  }

  classifyTask(task: string): TaskProfile {
    const domains = new Set<NonNullable<TaskProfile["domains"]>[number]>();
    const signals: string[] = [];
    const match = (name: string, pattern: RegExp): boolean => {
      const matched = pattern.test(task);
      if (matched) {
        signals.push(name);
      }
      return matched;
    };

    const wantsJson = match("structured-output", /json\s*(output|format|object|schema)|schema|machine readable|\u7ed3\u6784\u5316/i);
    const edit = match("edit-intent", /\u4fee\u6539|\u7f16\u8f91|\u5b9e\u73b0|\u5f00\u53d1|\u4fee\u590d|\u91cd\u6784|\u5347\u7ea7|\u4f18\u5316|\u8fed\u4ee3|\u6dfb\u52a0|apply|patch|write|change|implement|fix|refactor|optimi[sz]e|upgrade/i);
    const debug = match("debug-intent", /\u62a5\u9519|\u9519\u8bef|debug|bug|fail|\u5931\u8d25|stack trace|exception/i);
    const git = match("git-intent", /\bgit\b|commit|diff|status|push|branch|\u5408\u5e76/i);
    const shell = match("shell-intent", /\u8fd0\u884c|\u6267\u884c\u547d\u4ee4|shell|terminal|npm|pnpm|yarn|pytest|vitest|test/i);
    const ui = match("ui-domain", /ui|ux|desktop|electron|\u684c\u9762|\u754c\u9762|\u6c49\u5316|\u5bf9\u8bdd\u6846|\u524d\u7aef/i);
    const cache = match("cache-domain", /token|cache|\u7f13\u5b58|\u547d\u4e2d|\u6210\u672c|\u538b\u7f29|\u4e0a\u4e0b\u6587/i);
    const agent = match("agent-domain", /\u667a\u80fd|\u667a\u80fd\u5ea6|\u667a\u80fd\u4f53|\u7b97\u6cd5|\u5bf9\u6807|agent|claude|orchestrator|runtime|thinking|reasoning|\u8def\u7531|\u8c03\u5ea6|\u6a21\u578b\u9009\u62e9|\u5de5\u5177\u8c03\u7528|\u7cbe\u51c6/i);
    const skill = match("skill-domain", /skill|\u6280\u80fd/i);
    const tool = match("tool-domain", /\u5de5\u5177|tool|mcp|\u6743\u9650|\u8c03\u7528|\u7535\u8111\u64cd\u4f5c|\u63a7\u5236\u7535\u8111/i);
    const web = match("web-domain", /\u8054\u7f51|web|browser|url|http|\u6d4f\u89c8\u5668|\u641c\u7d22/i);
    const projectOrCode = match("project-code-scope", /\u6587\u4ef6|\u9879\u76ee|\u4ee3\u7801|repo|workspace|src\/|package\.json|readme/i);
    const multiFile = match("multi-file-scope", /\u591a\u6587\u4ef6|\u67b6\u6784|\u7b97\u6cd5|runtime|framework|\u6846\u67b6|\u7cfb\u7edf|\u91cd\u6784|\u684c\u9762|desktop|ui|orchestrator|provider|context manager|model router/i);
    const dangerous = match("dangerous-operation", /\brm\b|\u5220\u9664|\u683c\u5f0f\u5316|format all|push|deploy|release/i);

    if (agent) domains.add("agent");
    if (cache) domains.add("cache");
    if (ui) domains.add("ui");
    if (git) domains.add("git");
    if (shell) domains.add("shell");
    if (skill) domains.add("skill");
    if (tool) domains.add("tool");
    if (web) domains.add("web");
    if (/desktop|electron|\u684c\u9762|\u63a7\u5236\u7535\u8111|\u7535\u8111\u64cd\u4f5c/i.test(task)) domains.add("desktop");
    if (projectOrCode || edit || debug || multiFile) domains.add("code");

    let kind: TaskProfile["kind"] = "chat";
    if (debug) kind = "debug";
    else if (/\u91cd\u6784|refactor/i.test(task)) kind = "refactor";
    else if (edit) kind = "edit";
    else if (git) kind = "git";
    else if (shell) kind = "shell";
    else if (/\u8bfb\u53d6|\u67e5\u770b|\u5206\u6790|inspect|read|search|find/i.test(task)) kind = "inspect";

    const complexityScore = Math.min(5, Math.max(1,
      (multiFile ? 5 : edit || debug ? 4 : shell || git ? 3 : kind === "inspect" ? 2 : 1)
      + (agent && edit ? 1 : 0)
      + (cache && agent ? 1 : 0)
      + (wantsJson && kind !== "chat" ? 1 : 0)
    ));
    const needsTools = kind !== "chat" || /\u6587\u4ef6|\u9879\u76ee|\u4ee3\u7801|\u684c\u9762|\u754c\u9762|ui|repo|workspace|\u76ee\u5f55/i.test(task);
    const risk = dangerous ? "high" : edit ? "medium" : shell || git ? "low" : "safe";
    const confidence = Math.min(0.98, 0.48 + signals.length * 0.07 + (kind !== "chat" ? 0.1 : 0) + (domains.size ? 0.08 : 0));
    const executionMode = chooseExecutionMode(kind, complexityScore, needsTools, domains);
    const contextPolicy = chooseContextPolicy(kind, complexityScore, domains, needsTools);
    const qualityGates = chooseQualityGates(kind, risk, needsTools, domains);
    return {
      kind,
      complexity: complexityScore as TaskProfile["complexity"],
      risk,
      needsTools,
      wantsJson,
      domains: [...domains],
      confidence: Number(confidence.toFixed(2)),
      signals: [...new Set([...signals, `strategy:${executionMode}`, `context:${contextPolicy}`])],
      executionMode,
      contextPolicy,
      qualityGates
    };
  }
}

function chooseExecutionMode(
  kind: TaskProfile["kind"],
  complexity: number,
  needsTools: boolean,
  domains: Set<NonNullable<TaskProfile["domains"]>[number]>
): NonNullable<TaskProfile["executionMode"]> {
  if (!needsTools && kind === "chat") {
    return "answer_direct";
  }
  if (kind === "edit" || kind === "debug" || kind === "refactor") {
    return "edit_verify";
  }
  if (domains.has("web") || complexity >= 5) {
    return "deep_research";
  }
  if (kind === "shell") {
    return "operate_direct";
  }
  return "inspect_first";
}

function chooseContextPolicy(
  kind: TaskProfile["kind"],
  complexity: number,
  domains: Set<NonNullable<TaskProfile["domains"]>[number]>,
  needsTools: boolean
): NonNullable<TaskProfile["contextPolicy"]> {
  if (!needsTools && kind === "chat") {
    return "minimal";
  }
  if (kind === "refactor" || complexity >= 5) {
    return "broad";
  }
  if (kind === "edit" || kind === "debug" || domains.has("agent") || domains.has("cache") || domains.has("tool")) {
    return "evidence_first";
  }
  return "focused";
}

function chooseQualityGates(
  kind: TaskProfile["kind"],
  risk: TaskProfile["risk"],
  needsTools: boolean,
  domains: Set<NonNullable<TaskProfile["domains"]>[number]>
): NonNullable<TaskProfile["qualityGates"]> {
  const gates = new Set<NonNullable<TaskProfile["qualityGates"]>[number]>([
    "grounded_answer",
    "concise_final",
    "no_unverified_claims"
  ]);

  if (needsTools) {
    gates.add("tool_evidence");
  }
  if (kind === "edit" || kind === "debug" || kind === "refactor") {
    gates.add("verify_changes");
  }
  if (risk === "medium" || risk === "high" || risk === "forbidden" || domains.has("desktop") || domains.has("shell")) {
    gates.add("risk_check");
  }

  return [...gates];
}

function relevanceScore(content: string, keywords: string[]): number {
  const lowered = content.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (keyword.length < 3) {
      continue;
    }
    if (lowered.includes(keyword.toLowerCase())) {
      score += 2;
    }
  }
  return score;
}

function typeBoost(item: ContextItem): number {
  if (item.type === "diff") return 8;
  if (item.type === "skill_body") return 6;
  if (item.type === "file") return 4;
  if (item.type === "project") return 3;
  if (item.type === "diagnostic") return 2;
  return 1;
}

function stableOrder(item: ContextItem): number {
  const order: Record<ContextItem["type"], number> = {
    rule: 10,
    tool_brief: 20,
    skill_summary: 30,
    skill_body: 40,
    project: 50,
    history: 60,
    file: 70,
    diff: 80,
    shell: 90,
    diagnostic: 100
  };
  return order[item.type] ?? 999;
}

function extractKeywords(text: string): string[] {
  const tokens = text.split(/[^a-z0-9_\u3400-\u9fff./-]+/i).filter(Boolean);
  const semanticTerms = [
    "agent",
    "orchestrator",
    "runtime",
    "context",
    "model",
    "router",
    "thinking",
    "reasoning",
    "cache",
    "token",
    "tool",
    "skill",
    "\u667a\u80fd",
    "\u667a\u80fd\u5ea6",
    "\u8def\u7531",
    "\u4e0a\u4e0b\u6587",
    "\u7f13\u5b58",
    "\u547d\u4e2d",
    "\u5de5\u5177",
    "\u6280\u80fd",
    "\u6a21\u578b",
    "\u601d\u8003"
  ].filter((term) => text.toLowerCase().includes(term.toLowerCase()));

  return [...new Set([...tokens, ...semanticTerms])];
}
