import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RegisteredTool } from "../core/types.js";
import { summarizeOutput } from "../utils/text.js";

const execFileAsync = promisify(execFile);

export function createGitDiffTool(maxOutputTokens: number): RegisteredTool {
  return {
    name: "git_diff",
    description: "Show git diff for the workspace or a specific file.",
    risk: () => "safe",
    schema: {
      type: "function",
      function: {
        name: "git_diff",
        description: "Show git diff for the workspace or a specific file.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Optional workspace-relative path." }
          },
          required: ["path"],
          additionalProperties: false
        }
      }
    },
    execute: async ({ args, cwd }) => {
      const gitArgs = ["diff", "--"];
      if (args.path) {
        gitArgs.push(String(args.path));
      } else {
        gitArgs.push(".");
      }
      const { stdout } = await execFileAsync("git", gitArgs, { cwd, windowsHide: true, maxBuffer: 1_000_000 });
      const content = stdout.trim() || "No diff.";
      return { ok: true, risk: "safe", content, summary: summarizeOutput(content, maxOutputTokens) };
    }
  };
}
