import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop source assets", () => {
  it("keeps renderer and preload assets present for Electron build", async () => {
    const root = process.cwd();
    const files = [
      "src/desktop/main.ts",
      "src/desktop/preload.cjs",
      "src/desktop/renderer/index.html",
      "src/desktop/renderer/app.js",
      "src/desktop/renderer/styles.css"
    ];

    await Promise.all(files.map((file) => access(path.join(root, file))));
    expect(files.length).toBe(5);
  });

  it("exposes a historical workspace selector in the composer", async () => {
    const root = process.cwd();
    const [html, app] = await Promise.all([
      readFile(path.join(root, "src/desktop/renderer/index.html"), "utf8"),
      readFile(path.join(root, "src/desktop/renderer/app.js"), "utf8")
    ]);

    expect(html).toContain('id="workspaceSelect"');
    expect(app).toContain("renderWorkspaceHistory");
    expect(app).toContain("workspaceHistoryOptions");
  });

  it("lets desktop users choose automatic agent loop turns", async () => {
    const root = process.cwd();
    const [html, app] = await Promise.all([
      readFile(path.join(root, "src/desktop/renderer/index.html"), "utf8"),
      readFile(path.join(root, "src/desktop/renderer/app.js"), "utf8")
    ]);

    expect(html).toContain('id="maxTurns"');
    expect(html).toContain('<option value="auto">');
    expect(app).toContain("selectedMaxTurns");
  });

  it("keeps longer conversation transcripts in desktop history", async () => {
    const root = process.cwd();
    const app = await readFile(path.join(root, "src/desktop/renderer/app.js"), "utf8");

    expect(app).toContain("MAX_CONVERSATION_MESSAGES = 200");
    expect(app).toContain("MAX_RENDERED_MESSAGES = 200");
    expect(app).toContain("compactHistoryForStorage");
  });

  it("saves draft and active stream state before switching history conversations", async () => {
    const root = process.cwd();
    const app = await readFile(path.join(root, "src/desktop/renderer/app.js"), "utf8");

    expect(app).toContain("prepareCurrentConversationForSwitch");
    expect(app).toContain("commitActiveActivitySnapshot");
    expect(app).toContain("activeRunConversationId");
    expect(app).toContain("draft");
  });

  it("shows a right-side task goal and completion status panel", async () => {
    const root = process.cwd();
    const [html, app, css] = await Promise.all([
      readFile(path.join(root, "src/desktop/renderer/index.html"), "utf8"),
      readFile(path.join(root, "src/desktop/renderer/app.js"), "utf8"),
      readFile(path.join(root, "src/desktop/renderer/styles.css"), "utf8")
    ]);

    expect(html).toContain('id="taskGoalCard"');
    expect(html).toContain('id="taskCompletionStatus"');
    expect(app).toContain("beginTaskStatus");
    expect(app).toContain("assessTaskCompletion");
    expect(app).toContain("taskStatus: currentTaskStatus");
    expect(css).toContain(".task-goal-card");
  });

  it("adds compact copy controls to transcript messages", async () => {
    const root = process.cwd();
    const [app, css] = await Promise.all([
      readFile(path.join(root, "src/desktop/renderer/app.js"), "utf8"),
      readFile(path.join(root, "src/desktop/renderer/styles.css"), "utf8")
    ]);

    expect(app).toContain("data-copy-message");
    expect(app).toContain("handleTranscriptClick");
    expect(app).toContain("copyTextToClipboard");
    expect(css).toContain(".message-copy-btn");
  });

  it("creates and persists a per-conversation workspace directory", async () => {
    const root = process.cwd();
    const [main, preload, app] = await Promise.all([
      readFile(path.join(root, "src/desktop/main.ts"), "utf8"),
      readFile(path.join(root, "src/desktop/preload.cjs"), "utf8"),
      readFile(path.join(root, "src/desktop/renderer/app.js"), "utf8")
    ]);

    expect(main).toContain('ipcMain.handle("workspace:conversation-dir"');
    expect(main).toContain('path.join(".agent", "conversations", conversationId)');
    expect(preload).toContain("ensureConversationWorkdir");
    expect(app).toContain("ensureCurrentConversationWorkdir");
    expect(app).toContain("conversationWorkdir");
    expect(app).toContain("Current conversation work directory");
  });

  it("lets users open or reveal completed files from the desktop panel", async () => {
    const root = process.cwd();
    const [main, preload, app, css] = await Promise.all([
      readFile(path.join(root, "src/desktop/main.ts"), "utf8"),
      readFile(path.join(root, "src/desktop/preload.cjs"), "utf8"),
      readFile(path.join(root, "src/desktop/renderer/app.js"), "utf8"),
      readFile(path.join(root, "src/desktop/renderer/styles.css"), "utf8")
    ]);

    expect(main).toContain('ipcMain.handle("files:open-path"');
    expect(main).toContain("shell.showItemInFolder");
    expect(main).toContain("shell.openPath");
    expect(preload).toContain("openPath");
    expect(app).toContain("handleCompletedFileAction");
    expect(app).toContain('data-completed-action="open"');
    expect(app).toContain('data-completed-action="reveal"');
    expect(css).toContain(".file-actions");
  });
});
