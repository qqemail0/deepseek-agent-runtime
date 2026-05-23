import type { RegisteredTool } from "../core/types.js";
import { listFilesRecursive } from "../utils/fs.js";

export function createListFilesTool(): RegisteredTool {
  return {
    name: "list_files",
    description: "List workspace files while ignoring heavy generated directories.",
    risk: () => "safe",
    schema: {
      type: "function",
      function: {
        name: "list_files",
        description: "List workspace files while ignoring heavy generated directories.",
        parameters: {
          type: "object",
          properties: {
            maxFiles: { type: "integer", description: "Maximum files to return. Default 200." }
          },
          required: ["maxFiles"],
          additionalProperties: false
        }
      }
    },
    execute: async ({ args, cwd }) => {
      const maxFiles = Math.min(1000, Math.max(1, Number(args.maxFiles ?? 200)));
      const files = await listFilesRecursive(cwd, { maxFiles });
      const content = files.join("\n");
      return {
        ok: true,
        risk: "safe",
        content,
        summary: `Listed ${files.length} files.`,
        metadata: { count: files.length }
      };
    }
  };
}
