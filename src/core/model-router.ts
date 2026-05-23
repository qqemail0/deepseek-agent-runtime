import type { AgentConfig } from "../config/load-config.js";
import type { ModelRoute, TaskProfile } from "./types.js";

export class ModelRouter {
  constructor(private readonly config: AgentConfig) {}

  route(profile: TaskProfile): ModelRoute {
    const domains = new Set(profile.domains ?? []);

    if (profile.wantsJson) {
      return {
        model: profile.complexity >= 4 ? this.config.deepseek.proModel : this.config.deepseek.defaultModel,
        thinking: profile.complexity >= 3 ? "enabled" : "disabled",
        reasoningEffort: profile.complexity >= 4 ? "max" : "high",
        maxTokens: profile.complexity >= 4 ? 16_000 : 4_000,
        responseFormat: "json_object"
      };
    }

    if (!profile.needsTools && profile.kind === "chat") {
      const complexChat = profile.complexity >= 4;
      return {
        model: this.config.deepseek.defaultModel,
        thinking: complexChat ? "enabled" : "disabled",
        reasoningEffort: complexChat ? "high" : undefined,
        maxTokens: chatMaxTokens(profile, domains),
        responseFormat: "text"
      };
    }

    const needsDeepReasoning = profile.kind === "refactor"
      || (profile.complexity >= 5 && profile.kind !== "inspect" && (domains.has("agent") || domains.has("cache") || domains.has("tool")));

    if (needsDeepReasoning) {
      return {
        model: this.config.deepseek.proModel,
        thinking: "enabled",
        reasoningEffort: "max",
        maxTokens: profile.kind === "refactor" ? 24_000 : 18_000,
        responseFormat: "text"
      };
    }

    if (profile.complexity >= 3 || profile.needsTools) {
      return {
        model: this.config.deepseek.defaultModel,
        thinking: "enabled",
        reasoningEffort: "high",
        maxTokens: profile.kind === "inspect" ? 8_000 : 12_000,
        responseFormat: "text"
      };
    }

    return {
      model: this.config.deepseek.defaultModel,
      thinking: "disabled",
      maxTokens: 2_000,
      responseFormat: "text"
    };
  }
}

function chatMaxTokens(profile: TaskProfile, domains: Set<string>): number {
  if (profile.complexity >= 5) {
    return 8_000;
  }
  if (profile.complexity >= 4 || hasAnyDomain(domains, ["agent", "cache", "code", "skill", "tool"])) {
    return 6_000;
  }
  if (profile.complexity >= 3) {
    return 3_200;
  }
  return 2_000;
}

function hasAnyDomain(domains: Set<string>, values: string[]): boolean {
  return values.some((value) => domains.has(value));
}
