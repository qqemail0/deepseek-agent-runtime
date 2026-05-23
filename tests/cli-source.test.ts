import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("cli source capabilities", () => {
  it("supports desktop-parity run features and interactive chat", async () => {
    const source = await readFile(path.join(process.cwd(), "src/cli/index.ts"), "utf8");

    expect(source).toContain('.command("chat")');
    expect(source).toContain("--json");
    expect(source).toContain("--no-stream");
    expect(source).toContain("--trace");
    expect(source).toContain('maxTurns: normalizeMaxTurnsOption(options.maxTurns) ?? "auto"');
    expect(source).toContain("completedFiles");
    expect(source).toContain("cacheHealth");
  });
});
