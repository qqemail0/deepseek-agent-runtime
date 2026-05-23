import { promises as fs } from "node:fs";
import path from "node:path";
import type { RegisteredTool } from "../core/types.js";
import { pathExists, resolveInside } from "../utils/fs.js";
import { summarizeOutput } from "../utils/text.js";

export function createWriteFileTool(): RegisteredTool {
  return {
    name: "write_file",
    description: "Create or overwrite a UTF-8 text file in the workspace. Prefer apply_patch for small edits.",
    risk: () => "medium",
    schema: {
      type: "function",
      function: {
        name: "write_file",
        description: "Create or overwrite a UTF-8 text file in the workspace. Prefer apply_patch for small edits.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Workspace-relative file path." },
            content: { type: "string", description: "Complete UTF-8 file content to write." },
            createDirs: { type: "boolean", description: "Create parent directories if missing. Default false." },
            overwrite: { type: "boolean", description: "Allow overwriting an existing file. Default false." }
          },
          required: ["path", "content"],
          additionalProperties: false
        }
      }
    },
    execute: async ({ args, cwd }) => {
      const target = resolveInside(cwd, String(args.path));
      const relativePath = String(args.path);
      const createDirs = Boolean(args.createDirs ?? false);
      const overwrite = Boolean(args.overwrite ?? false);
      const exists = await pathExists(target);
      const previous = exists ? await fs.readFile(target, "utf8") : "";
      const next = String(args.content);

      if (exists && !overwrite) {
        return {
          ok: false,
          risk: "medium",
          content: `Refusing to overwrite existing file without overwrite=true: ${args.path}`,
          summary: `Refused overwrite for ${args.path}.`
        };
      }

      if (createDirs) {
        await fs.mkdir(path.dirname(target), { recursive: true });
      }

      await fs.writeFile(target, next, "utf8");
      const summary = `Wrote ${Buffer.byteLength(next, "utf8")} bytes to ${args.path}.`;
      return {
        ok: true,
        risk: "medium",
        content: summary,
        summary: summarizeOutput(summary, 200),
        metadata: {
          operation: "write_file",
          modified: true,
          path: relativePath,
          paths: [relativePath],
          overwritten: exists,
          audit: [auditWrite(relativePath, previous, next, exists)]
        }
      };
    }
  };
}

function auditWrite(filePath: string, previous: string, next: string, existed: boolean): { path: string; added: number; removed: number } {
  const previousLines = existed && previous.length ? previous.split(/\r?\n/).length : 0;
  const nextLines = next.length ? next.split(/\r?\n/).length : 0;
  return {
    path: filePath,
    added: nextLines,
    removed: existed ? previousLines : 0
  };
}
