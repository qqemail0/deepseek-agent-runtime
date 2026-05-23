import { createHash } from "node:crypto";

export interface PromptPrefixSnapshot {
  hash: string;
  tokenEstimate: number;
  content: string;
}

export function snapshotPromptPrefix(content: string, tokenEstimate: number): PromptPrefixSnapshot {
  return {
    hash: createHash("sha256").update(content).digest("hex"),
    tokenEstimate,
    content
  };
}
