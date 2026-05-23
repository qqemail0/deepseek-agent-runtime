import { promises as fs } from "node:fs";
import path from "node:path";

export function resolveInside(root: string, target: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(resolvedRoot, target);
  const relative = path.relative(resolvedRoot, resolvedTarget);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${target}`);
  }

  return resolvedTarget;
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfExists(filePath: string, maxBytes = 64_000): Promise<string | undefined> {
  if (!(await pathExists(filePath))) {
    return undefined;
  }

  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    return bytesRead === maxBytes ? `${text}\n...[truncated]` : text;
  } finally {
    await handle.close();
  }
}

export function normalizePathForDisplay(root: string, filePath: string): string {
  return path.relative(path.resolve(root), path.resolve(filePath)).replaceAll(path.sep, "/");
}

export async function listFilesRecursive(root: string, options?: { maxFiles?: number; includeHidden?: boolean }): Promise<string[]> {
  const maxFiles = options?.maxFiles ?? 500;
  const includeHidden = options?.includeHidden ?? false;
  const ignored = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".cache"]);
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (out.length >= maxFiles) {
      return;
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (out.length >= maxFiles) {
        break;
      }
      if (!includeHidden && entry.name.startsWith(".")) {
        continue;
      }
      if (ignored.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        out.push(normalizePathForDisplay(root, fullPath));
      }
    }
  }

  await walk(path.resolve(root));
  return out;
}
