import type { RegisteredTool, TaskProfile, ToolCall, ToolExecutionResult, ToolSchema } from "../core/types.js";
import type { AgentConfig } from "../config/load-config.js";
import { stableJson } from "../utils/text.js";
import { createHash } from "node:crypto";
import { createApplyPatchTool } from "./apply-patch.js";
import { createDesktopOpenTool } from "./desktop-open.js";
import { createGitDiffTool } from "./git-diff.js";
import { createGitStatusTool } from "./git-status.js";
import { createListFilesTool } from "./list-files.js";
import { createMcpTool } from "./mcp-tool.js";
import { createReadFileTool } from "./read-file.js";
import { createRunShellTool } from "./run-shell.js";
import { createSearchTextTool } from "./search-text.js";
import { createWriteFileTool } from "./write-file.js";

export class ToolRegistry {
  private readonly tools: Map<string, RegisteredTool>;

  constructor(private readonly config: AgentConfig) {
    const all = [
      createReadFileTool(),
      createListFilesTool(),
      createSearchTextTool(),
      createDesktopOpenTool(),
      createRunShellTool(config.maxToolOutputTokens),
      createWriteFileTool(),
      createApplyPatchTool(config.maxToolOutputTokens),
      createGitStatusTool(),
      createGitDiffTool(config.maxToolOutputTokens),
      createMcpTool()
    ];
    this.tools = new Map(all.map((tool) => [tool.name, tool]));
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  summaries(): Array<{ name: string; description: string }> {
    return [...this.tools.values()]
      .map((tool) => ({ name: tool.name, description: tool.description }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  selectToolNames(profile: TaskProfile, task: string): string[] {
    const lowered = task.toLowerCase();
    const names = new Set<string>();
    const asksForListing = /\u5217\u51fa|\u6587\u4ef6\u6811|\u76ee\u5f55\u7ed3\u6784|list files|tree|directory/i.test(task);

    if (shouldUseProjectInspectionTools(profile, task)) {
      names.add("search_text");
      names.add("read_file");
    }
    if (asksForListing) {
      names.add("list_files");
    }
    if (profile.kind === "debug" || profile.kind === "shell" || /\b(test|npm|pnpm|yarn|\u8fd0\u884c|\u6d4b\u8bd5|\u6784\u5efa)\b/i.test(task)) {
      names.add("run_shell");
    }
    if (/\u6253\u5f00|\u542f\u52a8|\u64cd\u4f5c\u7535\u8111|\u63a7\u5236\u7535\u8111|open|launch/i.test(task)) {
      names.add("desktop_open");
    }
    if (/\u64cd\u4f5c\u7535\u8111|\u63a7\u5236\u7535\u8111|control computer|operate computer/i.test(task)) {
      names.add("run_shell");
    }
    if (profile.kind === "edit" || profile.kind === "refactor" || /\u4fee\u6539|\u5b9e\u73b0|\u5f00\u53d1|fix|implement|patch/i.test(task)) {
      names.add("apply_patch");
      names.add("git_diff");
      if (/\u65b0\u5efa|\u521b\u5efa|create|write file/i.test(task)) {
        names.add("write_file");
      }
      if (/\bgit\b|status|\u72b6\u6001/i.test(task)) {
        names.add("git_status");
      }
    }
    if (profile.kind === "git" || /\bgit\b|diff|status/i.test(lowered)) {
      names.add("git_status");
      names.add("git_diff");
    }
    if (/mcp/i.test(task)) {
      names.add("mcp_tool");
    }

    return [...names];
  }

  schemas(names: string[]): ToolSchema[] {
    return names
      .map((name) => this.tools.get(name))
      .filter((tool): tool is RegisteredTool => Boolean(tool))
      .map((tool) => {
        const schema = structuredClone(tool.schema);
        if (this.config.deepseek.strictTools) {
          schema.function.strict = true;
          schema.function.parameters.required = Object.keys(schema.function.parameters.properties);
        }
        return schema;
      });
  }

  async execute(call: ToolCall, cwd: string): Promise<ToolExecutionResult> {
    const tool = this.tools.get(call.function.name);
    if (!tool) {
      return {
        ok: false,
        risk: "safe",
        content: `Unknown tool: ${call.function.name}`,
        summary: `Unknown tool: ${call.function.name}`
      };
    }

    const args = parseArguments(call.function.arguments);
    return tool.execute({ name: tool.name, args, cwd });
  }

  toolCallHash(call: ToolCall): string {
    try {
      return `${call.function.name}:${stableJson(parseArguments(call.function.arguments))}`;
    } catch {
      const rawHash = createHash("sha256").update(call.function.arguments || "").digest("hex").slice(0, 12);
      return `${call.function.name}:invalid-json:${rawHash}`;
    }
  }
}

function shouldUseProjectInspectionTools(profile: TaskProfile, task: string): boolean {
  if (isOpenOnlyIntent(task)) {
    return false;
  }
  if (["inspect", "edit", "debug", "refactor", "git", "shell"].includes(profile.kind)) {
    return true;
  }
  const domains = new Set(profile.domains ?? []);
  const projectDomains: Array<NonNullable<TaskProfile["domains"]>[number]> = ["agent", "cache", "code", "git", "skill", "tool", "ui"];
  if (projectDomains.some((domain) => domains.has(domain))) {
    return true;
  }
  return /read|inspect|analy[sz]e|search|find|code|repo|project|source|package\.json|readme|\u8bfb\u53d6|\u67e5\u770b|\u68c0\u67e5|\u5206\u6790|\u641c\u7d22|\u67e5\u627e|\u4ee3\u7801|\u9879\u76ee|\u6587\u4ef6\u5185\u5bb9/i.test(task);
}

function isOpenOnlyIntent(task: string): boolean {
  const text = task.trim();
  const hasOpenIntent = /\u6253\u5f00|\u542f\u52a8|\u8bbf\u95ee|\u6d4f\u89c8|open|launch/i.test(text);
  if (!hasOpenIntent) {
    return false;
  }
  return !/read|inspect|analy[sz]e|edit|fix|implement|patch|summari[sz]e|\u8bfb\u53d6|\u67e5\u770b|\u68c0\u67e5|\u5206\u6790|\u4fee\u6539|\u5b9e\u73b0|\u4fee\u590d|\u603b\u7ed3|\u5185\u5bb9/i.test(text);
}

export function parseArguments(raw: string): Record<string, unknown> {
  const normalized = normalizeToolArgumentJson(raw);
  if (!normalized.trim()) {
    return {};
  }
  const parsed = parseToolArgumentJson(normalized);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function parseToolArgumentJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const repaired = closeTruncatedJsonObject(raw);
    if (repaired !== raw) {
      try {
        return JSON.parse(repaired) as unknown;
      } catch {
        // Fall through to the clearer error below.
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid tool arguments JSON: ${message}`);
  }
}

function normalizeToolArgumentJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function closeTruncatedJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return trimmed;
  }

  let inString = false;
  let escaped = false;
  let objectDepth = 0;
  let arrayDepth = 0;
  for (const char of trimmed) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") objectDepth += 1;
    else if (char === "}") objectDepth -= 1;
    else if (char === "[") arrayDepth += 1;
    else if (char === "]") arrayDepth -= 1;
  }

  if (objectDepth <= 0 && arrayDepth <= 0 && !inString) {
    return trimmed;
  }

  let repaired = trimmed;
  if (inString) {
    repaired += "\"";
  }
  while (arrayDepth > 0) {
    repaired += "]";
    arrayDepth -= 1;
  }
  while (objectDepth > 0) {
    repaired += "}";
    objectDepth -= 1;
  }
  return repaired;
}
