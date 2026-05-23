import { exec } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { RegisteredTool, RiskLevel } from "../core/types.js";
import { summarizeOutput } from "../utils/text.js";

const execAsync = promisify(exec);

export function createRunShellTool(maxOutputTokens: number): RegisteredTool {
  return {
    name: "run_shell",
    description: "Run a shell command in the workspace with timeout and summarized output.",
    risk: (args) => classifyCommand(String(args.command ?? "")),
    schema: {
      type: "function",
      function: {
        name: "run_shell",
        description: "Run a shell command in the workspace with timeout and summarized output.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "Command to execute." },
            timeoutMs: { type: "integer", description: "Timeout in milliseconds. Default 30000." }
          },
          required: ["command"],
          additionalProperties: false
        }
      }
    },
    execute: async ({ args, cwd }) => {
      const command = String(args.command ?? "");
      const timeout = Math.min(120_000, Math.max(1000, Number(args.timeoutMs ?? 30_000)));
      const risk = classifyCommand(command);
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd,
          timeout,
          windowsHide: true,
          maxBuffer: 1_000_000
        });
        const content = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
        const compressed = rtkCompressShellOutput(command, content);
        return {
          ok: true,
          risk,
          content,
          summary: summarizeOutput(compressed, maxOutputTokens),
          metadata: { command, timeoutMs: timeout, compression: "rtk-ai-inspired-shell-filter" }
        };
      } catch (error) {
        const err = error as { stdout?: string; stderr?: string; message?: string; code?: number };
        const content = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n");
        const logPath = await writeFailureLog(cwd, command, content);
        const compressed = rtkCompressShellOutput(command, content);
        return {
          ok: false,
          risk,
          content,
          summary: summarizeOutput(`${compressed}\n\nFull failure log: ${logPath}`, maxOutputTokens),
          metadata: { command, exitCode: err.code, logPath, compression: "rtk-ai-inspired-shell-filter" }
        };
      }
    }
  };
}

function rtkCompressShellOutput(command: string, content: string): string {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (!lines.length) {
    return "";
  }

  if (/\b(tsc|eslint|vitest|pytest|npm\s+test|pnpm\s+test|yarn\s+test)\b/i.test(command)) {
    const important = lines.filter((line) =>
      /\berror\b|\bfailed\b|\bfail\b|\bwarning\b|\bpassed\b|\btests?\b|\bfiles?\b|^\s*(FAIL|PASS|Error|Warning)/i.test(line)
    );
    return [
      "RTK-style shell summary:",
      important.slice(0, 120).join("\n") || lines.slice(-80).join("\n"),
      `Raw lines: ${lines.length}`
    ].join("\n");
  }

  if (/git\s+(diff|status|log|show)/i.test(command)) {
    const important = lines.filter((line) =>
      /^(M|A|D|R|C|\?\?|diff --git|commit |Author:|Date:|\+\+\+|---|@@|On branch|Changes|Untracked|modified:|new file:|deleted:)/.test(line)
    );
    return [
      "RTK-style git summary:",
      important.slice(0, 160).join("\n") || lines.slice(0, 80).join("\n"),
      `Raw lines: ${lines.length}`
    ].join("\n");
  }

  return content;
}

async function writeFailureLog(cwd: string, command: string, content: string): Promise<string> {
  const dir = path.join(cwd, ".agent", "run-logs");
  await fs.mkdir(dir, { recursive: true });
  const hash = createHash("sha256").update(`${command}\n${content}`).digest("hex").slice(0, 12);
  const target = path.join(dir, `shell-failure-${hash}.log`);
  await fs.writeFile(target, [`command: ${command}`, "", content].join("\n"), "utf8");
  return target;
}

export function classifyCommand(command: string): RiskLevel {
  const normalized = command.toLowerCase();
  if (/\b(rm|del|erase|rd|rmdir)\b/.test(normalized) || /remove-item/.test(normalized)) {
    return "forbidden";
  }
  if (/\b(git\s+push|git\s+reset|git\s+checkout|format|mkfs|shutdown|reboot|curl\b|wget\b|Invoke-WebRequest)\b/i.test(command)) {
    return "high";
  }
  if (/\b(npm\s+i|npm\s+install|pnpm\s+i|yarn\s+add|pip\s+install|git\s+commit)\b/i.test(command)) {
    return "medium";
  }
  if (/\b(npm|pnpm|yarn|node|python|pytest|vitest|tsc|git)\b/i.test(command)) {
    return "low";
  }
  return "medium";
}
