import { describe, expect, it } from "vitest";
import { PermissionManager } from "../src/core/permission-manager.js";
import type { RegisteredTool, ToolCall } from "../src/core/types.js";

const shellTool: RegisteredTool = {
  name: "run_shell",
  description: "test",
  risk: () => "high",
  schema: {
    type: "function",
    function: {
      name: "run_shell",
      description: "test",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false }
    }
  },
  execute: async () => ({ ok: true, risk: "high", content: "", summary: "" })
};

const call: ToolCall = {
  id: "1",
  type: "function",
  function: { name: "run_shell", arguments: "{\"command\":\"git push\"}" }
};

describe("permission manager", () => {
  it("denies high risk tools in deny mode", async () => {
    const manager = new PermissionManager({ mode: "deny" });
    const decision = await manager.check(shellTool, call);
    expect(decision.allowed).toBe(false);
  });

  it("asks for high risk tools in ask mode", async () => {
    const manager = new PermissionManager({ mode: "ask", confirm: async () => true });
    const decision = await manager.check(shellTool, call);
    expect(decision.allowed).toBe(true);
  });

  it("auto-approves high risk tools in full access mode", async () => {
    const manager = new PermissionManager({ mode: "full_access" });
    const decision = await manager.check(shellTool, call);
    expect(decision.allowed).toBe(true);
  });
});
