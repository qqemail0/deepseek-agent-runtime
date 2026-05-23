import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { RegisteredTool } from "../core/types.js";
import { resolveInside } from "../utils/fs.js";
import { summarizeOutput } from "../utils/text.js";

export function createApplyPatchTool(maxOutputTokens: number): RegisteredTool {
  return {
    name: "apply_patch",
    description: "Apply a unified diff patch to workspace files after permission approval.",
    risk: () => "medium",
    schema: {
      type: "function",
      function: {
        name: "apply_patch",
        description: "Apply a unified diff patch to workspace files after permission approval.",
        parameters: {
          type: "object",
          properties: {
            patch: { type: "string", description: "Unified diff patch text." },
            checkOnly: { type: "boolean", description: "If true, only validate the patch." }
          },
          required: ["patch"],
          additionalProperties: false
        }
      }
    },
    execute: async ({ args, cwd }) => {
      const patch = String(args.patch ?? "");
      const checkOnly = Boolean(args.checkOnly ?? false);
      const paths = validatePatchPaths(cwd, patch);
      const audit = auditPatch(patch);

      const tempPath = path.join(os.tmpdir(), `ds-agent-${Date.now()}-${Math.random().toString(16).slice(2)}.patch`);
      await fs.writeFile(tempPath, patch, "utf8");
      try {
        const check = await runGitApply(cwd, ["apply", "--check", "--whitespace=nowarn", tempPath]);
        if (!check.ok || checkOnly) {
          return {
            ok: check.ok,
            risk: "medium",
            content: check.output || (check.ok ? "Patch check passed." : "Patch check failed."),
            summary: summarizeOutput(check.output || "Patch check passed.", maxOutputTokens),
            metadata: { operation: "apply_patch", modified: false, paths, checkOnly: true, audit }
          };
        }

        const applied = await runGitApply(cwd, ["apply", "--whitespace=nowarn", tempPath]);
        return {
          ok: applied.ok,
          risk: "medium",
          content: applied.output || (applied.ok ? "Patch applied." : "Patch apply failed."),
          summary: summarizeOutput(applied.output || "Patch applied.", maxOutputTokens),
          metadata: { operation: "apply_patch", modified: applied.ok, paths, audit }
        };
      } finally {
        await fs.rm(tempPath, { force: true });
      }
    }
  };
}

function validatePatchPaths(cwd: string, patch: string): string[] {
  const paths = new Set<string>();
  for (const line of patch.split(/\r?\n/)) {
    const match = /^(?:---|\+\+\+) [ab]\/(.+)$/.exec(line);
    if (!match || match[1] === "/dev/null") {
      continue;
    }
    const clean = match[1].split("\t")[0]?.trim();
    if (clean) {
      paths.add(clean);
    }
  }

  for (const candidate of paths) {
    resolveInside(cwd, candidate);
  }
  return [...paths].sort();
}

function auditPatch(patch: string): Array<{ path: string; added: number; removed: number }> {
  const byPath = new Map<string, { path: string; added: number; removed: number }>();
  let currentPath = "";

  for (const line of patch.split(/\r?\n/)) {
    const file = /^\+\+\+ [ab]\/(.+)$/.exec(line);
    if (file && file[1] !== "/dev/null") {
      currentPath = file[1].split("\t")[0]?.trim() || "";
      if (currentPath && !byPath.has(currentPath)) {
        byPath.set(currentPath, { path: currentPath, added: 0, removed: 0 });
      }
      continue;
    }
    if (!currentPath || line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    const target = byPath.get(currentPath);
    if (!target) {
      continue;
    }
    if (line.startsWith("+")) {
      target.added += 1;
    } else if (line.startsWith("-")) {
      target.removed += 1;
    }
  }

  return [...byPath.values()];
}

async function runGitApply(cwd: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, windowsHide: true });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    child.on("error", (error) => {
      resolve({ ok: false, output: error.message });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, output: output.trim() });
    });
  });
}
