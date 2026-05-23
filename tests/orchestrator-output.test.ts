import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/load-config.js";
import { AgentOrchestrator, extractCompletedFiles, resolveAgentMaxTurns } from "../src/core/orchestrator.js";
import type { AgentStreamEvent, ModelProvider } from "../src/core/types.js";

describe("orchestrator output continuity", () => {
  it("continues automatically when the model stops because of length", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ds-agent-output-"));
    const deltas: AgentStreamEvent[] = [];
    let calls = 0;
    const provider: ModelProvider = {
      complete: async (request) => {
        calls += 1;
        const content = calls === 1 ? "第一段，" : "第二段。";
        await request.onStream?.({ type: "content", delta: content, turn: request.turn ?? 0 });
        return {
          message: { role: "assistant", content },
          content,
          toolCalls: [],
          finishReason: calls === 1 ? "length" : "stop",
          usage: {
            prompt_tokens: 100,
            completion_tokens: 20,
            prompt_cache_hit_tokens: 80,
            prompt_cache_miss_tokens: 20
          }
        };
      }
    };

    try {
      await writeFile(path.join(cwd, "README.md"), "# Demo\n", "utf8");
      const result = await new AgentOrchestrator(defaultConfig, provider).run({
        cwd,
        task: "输出一个较长的连续回答",
        maxTurns: 3,
        onStream: (event) => {
          deltas.push(event);
        }
      });

      expect(calls).toBe(2);
      expect(result.content).toBe("第一段，第二段。");
      expect(deltas.map((event) => event.delta).join("")).toBe("第一段，第二段。");
      expect(result.reasoning.some((item) => item.includes("finish_reason=length"))).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("uses larger automatic turn budgets for complex tool work", () => {
    const route = {
      model: "deepseek-v4-pro",
      thinking: "enabled" as const,
      reasoningEffort: "max" as const,
      maxTokens: 8192,
      responseFormat: "text" as const,
      source: "auto" as const
    };
    const maxTurns = resolveAgentMaxTurns("auto", 8, {
      kind: "refactor",
      complexity: 5,
      risk: "medium",
      needsTools: true,
      wantsJson: false,
      domains: ["agent", "desktop", "tool"]
    }, route, 4);

    expect(maxTurns).toBe(16);
  });

  it("extracts completed files from write metadata and audit records only", () => {
    const files = extractCompletedFiles([
      {
        ok: true,
        risk: "safe",
        content: "read",
        summary: "read",
        metadata: { path: "README.md" }
      },
      {
        ok: true,
        risk: "medium",
        content: "wrote",
        summary: "wrote",
        metadata: {
          modified: true,
          path: "src/app.ts",
          audit: [{ path: "src/app.ts", added: 4, removed: 1 }]
        }
      },
      {
        ok: true,
        risk: "medium",
        content: "checked",
        summary: "checked",
        metadata: {
          modified: false,
          checkOnly: true,
          paths: ["src/check-only.ts"],
          audit: [{ path: "src/check-only.ts", added: 2, removed: 0 }]
        }
      }
    ]);

    expect(files).toEqual(["src/app.ts"]);
  });

  it("synthesizes a final answer instead of exposing the raw max-turn stop text", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ds-agent-max-turns-"));
    let calls = 0;
    const provider: ModelProvider = {
      complete: async (request) => {
        calls += 1;
        if (calls === 1) {
          return {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{
                id: "tool-1",
                type: "function",
                function: { name: "unknown_tool", arguments: "{}" }
              }]
            },
            content: "",
            toolCalls: [{
              id: "tool-1",
              type: "function",
              function: { name: "unknown_tool", arguments: "{}" }
            }],
            finishReason: "tool_calls",
            usage: {
              prompt_tokens: 90,
              completion_tokens: 8,
              prompt_cache_hit_tokens: 60,
              prompt_cache_miss_tokens: 30
            }
          };
        }
        expect(request.tools).toEqual([]);
        return {
          message: { role: "assistant", content: "Final synthesized answer." },
          content: "Final synthesized answer.",
          toolCalls: [],
          finishReason: "stop",
          usage: {
            prompt_tokens: 110,
            completion_tokens: 12,
            prompt_cache_hit_tokens: 90,
            prompt_cache_miss_tokens: 20
          }
        };
      }
    };

    try {
      await writeFile(path.join(cwd, "README.md"), "# Demo\n", "utf8");
      const result = await new AgentOrchestrator(defaultConfig, provider).run({
        cwd,
        task: "Inspect the project with tools and summarize.",
        maxTurns: 1
      });

      expect(calls).toBe(2);
      expect(result.content).toBe("Final synthesized answer.");
      expect(result.content).not.toContain("Agent loop stopped");
      expect(result.reasoning.some((item) => item.includes("requesting final synthesis"))).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("preserves assistant text emitted before a tool call when the loop needs final synthesis", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ds-agent-pre-tool-text-"));
    let calls = 0;
    const provider: ModelProvider = {
      complete: async (request) => {
        calls += 1;
        if (calls === 1) {
          return {
            message: {
              role: "assistant",
              content: "Pre-tool observation.\n\n",
              tool_calls: [{
                id: "tool-1",
                type: "function",
                function: { name: "unknown_tool", arguments: "{}" }
              }]
            },
            content: "Pre-tool observation.\n\n",
            toolCalls: [{
              id: "tool-1",
              type: "function",
              function: { name: "unknown_tool", arguments: "{}" }
            }],
            finishReason: "tool_calls",
            usage: {
              prompt_tokens: 90,
              completion_tokens: 8,
              prompt_cache_hit_tokens: 60,
              prompt_cache_miss_tokens: 30
            }
          };
        }
        return {
          message: { role: "assistant", content: "Final synthesized answer." },
          content: "Final synthesized answer.",
          toolCalls: [],
          finishReason: "stop",
          usage: {
            prompt_tokens: 110,
            completion_tokens: 12,
            prompt_cache_hit_tokens: 90,
            prompt_cache_miss_tokens: 20
          }
        };
      }
    };

    try {
      await writeFile(path.join(cwd, "README.md"), "# Demo\n", "utf8");
      const result = await new AgentOrchestrator(defaultConfig, provider).run({
        cwd,
        task: "Inspect the project with tools and summarize.",
        maxTurns: 1
      });

      expect(calls).toBe(2);
      expect(result.content).toBe("Pre-tool observation.\n\nFinal synthesized answer.");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("records quality gate warnings when tool-backed tasks skip evidence", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ds-agent-quality-gates-"));
    const provider: ModelProvider = {
      complete: async () => ({
        message: { role: "assistant", content: "Summary without inspecting files." },
        content: "Summary without inspecting files.",
        toolCalls: [],
        finishReason: "stop",
        usage: {
          prompt_tokens: 100,
          completion_tokens: 12,
          prompt_cache_hit_tokens: 70,
          prompt_cache_miss_tokens: 30
        }
      })
    };

    try {
      await writeFile(path.join(cwd, "README.md"), "# Demo\n", "utf8");
      const result = await new AgentOrchestrator(defaultConfig, provider).run({
        cwd,
        task: "Inspect the project files and summarize the architecture.",
        maxTurns: 1
      });

      expect(result.reasoning.some((item) => item.includes("Strategy:"))).toBe(true);
      expect(result.reasoning.some((item) => item.includes("Quality gates:") && item.includes("no tool result was used"))).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
