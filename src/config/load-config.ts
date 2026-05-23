import { promises as fs } from "node:fs";
import path from "node:path";
import type { PermissionMode } from "../core/types.js";
import { pathExists } from "../utils/fs.js";

export interface AgentConfig {
  provider: "deepseek";
  workspaceRoot: string;
  permissionMode: PermissionMode;
  maxAgentTurns: number;
  maxToolOutputTokens: number;
  contextBudgetTokens: number;
  deepseek: {
    baseURL: string;
    apiKeyEnv: string;
    defaultModel: string;
    proModel: string;
    strictTools: boolean;
    pricesPerMillion: Record<string, {
      cacheHitInput: number;
      cacheMissInput: number;
      output: number;
    }>;
  };
}

export const defaultConfig: AgentConfig = {
  provider: "deepseek",
  workspaceRoot: ".",
  permissionMode: "ask",
  maxAgentTurns: 8,
  maxToolOutputTokens: 1800,
  contextBudgetTokens: 32000,
  deepseek: {
    baseURL: "https://api.deepseek.com",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-flash",
    proModel: "deepseek-v4-pro",
    strictTools: false,
    pricesPerMillion: {
      "deepseek-v4-flash": {
        cacheHitInput: 0.0028,
        cacheMissInput: 0.14,
        output: 0.28
      },
      "deepseek-v4-pro": {
        cacheHitInput: 0.003625,
        cacheMissInput: 0.435,
        output: 0.87
      }
    }
  }
};

export async function loadConfig(cwd: string): Promise<AgentConfig> {
  const configPath = path.join(cwd, ".agent", "config.json");
  if (!(await pathExists(configPath))) {
    return { ...defaultConfig, workspaceRoot: cwd };
  }

  const parsed = JSON.parse(await fs.readFile(configPath, "utf8")) as Partial<AgentConfig>;
  const merged: AgentConfig = {
    ...defaultConfig,
    ...parsed,
    workspaceRoot: path.resolve(cwd, parsed.workspaceRoot ?? defaultConfig.workspaceRoot),
    deepseek: {
      ...defaultConfig.deepseek,
      ...(parsed.deepseek ?? {}),
      pricesPerMillion: {
        ...defaultConfig.deepseek.pricesPerMillion,
        ...(parsed.deepseek?.pricesPerMillion ?? {})
      }
    }
  };

  return merged;
}
