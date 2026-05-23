import type { AgentConfig } from "../config/load-config.js";
import type { BuiltContext, CacheHealthReport, CacheRateSnapshot, ModelRoute, ModelResponse, ToolExecutionResult, UsageRecord } from "./types.js";

const DEFAULT_USD_TO_CNY_RATE = 6.8;

export class CostPrecisionEngine {
  constructor(private readonly config: AgentConfig) {}

  usageFromResponse(route: ModelRoute, response: ModelResponse): UsageRecord {
    const usage = response.usage ?? {};
    const cacheHitTokens = Number(usage.prompt_cache_hit_tokens ?? 0);
    const cacheMissTokens = Number(usage.prompt_cache_miss_tokens ?? Math.max(0, Number(usage.prompt_tokens ?? 0) - cacheHitTokens));
    const inputTokens = Number(usage.prompt_tokens ?? cacheHitTokens + cacheMissTokens);
    const outputTokens = Number(usage.completion_tokens ?? 0);
    const denominator = cacheHitTokens + cacheMissTokens;
    const cacheHitRate = denominator > 0 ? cacheHitTokens / denominator : 0;
    const prices = this.config.deepseek.pricesPerMillion[route.model] ?? this.config.deepseek.pricesPerMillion[this.config.deepseek.defaultModel];
    const estimatedCostUsd = prices
      ? (cacheHitTokens * prices.cacheHitInput + cacheMissTokens * prices.cacheMissInput + outputTokens * prices.output) / 1_000_000
      : 0;

    return {
      model: route.model,
      inputTokens,
      outputTokens,
      cacheHitTokens,
      cacheMissTokens,
      cacheHitRate,
      estimatedCostUsd
    };
  }

  finalSelfCheck(content: string, context: BuiltContext, toolResults: ToolExecutionResult[]): { ok: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const qualityGates = extractQualityGates(context);
    if (!content.trim()) {
      warnings.push("Empty final answer.");
    }
    if ((qualityGates.has("tool_evidence") || context.selectedToolNames.length > 0) && context.selectedToolNames.length && !toolResults.length) {
      warnings.push("Tools were available but no tool result was used.");
    }
    if (qualityGates.has("tool_evidence") && toolResults.length && !toolResults.some((result) => result.ok)) {
      warnings.push("Tool evidence gate failed because all tool calls failed.");
    }
    const failedTools = toolResults.filter((result) => !result.ok);
    if (failedTools.length) {
      warnings.push(`${failedTools.length} tool call(s) failed; final answer should mention the limitation.`);
    }
    const modifiedFiles = toolResults.filter((result) => {
      const metadata = result.metadata ?? {};
      return result.ok && (metadata.modified === true || Array.isArray(metadata.audit));
    });
    if (qualityGates.has("verify_changes") && modifiedFiles.length) {
      const verifierNames = new Set(["run_shell", "git_diff", "git_status"]);
      const hasVerificationTool = toolResults.some((result) => {
        const operation = String(result.metadata?.operation ?? "");
        return verifierNames.has(operation);
      });
      const finalMentionsVerification = /\b(test|typecheck|build|verified|verification|git diff)\b|\u6d4b\u8bd5|\u6784\u5efa|\u9a8c\u8bc1|\u68c0\u67e5/i.test(content);
      if (!hasVerificationTool && !finalMentionsVerification) {
        warnings.push("Changed files were detected but no verification evidence was recorded.");
      }
    }
    if (/probably|maybe|guess|\u5927\u6982|\u53ef\u80fd/i.test(content) && !/\u4e0d\u786e\u5b9a|unknown|uncertain/i.test(content)) {
      warnings.push("Answer contains uncertainty language without marking uncertainty explicitly.");
    }
    if (content.length > 6000) {
      warnings.push("Final answer is long; consider compression.");
    }
    if (context.budgetReport.cacheStrategy === "needs_work" && context.budgetReport.dynamicTokensOverTarget > 0) {
      warnings.push("Cache gate: dynamic tail is above the 99.1% warm-cache target ceiling.");
    }

    return { ok: warnings.length === 0, warnings };
  }

  formatUsage(records: UsageRecord[]): string {
    if (!records.length) {
      return "usage unavailable";
    }

    const total = this.totalUsage(records);
    return [
      `input ${total.inputTokens}`,
      `output ${total.outputTokens}`,
      `cache hit ${total.cacheHitTokens}`,
      `miss ${total.cacheMissTokens}`,
      `hit rate ${(total.cacheHitRate * 100).toFixed(1)}%`,
      `est ${formatCostForDisplay(total.estimatedCostUsd)}`
    ].join(" | ");
  }

  formatUsageZh(records: UsageRecord[]): string {
    if (!records.length) {
      return "\u5c1a\u65e0\u7528\u91cf";
    }

    const total = this.totalUsage(records);
    return [
      `\u8f93\u5165 ${total.inputTokens}`,
      `\u8f93\u51fa ${total.outputTokens}`,
      `\u7f13\u5b58\u547d\u4e2d ${total.cacheHitTokens}`,
      `\u672a\u547d\u4e2d ${total.cacheMissTokens}`,
      `\u547d\u4e2d\u7387 ${(total.cacheHitRate * 100).toFixed(1)}%`,
      `\u9884\u4f30 ${formatCostForDisplay(total.estimatedCostUsd)}`
    ].join(" | ");
  }

