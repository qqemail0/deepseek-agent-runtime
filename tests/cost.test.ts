import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/load-config.js";
import { CostPrecisionEngine, formatCostForDisplay, usdToCny } from "../src/core/cost-precision-engine.js";

describe("cost precision engine", () => {
  it("computes DeepSeek cache hit rate and cost", () => {
    const engine = new CostPrecisionEngine(defaultConfig);
    const usage = engine.usageFromResponse({
      model: "deepseek-v4-flash",
      thinking: "enabled",
      reasoningEffort: "high",
      maxTokens: 1000,
      responseFormat: "text"
    }, {
      message: { role: "assistant", content: "ok" },
      content: "ok",
      toolCalls: [],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 100,
        prompt_cache_hit_tokens: 700,
        prompt_cache_miss_tokens: 300
      }
    });

    expect(usage.cacheHitRate).toBeCloseTo(0.7);
    expect(usage.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("displays estimated cost in RMB while keeping the USD source value", () => {
    expect(usdToCny(0.001794)).toBeCloseTo(0.0121992);
    expect(formatCostForDisplay(0.001794)).toBe("RMB 0.0122 ($0.001794)");
  });

  it("grades cache health against the 99.1 percent target", () => {
    const engine = new CostPrecisionEngine(defaultConfig);
    const belowTarget = engine.cacheHealth([{
      model: "deepseek-v4-flash",
      inputTokens: 1000,
      outputTokens: 100,
      cacheHitTokens: 990,
      cacheMissTokens: 10,
      cacheHitRate: 0.99,
      estimatedCostUsd: 0.001
    }]);
    const atTarget = engine.cacheHealth([{
      model: "deepseek-v4-flash",
      inputTokens: 1000,
      outputTokens: 100,
      cacheHitTokens: 991,
      cacheMissTokens: 9,
      cacheHitRate: 0.991,
      estimatedCostUsd: 0.001
    }]);

    expect(belowTarget.grade).toBe("B");
    expect(atTarget.grade).toBe("A");
    expect(belowTarget.recommendations.join("\n")).toContain("99.1%");
  });
});
