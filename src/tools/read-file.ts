import { promises as fs } from "node:fs";
import type { RegisteredTool } from "../core/types.js";
import { resolveInside } from "../utils/fs.js";
import { summarizeOutput } from "../utils/text.js";

export function createReadFileTool(): RegisteredTool {
  return {
    name: "read_file",
    description: "Read a UTF-8 text file from the workspace, optionally by line range.",
    risk: () => "safe",
    schema: {
      type: "function",
      function: {
        name: "read_file",
        description: "Read a UTF-8 text file from the workspace, optionally by line range.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Workspace-relative file path." },
            startLine: { type: "integer", description: "1-based start line. Use 1 if omitted." },
            maxLines: { type: "integer", description: "Maximum number of lines to return. Default 240." }
          },
          required: ["path"],
          additionalProperties: false
        }
      }
    },
    execute: async ({ args, cwd }) => {
      const filePath = resolveInside(cwd, String(args.path));
      const startLine = Math.max(1, Number(args.startLine ?? 1));
      const maxLines = Math.min(1000, Math.max(1, Number(args.maxLines ?? 240)));
      const text = await fs.readFile(filePath, "utf8");
      const lines = text.split(/\r?\n/);
      const selected = lines.slice(startLine - 1, startLine - 1 + maxLines);
      const numbered = selected.map((line, index) => `${startLine + index}: ${line}`).join("\n");
      return {
        ok: true,
        risk: "safe",
        content: numbered,
        summary: summarizeOutput(numbered, 1200),
        metadata: { path: args.path, startLine, returnedLines: selected.length, totalLines: lines.length }
      };
    }
  };
}