  cacheHealth(records: UsageRecord[], context?: BuiltContext): CacheHealthReport {
    const total = this.totalUsage(records);
    const recommendations: string[] = [];

    if (!records.length) {
      recommendations.push("No model usage yet. Run a real DeepSeek request to observe cache hit tokens.");
    } else if (total.cacheHitRate < 0.55) {
      recommendations.push("Cache hit rate is low. First turns and changed prompts cannot reach 99.1%; keep the prefix stable and keep dynamic context small.");
    } else if (total.cacheHitRate < 0.85) {
      recommendations.push("Cache hit rate is moderate. Reduce volatile file snippets, command output, and broad tool schemas in the dynamic tail.");
    } else if (total.cacheHitRate < 0.991) {
      recommendations.push("Cache hit rate is high but below the 99.1% target. Only repeated turns with a large stable prefix and tiny dynamic tail can reach the target without padding.");
    } else {
      recommendations.push("Cache hit rate reached the 99.1% target. Preserve the current prefix order, model, and dynamic-tail budget.");
    }

    if (context?.budgetReport.cacheStrategy === "needs_work") {
      recommendations.push("Context budget report says the dynamic tail is too dominant; shorten snippets before the next request.");
    }
    if (context?.budgetReport.dynamicTokensOverTarget && context.budgetReport.dynamicTokensOverTarget > 0) {
      recommendations.push(`99.1% target overage: dynamic tail exceeds the projected ceiling by ${context.budgetReport.dynamicTokensOverTarget} estimated tokens. Use tools for evidence instead of preloading more context.`);
    }
    const cacheablePrefixHash = context?.budgetReport.cacheablePrefixHash || context?.budgetReport.stablePrefixHash;
    if (cacheablePrefixHash) {
      recommendations.push(`Stable prefix hash: ${cacheablePrefixHash}. It should stay unchanged for similar tasks.`);
    }

    return {
      ...total,
      grade: total.cacheHitRate >= 0.991 ? "A" : total.cacheHitRate >= 0.85 ? "B" : total.cacheHitRate >= 0.55 ? "C" : "D",
      recommendations
    };
  }

  summarize(records: UsageRecord[]): CacheRateSnapshot {
    const total = this.totalUsage(records);
    return {
      inputTokens: total.inputTokens,
      outputTokens: total.outputTokens,
      cacheHitTokens: total.cacheHitTokens,
      cacheMissTokens: total.cacheMissTokens,
      cacheHitRate: total.cacheHitRate,
      estimatedCostUsd: total.estimatedCostUsd
    };
  }

  private totalUsage(records: UsageRecord[]): UsageRecord {
    if (!records.length) {
      return {
        model: "none",
        inputTokens: 0,
        outputTokens: 0,
        cacheHitTokens: 0,
        cacheMissTokens: 0,
        cacheHitRate: 0,
        estimatedCostUsd: 0
      };
    }

    const total = records.reduce(
      (acc, item) => ({
        inputTokens: acc.inputTokens + item.inputTokens,
        outputTokens: acc.outputTokens + item.outputTokens,
        cacheHitTokens: acc.cacheHitTokens + item.cacheHitTokens,
        cacheMissTokens: acc.cacheMissTokens + item.cacheMissTokens,
        estimatedCostUsd: acc.estimatedCostUsd + item.estimatedCostUsd
      }),
      { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0, estimatedCostUsd: 0 }
    );

    const denominator = total.cacheHitTokens + total.cacheMissTokens;
    return {
      model: records.at(-1)?.model ?? "unknown",
      inputTokens: total.inputTokens,
      outputTokens: total.outputTokens,
      cacheHitTokens: total.cacheHitTokens,
      cacheMissTokens: total.cacheMissTokens,
      cacheHitRate: denominator ? total.cacheHitTokens / denominator : 0,
      estimatedCostUsd: total.estimatedCostUsd
    };
  }
}

function extractQualityGates(context: BuiltContext): Set<string> {
  const userMessage = context.messages.find((message) => message.role === "user")?.content ?? "";
  const match = String(userMessage).match(/qualityGates=([^\n]+)/);
  if (!match?.[1]) {
    return new Set();
  }
  return new Set(match[1].split(",").map((item) => item.trim()).filter(Boolean));
}

export function usdToCny(usd: number): number {
  return usd * DEFAULT_USD_TO_CNY_RATE;
}

export function formatCostForDisplay(estimatedCostUsd: number): string {
  const cny = usdToCny(estimatedCostUsd);
  const cnyText = cny < 0.01 ? cny.toFixed(6) : cny.toFixed(4);
  return `RMB ${cnyText} ($${estimatedCostUsd.toFixed(6)})`;
}
