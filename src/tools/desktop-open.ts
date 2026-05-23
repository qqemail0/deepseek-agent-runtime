import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { RegisteredTool, RiskLevel } from "../core/types.js";
import { resolveInside } from "../utils/fs.js";

type OpenKind = "path" | "url" | "app";

export interface OpenCommand {
  command: string;
  args: string[];
  settleMs: number;
  ignoreExitCode?: boolean;
}

export function createDesktopOpenTool(): RegisteredTool {
  return {
    name: "desktop_open",
    description: "Open a workspace file/folder, URL, or application through the operating system after permission approval.",
    risk: (args) => classifyOpenRisk(String(args.target ?? ""), String(args.kind ?? "path")),
    schema: {
      type: "function",
      function: {
        name: "desktop_open",
        description: "Open a workspace file/folder, URL, or application through the operating system after permission approval.",
        parameters: {
          type: "object",
          properties: {
            target: { type: "string", description: "Path, URL, or application name to open." },
            kind: { type: "string", enum: ["path", "url", "app"], description: "Target kind. Default path." }
          },
          required: ["target"],
          additionalProperties: false
        }
      }
    },
    execute: async ({ args, cwd }) => {
      const kind = normalizeOpenKind(args.kind);
      const target = String(args.target ?? "");
      const resolvedTarget = kind === "path" ? resolveOpenPath(cwd, target) : target;
      await openTarget(resolvedTarget, kind);
      return {
        ok: true,
        risk: classifyOpenRisk(target, kind),
        content: `Opened ${kind}: ${target}`,
        summary: `Opened ${kind}: ${target}`,
        metadata: { path: kind === "path" ? target : undefined, target, kind }
      };
    }
  };
}

export function buildOpenCommand(target: string, kind: OpenKind, isDirectory: boolean, platform: NodeJS.Platform = process.platform): OpenCommand {
  if (platform === "win32") {
    if (kind === "path" && isDirectory) {
      return { command: "explorer.exe", args: [target], settleMs: 800, ignoreExitCode: true };
    }
    if (kind === "path" || kind === "url") {
      return { command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", target], settleMs: 800, ignoreExitCode: true };
    }
    return { command: target, args: [], settleMs: 800 };
  }

  if (kind === "app") {
    return { command: target, args: [], settleMs: 800 };
  }

  return platform === "darwin"
    ? { command: "open", args: [target], settleMs: 5000 }
    : { command: "xdg-open", args: [target], settleMs: 5000 };
}

function classifyOpenRisk(target: string, kind: string): RiskLevel {
  if (kind === "url") {
    return /^https?:\/\//i.test(target) ? "medium" : "high";
  }
  if (kind === "app") {
    return "high";
  }
  if (path.isAbsolute(target)) {
    return "high";
  }
  return "medium";
}

function resolveOpenPath(cwd: string, target: string): string {
  if (!target || target === "." || target === "./") {
    return path.resolve(cwd);
  }
  if (path.isAbsolute(target)) {
    return path.resolve(target);
  }
  return resolveInside(cwd, target);
}

async function openTarget(target: string, kind: OpenKind): Promise<void> {
  const isDirectory = kind === "path" ? await ensurePathExists(target) : false;
  const command = buildOpenCommand(target, kind, isDirectory);

  try {
    await spawnOpenCommand(command);
  } catch (error) {
    if (process.platform === "win32" && kind === "app") {
      await spawnOpenCommand({ command: "cmd.exe", args: ["/d", "/s", "/c", "start", "\"\"", target], settleMs: 800 });
      return;
    }
    throw error;
  }
}

async function ensurePathExists(target: string): Promise<boolean> {
  try {
    const stats = await stat(target);
    return stats.isDirectory();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Path does not exist or cannot be opened: ${target}. ${message}`);
  }
}

async function spawnOpenCommand(openCommand: OpenCommand): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const child = spawn(openCommand.command, openCommand.args, {
      windowsHide: true,
      detached: true,
      stdio: "ignore"
    });
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.unref();
      finish(resolve);
    }, openCommand.settleMs);
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => {
      if (code === 0 || openCommand.ignoreExitCode) {
        finish(resolve);
      } else {
        finish(() => reject(new Error(`Open command failed with exit code ${code ?? "unknown"}: ${openCommand.command}`)));
      }
    });
  });
}

function normalizeOpenKind(value: unknown): OpenKind {
  return value === "url" || value === "app" ? value : "path";
}
