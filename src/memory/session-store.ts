import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentMessage } from "../core/types.js";

export class SessionStore {
  constructor(private readonly workspaceRoot: string) {}

  async save(sessionId: string, messages: AgentMessage[]): Promise<void> {
    const dir = path.join(this.workspaceRoot, ".agent", "sessions");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${safeName(sessionId)}.json`), JSON.stringify(messages, null, 2), "utf8");
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80);
}
