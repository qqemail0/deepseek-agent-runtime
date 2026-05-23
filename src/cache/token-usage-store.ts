import { promises as fs } from "node:fs";
import path from "node:path";
import type { UsageRecord } from "../core/types.js";

export class TokenUsageStore {
  constructor(private readonly workspaceRoot: string) {}

  async append(record: UsageRecord): Promise<void> {
    const filePath = path.join(this.workspaceRoot, ".agent", "usage.jsonl");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, "utf8");
  }
}
