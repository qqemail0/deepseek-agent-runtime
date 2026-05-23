import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RegisteredTool } from "../core/types.js";

const execFileAsync = promisify(execFile);

export function createGitStatusTool(): RegisteredTool {
  return {
    name: "git_status",
    description: "Show concise git status for the workspace.",
    risk: () => "safe",
    schema: {
      type: "function",
      function: {
        name: "git_status",
        description: "Show concise git status for the workspace.",
        parameters: {
          type: "object",
          properties: {
            short: { type: "boolean", description: "Use --short output. Default true." }
          },
          required: ["short"],
          additionalProperties: false
        }
      }
    },
    execute: async ({ args, cwd }) => {
      const gitArgs = ["status", Boolean(args.short ?? true) ? "--short" : "--porcelain=v1"];
      const { stdout } = await execFileAsync("git", gitArgs, { cwd, windowsHide: true });
      const content = stdout.trim() || "Clean working tree.";
      return { ok: true, risk: "safe", content, summary: content };
    }
  };
}
