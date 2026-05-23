import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/load-config.js";
import { AlgorithmOptimizer } from "../src/core/algorithm-optimizer.js";
import { ContextManager } from "../src/core/context-manager.js";

describe("context manager", () => {
  it("builds a cache-aware budget report and selects relevant desktop files", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ds-agent-context-"));
    try {
      await mkdir(path.join(cwd, "src", "desktop", "renderer"), { recursive: true });
      await writeFile(path.join(cwd, "README.md"), "# Demo\n", "utf8");
      await writeFile(path.join(cwd, "src", "desktop", "renderer", "app.js"), "console.log('ui')\n", "utf8");

      const task = "upgrade the desktop UI and localize it";
      const profile = new AlgorithmOptimizer().classifyTask(task);
      const context = await new ContextManager(defaultConfig, cwd).build(task, profile, ["read_file"]);
      const userContent = String(context.messages[1]?.content);

      expect(context.budgetReport.stablePrefixHash).toHaveLength(16);
      expect(context.budgetReport.cacheablePrefixHash).toHaveLength(16);
      expect(context.budgetReport.usedTokens).toBeGreaterThan(0);
      expect(context.budgetReport.cacheablePrefixTokens).toBeGreaterThan(context.budgetReport.stableTokens);
      expect(context.budgetReport.volatileTailTokens).toBeGreaterThan(0);
      expect(context.budgetReport.compressionLevel).toMatch(/none|light|aggressive/);
      expect(context.budgetReport.compressedTokensSaved).toBeGreaterThanOrEqual(0);
      expect(context.items.some((item) => item.id.includes("src/desktop/renderer/app.js"))).toBe(true);
      expect(userContent).toContain("Reusable context:");
      expect(userContent.indexOf("Reusable context:")).toBeLessThan(userContent.indexOf("Current task:"));
      expect(userContent).toContain("Execution strategy:");
      expect(userContent).toContain("qualityGates=");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("injects compressed current conversation memory when provided", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ds-agent-memory-"));
    try {
      await writeFile(path.join(cwd, "README.md"), "# Demo\n", "utf8");
      const task = "continue the current task";
      const profile = new AlgorithmOptimizer().classifyTask(task);
      const context = await new ContextManager(defaultConfig, cwd).build(
        task,
        profile,
        ["read_file"],
        "User prefers desktop-first workflow. Previous result changed renderer layout."
      );

      expect(context.items.some((item) => item.id === "conversation-summary")).toBe(true);
      expect(context.budgetReport.usedTokens).toBeGreaterThan(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("uses a lightweight context path for daily chat", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ds-agent-chat-"));
    try {
      await writeFile(path.join(cwd, "README.md"), "# Demo\nThis should not be loaded for casual chat.\n", "utf8");
      const task = "hello, briefly introduce yourself";
      const profile = new AlgorithmOptimizer().classifyTask(task);
      const context = await new ContextManager(defaultConfig, cwd).build(task, profile, []);

      expect(profile.kind).toBe("chat");
      expect(context.items.some((item) => item.type === "project")).toBe(false);
      expect(context.items.some((item) => item.type === "skill_body")).toBe(false);
      expect(context.selectedToolNames).toEqual([]);
      expect(context.budgetReport.usedTokens).toBeLessThan(900);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("keeps the system prefix hash independent from project files", async () => {
    const cwdA = await mkdtemp(path.join(os.tmpdir(), "ds-agent-prefix-a-"));
    const cwdB = await mkdtemp(path.join(os.tmpdir(), "ds-agent-prefix-b-"));
    try {
      await writeFile(path.join(cwdA, "README.md"), "# Project A\n", "utf8");
      await writeFile(path.join(cwdA, "package.json"), "{\"name\":\"a\",\"scripts\":{\"test\":\"vitest\"}}", "utf8");
      await mkdir(path.join(cwdB, "src", "core"), { recursive: true });
      await writeFile(path.join(cwdB, "src", "core", "x.ts"), "export const x = 1;\n", "utf8");

      const task = "optimize token cache hit rate";
      const profile = new AlgorithmOptimizer().classifyTask(task);
      const first = await new ContextManager(defaultConfig, cwdA).build(task, profile, ["read_file"]);
      const second = await new ContextManager(defaultConfig, cwdB).build(task, profile, ["read_file"]);

      expect(first.budgetReport.stablePrefixHash).toBe(second.budgetReport.stablePrefixHash);
      expect(first.budgetReport.cacheablePrefixHash).not.toBe(second.budgetReport.cacheablePrefixHash);
      expect(first.items.some((item) => item.id === "project-summary" && item.stable)).toBe(true);
      expect(second.items.some((item) => item.id === "project-summary" && item.stable)).toBe(true);
    } finally {
      await rm(cwdA, { recursive: true, force: true });
      await rm(cwdB, { recursive: true, force: true });
    }
  });

  it("keeps project summary deterministic across task wording in the same workspace", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ds-agent-project-stable-"));
    try {
      await mkdir(path.join(cwd, "src", "core"), { recursive: true });
      await writeFile(path.join(cwd, "README.md"), "# Stable\n", "utf8");
      await writeFile(path.join(cwd, "package.json"), "{\"name\":\"stable\",\"scripts\":{\"test\":\"vitest\"}}", "utf8");
      await writeFile(path.join(cwd, "src", "core", "context-manager.ts"), "export const x = 1;\n", "utf8");

      const optimizer = new AlgorithmOptimizer();
      const first = await new ContextManager(defaultConfig, cwd).build("optimize cache hit rate", optimizer.classifyTask("optimize cache hit rate"), ["read_file"]);
      const second = await new ContextManager(defaultConfig, cwd).build("upgrade desktop UI", optimizer.classifyTask("upgrade desktop UI"), ["read_file"]);

      expect(first.items.find((item) => item.id === "project-summary")?.content)
        .toBe(second.items.find((item) => item.id === "project-summary")?.content);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("selects focused code excerpts for agent intelligence tasks", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ds-agent-focused-"));
    try {
      await mkdir(path.join(cwd, "src", "core"), { recursive: true });
      const headFiller = Array.from({ length: 70 }, (_, index) => `const headFiller${index} = ${index};`).join("\n");
      const tailFiller = Array.from({ length: 70 }, (_, index) => `const tailFiller${index} = ${index};`).join("\n");
      await writeFile(path.join(cwd, "src", "core", "algorithm-optimizer.ts"), [
        headFiller,
        "export class AlgorithmOptimizer {",
        "  classifyTask(task: string) {",
        "    return { kind: 'edit', complexity: 5 };",
        "  }",
        "}",
        tailFiller
      ].join("\n"), "utf8");

      const task = "optimize its intelligence and model routing";
      const profile = new AlgorithmOptimizer().classifyTask(task);
      const context = await new ContextManager(defaultConfig, cwd).build(task, profile, ["read_file"]);
      const focused = context.items.find((item) => item.id.includes("algorithm-optimizer.ts"));

      expect(focused?.content).toContain("Focused excerpt lines");
      expect(focused?.content).toContain("classifyTask");
      expect(focused?.content).not.toContain("const headFiller0");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("applies a lean volatile-tail budget for cache-targeted code tasks", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ds-agent-lean-cache-"));
    try {
      await mkdir(path.join(cwd, "src", "core"), { recursive: true });
      await writeFile(path.join(cwd, "package.json"), "{\"name\":\"lean-cache\",\"scripts\":{\"test\":\"vitest\",\"build\":\"tsc\"}}", "utf8");
      await writeFile(path.join(cwd, "src", "core", "context-manager.ts"), [
        "export class ContextManager {",
        "  buildBudgetReport() { return 'stablePrefix dynamicTail cacheHit'; }",
        "}",
        ...Array.from({ length: 260 }, (_, index) => `const noisyContextLine${index} = "token cache dynamic tail";`)
      ].join("\n"), "utf8");

      const task = "continue optimizing token cache hit rate and context dynamic tail";
      const profile = new AlgorithmOptimizer().classifyTask(task);
      const context = await new ContextManager(defaultConfig, cwd).build(task, profile, ["read_file", "search_text"]);

      expect(context.budgetReport.dynamicBudgetTokens).toBeLessThan(defaultConfig.contextBudgetTokens);
      expect(context.budgetReport.volatileTailTokens).toBeLessThan(900);
      expect(context.budgetReport.targetCacheHitRate).toBeCloseTo(0.991);
      expect(context.budgetReport.projectedWarmCacheHitRate).toBeGreaterThan(0);
      expect(context.budgetReport.dynamicTokenCeilingForTarget).toBeGreaterThanOrEqual(0);
      expect(context.budgetReport.minimumDynamicTokens).toBeGreaterThan(0);
      expect(context.budgetReport.optionalDynamicTokens).toBeLessThan(500);
      expect(context.budgetReport.targetReachableWithoutPadding).toBe(false);
      expect(context.budgetReport.stablePaddingTokensForTarget).toBeGreaterThan(0);
      expect(context.budgetReport.recommendations.join("\n")).toContain("not reachable without padding");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("reduces real prompt tokens by dropping excess attached context in auto-compress mode", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ds-agent-attachments-"));
    try {
      await writeFile(path.join(cwd, "README.md"), "# Demo\n", "utf8");
      const attachedFiles = Array.from({ length: 8 }, (_, index) => ({
        path: `attached-${index}.txt`,
        name: `attached-${index}.txt`,
        size: 20_000,
        content: Array.from({ length: 240 }, (_, line) => `attachment ${index} line ${line} cache token context`).join("\n")
      }));
      const task = "summarize these attachments";
      const profile = new AlgorithmOptimizer().classifyTask(task);
      const lean = await new ContextManager(defaultConfig, cwd).build(task, profile, [], { attachedFiles, autoCompressContext: true });
      const unbounded = await new ContextManager(defaultConfig, cwd).build(task, profile, [], { attachedFiles, autoCompressContext: false });

      expect(lean.estimatedTokens).toBeLessThan(unbounded.estimatedTokens);
      expect(lean.budgetReport.dynamicBudgetTokens).toBeLessThan(unbounded.budgetReport.dynamicBudgetTokens);
      expect(lean.items.length).toBeLessThan(unbounded.items.length);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
