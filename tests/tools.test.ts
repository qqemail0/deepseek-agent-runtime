import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/load-config.js";
import { buildOpenCommand } from "../src/tools/desktop-open.js";
import { ToolRegistry } from "../src/tools/tool-registry.js";

describe("tool registry", () => {
  it("searches and reads files locally", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ds-agent-"));
    try {
      await writeFile(path.join(cwd, "README.md"), "hello DeepSeek cache\nsecond line\n", "utf8");
      const registry = new ToolRegistry(defaultConfig);
      const search = await registry.execute({
        id: "search-1",
        type: "function",
        function: { name: "search_text", arguments: "{\"query\":\"DeepSeek\",\"maxResults\":5}" }
      }, cwd);
      expect(search.ok).toBe(true);
      expect(search.content).toContain("README.md:1");

      const read = await registry.execute({
        id: "read-1",
        type: "function",
        function: { name: "read_file", arguments: "{\"path\":\"README.md\",\"startLine\":2,\"maxLines\":1}" }
      }, cwd);
      expect(read.content).toContain("2: second line");

      const write = await registry.execute({
        id: "write-1",
        type: "function",
        function: {
          name: "write_file",
          arguments: "{\"path\":\"notes/result.txt\",\"content\":\"ok\",\"createDirs\":true,\"overwrite\":false}"
        }
      }, cwd);
      expect(write.ok).toBe(true);
      expect(write.summary).toContain("Wrote");
      expect(write.metadata?.modified).toBe(true);
      expect(write.metadata?.paths).toEqual(["notes/result.txt"]);

      const summaries = registry.summaries();
      expect(summaries.some((tool) => tool.name === "desktop_open")).toBe(true);

      const editTools = registry.selectToolNames({
        kind: "edit",
        complexity: 4,
        risk: "medium",
        needsTools: true,
        wantsJson: false
      }, "optimize token cache hit rate");
      expect(editTools).toEqual(expect.arrayContaining(["search_text", "read_file", "apply_patch", "git_diff"]));
      expect(editTools).not.toContain("list_files");
      expect(editTools).not.toContain("write_file");

      const openTools = registry.selectToolNames({
        kind: "chat",
        complexity: 1,
        risk: "safe",
        needsTools: true,
        wantsJson: false
      }, "open package.json");
      expect(openTools).toContain("desktop_open");
      expect(openTools).not.toContain("run_shell");
      expect(openTools).not.toContain("read_file");
      expect(openTools).not.toContain("search_text");

      expect(() => registry.toolCallHash({
        id: "bad-json",
        type: "function",
        function: { name: "read_file", arguments: "{\"path\":\"README.md" }
      })).not.toThrow();

      const repairedRead = await registry.execute({
        id: "repair-json",
        type: "function",
        function: { name: "read_file", arguments: "{\"path\":\"README.md" }
      }, cwd);
      expect(repairedRead.ok).toBe(true);
      expect(repairedRead.content).toContain("hello DeepSeek cache");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("desktop open tool", () => {
  it("uses Explorer for Windows directories instead of PowerShell Start-Process", () => {
    const command = buildOpenCommand("C:\\workspace\\deepseek-agent-runtime", "path", true, "win32");

    expect(command.command).toBe("explorer.exe");
    expect(command.args).toEqual(["C:\\workspace\\deepseek-agent-runtime"]);
    expect(command.ignoreExitCode).toBe(true);
  });

  it("uses the Windows file protocol handler for files and URLs", () => {
    expect(buildOpenCommand("C:\\workspace\\deepseek-agent-runtime\\package.json", "path", false, "win32")).toMatchObject({
      command: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", "C:\\workspace\\deepseek-agent-runtime\\package.json"]
    });
    expect(buildOpenCommand("https://www.bing.com", "url", false, "win32")).toMatchObject({
      command: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", "https://www.bing.com"]
    });
  });
});
