import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/load-config.js";
import { AlgorithmOptimizer } from "../src/core/algorithm-optimizer.js";
import { ModelRouter } from "../src/core/model-router.js";

describe("model routing", () => {
  const optimizer = new AlgorithmOptimizer();
  const router = new ModelRouter(defaultConfig);

  it("uses flash without thinking for simple chat", () => {
    const profile = optimizer.classifyTask("解释一下 token 是什么");
    const route = router.route(profile);
    expect(route.model).toBe("deepseek-v4-flash");
    expect(route.thinking).toBe("disabled");
  });

  it("uses flash thinking for ordinary code inspection", () => {
    const profile = optimizer.classifyTask("分析这个项目的 package.json 和 README");
    const route = router.route(profile);
    expect(route.model).toBe("deepseek-v4-flash");
    expect(route.thinking).toBe("enabled");
    expect(route.reasoningEffort).toBe("high");
  });

  it("uses pro max for complex refactors", () => {
    const profile = optimizer.classifyTask("重构整个 runtime 架构，涉及多文件 orchestrator provider context manager");
    const route = router.route(profile);
    expect(route.model).toBe("deepseek-v4-pro");
    expect(route.thinking).toBe("enabled");
    expect(route.reasoningEffort).toBe("max");
  });

  it("routes desktop UI upgrades as tool-backed code work", () => {
    const profile = optimizer.classifyTask("\u5347\u7ea7\u684c\u9762 UI \u5e76\u4f18\u5316 token \u7f13\u5b58\u547d\u4e2d\u7387");
    const route = router.route(profile);
    expect(profile.needsTools).toBe(true);
    expect(profile.kind).toBe("edit");
    expect(route.thinking).toBe("enabled");
  });

  it("recognizes agent intelligence optimization as deep runtime work", () => {
    const profile = optimizer.classifyTask("优化它的智能度、工具调用、上下文选择和模型路由");
    const route = router.route(profile);
    expect(profile.kind).toBe("edit");
    expect(profile.domains).toEqual(expect.arrayContaining(["agent", "tool", "cache"]));
    expect(profile.confidence).toBeGreaterThan(0.75);
    expect(route.model).toBe("deepseek-v4-pro");
    expect(route.thinking).toBe("enabled");
  });

  it("adds Claude-like execution strategy gates for agent algorithm upgrades", () => {
    const profile = optimizer.classifyTask("Optimize the agent algorithms to match Claude Code quality");
    const route = router.route(profile);

    expect(profile.kind).toBe("edit");
    expect(profile.executionMode).toBe("edit_verify");
    expect(profile.contextPolicy).toBe("broad");
    expect(profile.qualityGates).toEqual(expect.arrayContaining(["grounded_answer", "tool_evidence", "verify_changes", "no_unverified_claims"]));
    expect(profile.signals).toEqual(expect.arrayContaining(["agent-domain", "strategy:edit_verify", "context:broad"]));
    expect(route.model).toBe("deepseek-v4-pro");
  });

  it("allocates a larger output budget for complex no-tool conversations", () => {
    const route = router.route({
      kind: "chat",
      complexity: 4,
      risk: "safe",
      needsTools: false,
      wantsJson: false,
      domains: ["agent", "cache"]
    });

    expect(route.thinking).toBe("enabled");
    expect(route.maxTokens).toBeGreaterThanOrEqual(6000);
  });
});
