import { promises as fs } from "node:fs";
import path from "node:path";
import type { RegisteredTool } from "../core/types.js";
import { listFilesRecursive, resolveInside } from "../utils/fs.js";
import { summarizeOutput } from "../utils/text.js";

export function createSearchTextTool(): RegisteredTool {
  return {
    name: "search_text",
    description: "Search text in workspace files using a literal or regular expression query.",
    risk: () => "safe",
    schema: {
      type: "function",
      function: {
        name: "search_text",
        description: "Search text in workspace files using a literal or regular expression query.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query. Treated as regex when regex=true." },
            regex: { type: "boolean", description: "Whether query is a JavaScript regex." },
            path: { type: "string", description: "Optional workspace-relative directory or file to search." },
            maxResults: { type: "integer", description: "Maximum matching lines. Default 80." }
          },
          required: ["query"],
          additionalProperties: false
        }
      }
    },
    execute: async ({ args, cwd }) => {
      const root = args.path ? resolveInside(cwd, String(args.path)) : cwd;
      const stat = await fs.stat(root);
      const files = stat.isFile()
        ? [path.relative(cwd, root).replaceAll(path.sep, "/")]
        : await listFilesRecursive(root, { maxFiles: 1500 });
      const maxResults = Math.min(300, Math.max(1, Number(args.maxResults ?? 80)));
      const matcher = createMatcher(String(args.query), Boolean(args.regex));
      const results: string[] = [];

      for (const file of files) {
        if (results.length >= maxResults) {
          break;
        }
        const absolute = stat.isFile() ? root : path.join(root, file);
        if (isProbablyBinary(absolute)) {
          continue;
        }
        let text = "";
        try {
          text = await fs.readFile(absolute, "utf8");
        } catch {
          continue;
        }
        const lines = text.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          if (matcher(lines[index] ?? "")) {
            const display = path.relative(cwd, absolute).replaceAll(path.sep, "/");
            results.push(`${display}:${index + 1}: ${lines[index]}`);
            if (results.length >= maxResults) {
              break;
            }
          }
        }
      }

      const content = results.join("\n") || "No matches.";
      return {
        ok: true,
        risk: "safe",
        content,
        summary: summarizeOutput(content, 1200),
        metadata: { count: results.length }
      };
    }
  };
}

function createMatcher(query: string, regex: boolean): (line: string) => boolean {
  if (!regex) {
    const lowered = query.toLowerCase();
    return (line) => line.toLowerCase().includes(lowered);
  }
  const expression = new RegExp(query, "i");
  return (line) => expression.test(line);
}

function isProbablyBinary(filePath: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|tar|7z|exe|dll|docx|xlsx|pptx)$/i.test(filePath);
}
