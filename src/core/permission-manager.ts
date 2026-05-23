import type { PermissionDecision, PermissionMode, RegisteredTool, RiskLevel, ToolCall } from "./types.js";
import { parseArguments } from "../tools/tool-registry.js";

export interface PermissionManagerOptions {
  mode: PermissionMode;
  confirm?: (prompt: string) => Promise<boolean>;
}

export class PermissionManager {
  constructor(private readonly options: PermissionManagerOptions) {}

  async check(tool: RegisteredTool, call: ToolCall): Promise<PermissionDecision> {
    const args = parseArguments(call.function.arguments);
    const risk = tool.risk(args);
    const reason = `Tool ${tool.name} risk=${risk}`;

    if (risk === "forbidden") {
      return { allowed: false, risk, reason: `${reason}; forbidden by policy.` };
    }

    if (risk === "safe" || (risk === "low" && this.options.mode === "allow")) {
      return { allowed: true, risk, reason };
    }

    if (this.options.mode === "deny") {
      return { allowed: false, risk, reason: `${reason}; permission mode denies non-safe tools.` };
    }

    if (this.options.mode === "full_access") {
      return { allowed: true, risk, reason: `${reason}; full access mode auto-approved non-forbidden tool.` };
    }

    if (this.options.mode === "allow") {
      return { allowed: true, risk, reason: `${reason}; auto-approved.` };
    }

    if (risk === "low") {
      return { allowed: true, risk, reason: `${reason}; low-risk tools are allowed.` };
    }

    const approved = await this.options.confirm?.(formatPrompt(tool.name, risk, args));
    return {
      allowed: Boolean(approved),
      risk,
      reason: approved ? `${reason}; approved by user.` : `${reason}; rejected or no confirmation callback.`
    };
  }
}

function formatPrompt(toolName: string, risk: RiskLevel, args: Record<string, unknown>): string {
  return [
    `Approve ${risk}-risk tool call?`,
    `tool: ${toolName}`,
    `args: ${JSON.stringify(args, null, 2)}`,
    "Type y to approve: "
  ].join("\n");
}
