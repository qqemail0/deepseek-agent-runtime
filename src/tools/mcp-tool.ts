import type { RegisteredTool } from "../core/types.js";

export function createMcpTool(): RegisteredTool {
  return {
    name: "mcp_tool",
    description: "Placeholder for future MCP tool execution. Currently reports that MCP is not configured.",
    risk: () => "medium",
    schema: {
      type: "function",
      function: {
        name: "mcp_tool",
        description: "Placeholder for future MCP tool execution. Currently reports that MCP is not configured.",
        parameters: {
          type: "object",
          properties: {
            server: { type: "string", description: "MCP server name." },
            tool: { type: "string", description: "Tool name." },
            input: { type: "string", description: "Serialized JSON input." }
          },
          required: ["server", "tool", "input"],
          additionalProperties: false
        }
      }
    },
    execute: async () => ({
      ok: false,
      risk: "medium",
      content: "MCP execution is not implemented in this MVP.",
      summary: "MCP execution is not implemented in this MVP."
    })
  };
}
