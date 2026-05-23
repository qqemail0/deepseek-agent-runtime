import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfig, loadConfig, type AgentConfig } from "../config/load-config.js";
import { AgentOrchestrator } from "../core/orchestrator.js";
import { CostPrecisionEngine } from "../core/cost-precision-engine.js";
import { DeepSeekProvider } from "../providers/deepseek-provider.js";
import { SkillLoader } from "../skills/skill-loader.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { compactStreamEvents, type RunStreamEvent } from "../utils/stream-events.js";
import type { AgentTurnLimit, AttachedContextFile, AgentStreamEvent, PermissionMode } from "../core/types.js";
import type { WebContents } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const activeRuns = new Map<string, AbortController>();
const pendingPermissions = new Map<string, { runId?: string; resolve: (approved: boolean) => void }>();
let mainWindow: BrowserWindow | undefined;

interface DesktopSettings {
  encryptedApiKey?: string;
  defaultCwd?: string;
  permissionMode?: PermissionMode;
  defaultModel?: string;
  thinkingMode?: "auto" | "enabled" | "disabled";
  maxTurns?: AgentTurnLimit;
  apiBaseURL?: string;
  networkEnabled?: boolean;
  autoCompressContext?: boolean;
  disabledSkillPaths?: string[];
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#101214",
    title: "DeepSeek Agent Runtime",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function registerIpc(): void {
  ipcMain.handle("app:defaults", async (event) => {
    assertTrustedSender(event.senderFrame?.url);
    const settings = await readDesktopSettings();
    const savedApiKey = decryptApiKey(settings.encryptedApiKey);
    if (savedApiKey && !process.env.DEEPSEEK_API_KEY) {
      process.env.DEEPSEEK_API_KEY = savedApiKey;
    }
    const config = {
      maxAgentTurns: 8,
      maxToolOutputTokens: 1800,
      contextBudgetTokens: 32000
    };
    return {
      cwd: settings.defaultCwd || process.cwd(),
      hasApiKey: Boolean(process.env.DEEPSEEK_API_KEY || savedApiKey),
      hasSavedApiKey: Boolean(settings.encryptedApiKey),
      settings: {
        defaultCwd: settings.defaultCwd,
        permissionMode: settings.permissionMode,
        defaultModel: settings.defaultModel,
        thinkingMode: settings.thinkingMode,
        maxTurns: settings.maxTurns ?? "auto",
        apiBaseURL: settings.apiBaseURL,
        networkEnabled: settings.networkEnabled ?? true,
        autoCompressContext: settings.autoCompressContext ?? true,
        disabledSkillPaths: settings.disabledSkillPaths ?? []
      },
      defaultModels: [
        { id: "deepseek-v4-flash", ownedBy: "deepseek" },
        { id: "deepseek-v4-pro", ownedBy: "deepseek" }
      ],
      capabilities: [
        { name: "Agent Loop", status: "ready" },
        { name: "DeepSeek v4 Routing", status: "ready" },
        { name: "Tool Calls", status: "ready" },
        { name: "Skills Lazy Load", status: "ready" },
        { name: "Context Cache Metrics", status: "ready" },
        { name: "MCP", status: "stub" },
        { name: "Subagents", status: "planned" },
        { name: "Hooks", status: "planned" }
      ],
      defaults: config
    };
  });

  ipcMain.handle("models:list", async (event, request: { cwd: string; apiKey?: string; apiBaseURL?: string }) => {
    assertTrustedSender(event.senderFrame?.url);
    const cwd = path.resolve(request.cwd || process.cwd());
    const apiKey = await getEffectiveApiKey(request.apiKey);
    if (apiKey) {
      process.env.DEEPSEEK_API_KEY = apiKey;
    }

    try {
      const config = await loadDesktopConfig(cwd, request.apiBaseURL);
      const provider = new DeepSeekProvider(config);
      const models = await provider.listModels();
      return { ok: true, models };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        models: [
          { id: "deepseek-v4-flash", ownedBy: "deepseek" },
          { id: "deepseek-v4-pro", ownedBy: "deepseek" }
        ]
      };
    }
  });

  ipcMain.handle("agent:context", async (event, request: {
    task: string;
    cwd: string;
    model?: string;
    thinking?: "enabled" | "disabled";
    conversationSummary?: string;
    disabledSkillPaths?: string[];
    attachedFiles?: AttachedContextFile[];
    networkEnabled?: boolean;
    autoCompressContext?: boolean;
  }) => {
    assertTrustedSender(event.senderFrame?.url);
    const cwd = path.resolve(request.cwd || process.cwd());
    const config = await loadDesktopConfig(cwd);
    const settings = await readDesktopSettings();
    const orchestrator = new AgentOrchestrator(config);
    const result = await orchestrator.run({
      cwd,
      task: String(request.task ?? ""),
      conversationSummary: request.conversationSummary,
      disabledSkillPaths: request.disabledSkillPaths ?? settings.disabledSkillPaths,
      attachedFiles: sanitizeAttachedFiles(request.attachedFiles),
      networkEnabled: request.networkEnabled ?? settings.networkEnabled ?? true,
      autoCompressContext: request.autoCompressContext ?? settings.autoCompressContext ?? true,
      dryRun: true,
      modelOverride: request.model,
      thinkingOverride: request.thinking
    });
    const registry = new ToolRegistry(config);
    return {
      ok: true,
      content: result.content,
      route: result.route,
      profile: result.profile,
      estimatedTokens: result.context.estimatedTokens,
      budgetReport: result.context.budgetReport,
      contextItems: summarizeContextItems(result.context.items),
      availableTools: registry.summaries()
    };
  });

  ipcMain.handle("agent:run", async (event, request: {
    runId?: string;
    task: string;
    cwd: string;
    apiKey?: string;
    permissionMode?: PermissionMode;
    maxTurns?: AgentTurnLimit;
    model?: string;
    thinking?: "enabled" | "disabled";
    conversationSummary?: string;
    disabledSkillPaths?: string[];
    attachedFiles?: AttachedContextFile[];
    networkEnabled?: boolean;
    autoCompressContext?: boolean;
  }) => {
    assertTrustedSender(event.senderFrame?.url);
    const runId = normalizeRunId(request.runId);
    const controller = new AbortController();
    let streamBatcher: ReturnType<typeof createStreamBatcher> | undefined;
    activeRuns.set(runId, controller);
    try {
      const cwd = path.resolve(request.cwd || process.cwd());
      const apiKey = await getEffectiveApiKey(request.apiKey);
      if (apiKey) {
        process.env.DEEPSEEK_API_KEY = apiKey;
      }
      const config = await loadDesktopConfig(cwd);
      const settings = await readDesktopSettings();
      const provider = tryCreateDeepSeekProvider(config);
      const orchestrator = new AgentOrchestrator(config, provider, (prompt) => requestPermission(prompt, runId));
      const batcher = createStreamBatcher(event.sender, runId);
      streamBatcher = batcher;
      const result = await orchestrator.run({
        cwd,
        task: String(request.task ?? ""),
        conversationSummary: request.conversationSummary,
        disabledSkillPaths: request.disabledSkillPaths ?? settings.disabledSkillPaths,
        attachedFiles: sanitizeAttachedFiles(request.attachedFiles),
        networkEnabled: request.networkEnabled ?? settings.networkEnabled ?? true,
        autoCompressContext: request.autoCompressContext ?? settings.autoCompressContext ?? true,
        permissionMode: request.permissionMode ?? "ask",
        maxTurns: request.maxTurns,
        modelOverride: request.model,
        thinkingOverride: request.thinking,
        signal: controller.signal,
        onProgress: async (progress) => {
          event.sender.send("agent:progress", { ...progress, runId });
        },
        onStream: async (stream) => {
          batcher.push(stream);
        }
      });
      batcher.flush();
      const cost = new CostPrecisionEngine(config);
      const cacheHealth = cost.cacheHealth(result.usage, result.context);
      return {
        ok: true,
        content: result.content,
        route: result.route,
        profile: result.profile,
        usage: result.usage,
        cost: cost.formatUsageZh(result.usage),
        cacheHealth,
        requestCache: result.requestCache,
        conversationCache: result.conversationCache,
        budgetReport: result.context.budgetReport,
        contextItems: summarizeContextItems(result.context.items),
        reasoning: result.reasoning,
        completedFiles: result.completedFiles,
        toolResults: result.toolResults.map((item) => ({
          ok: item.ok,
          risk: item.risk,
          summary: item.summary,
          metadata: item.metadata
        }))
      };
    } catch (error) {
      streamBatcher?.flush();
      if (isAbortError(error)) {
        return {
          ok: false,
          aborted: true,
          error: "\u5bf9\u8bdd\u5df2\u4e2d\u65ad\uff0c\u53ef\u4ee5\u4fee\u6539\u8f93\u5165\u540e\u91cd\u65b0\u53d1\u9001\u3002"
        };
      }
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      streamBatcher?.flush();
      activeRuns.delete(runId);
      cancelPendingPermissions(runId);
    }
  });

  ipcMain.handle("agent:cancel", (event, request: { runId?: string }) => {
    assertTrustedSender(event.senderFrame?.url);
    const runId = typeof request.runId === "string" ? request.runId.trim() : "";
    if (!runId) {
      return { ok: false, error: "Run id is required." };
    }
    const controller = activeRuns.get(runId);
    if (!controller) {
      return { ok: true, canceled: false };
    }
    controller.abort();
    cancelPendingPermissions(runId);
    event.sender.send("agent:progress", {
      runId,
      stage: "error",
      message: "Run interrupted by user.",
      percent: 100
    });
    return { ok: true, canceled: true };
  });

  ipcMain.handle("permission:answer", (event, request: { requestId: string; approved: boolean }) => {
    assertTrustedSender(event.senderFrame?.url);
    const pending = pendingPermissions.get(request.requestId);
    if (!pending) {
      return { ok: false, error: "Permission request expired." };
    }
    pendingPermissions.delete(request.requestId);
    pending.resolve(Boolean(request.approved));
    return { ok: true };
  });

  ipcMain.handle("skills:list", async (event, request: { cwd?: string }) => {
    assertTrustedSender(event.senderFrame?.url);
    try {
      const cwd = path.resolve(request.cwd || process.cwd());
      const loader = new SkillLoader(cwd);
      const skills = await loader.listSkills({ includeGlobal: true });
      return {
        ok: true,
        skills: skills.map((skill) => ({
          name: skill.name,
          description: skill.description,
          path: skill.path,
          scope: skill.scope,
          tokens: skill.tokens
        }))
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        skills: []
      };
    }
  });

  ipcMain.handle("skills:read", async (event, request: { cwd?: string; name?: string; path?: string }) => {
    assertTrustedSender(event.senderFrame?.url);
    try {
      const cwd = path.resolve(request.cwd || process.cwd());
      const name = String(request.name || "").trim();
      const skillPath = String(request.path || "").trim();
      if (!name && !skillPath) {
        return { ok: false, error: "Skill name or path is required." };
      }
      const loader = new SkillLoader(cwd);
      const skill = skillPath
        ? await loader.loadSkillByPath(skillPath, 4000, { includeGlobal: true })
        : await loader.loadSkill(name, 4000, { includeGlobal: true });
      if (!skill) {
        return { ok: false, error: "Skill not found." };
      }
      return {
        ok: true,
        skill: {
          name: skill.name,
          description: skill.description,
          path: skill.path,
          scope: skill.scope,
          tokens: skill.tokens,
          body: skill.body
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle("settings:get", async (event) => {
    assertTrustedSender(event.senderFrame?.url);
    const settings = await readDesktopSettings();
    return {
      ok: true,
      hasSavedApiKey: Boolean(settings.encryptedApiKey),
      settings: visibleSettings(settings)
    };
  });

  ipcMain.handle("settings:save", async (event, request: {
    apiKey?: string;
    defaultCwd?: string;
    permissionMode?: PermissionMode;
    defaultModel?: string;
    thinkingMode?: "auto" | "enabled" | "disabled";
    maxTurns?: AgentTurnLimit;
    apiBaseURL?: string;
    networkEnabled?: boolean;
    autoCompressContext?: boolean;
    disabledSkillPaths?: string[];
  }) => {
    assertTrustedSender(event.senderFrame?.url);
    try {
      const current = await readDesktopSettings();
      const next: DesktopSettings = {
        ...current,
        defaultCwd: request.defaultCwd?.trim() || current.defaultCwd,
        permissionMode: normalizePermissionMode(request.permissionMode) ?? current.permissionMode,
        defaultModel: request.defaultModel?.trim() || current.defaultModel,
        thinkingMode: normalizeThinkingMode(request.thinkingMode) ?? current.thinkingMode,
        maxTurns: normalizeMaxTurns(request.maxTurns) ?? current.maxTurns,
        apiBaseURL: normalizeBaseURL(request.apiBaseURL),
        networkEnabled: typeof request.networkEnabled === "boolean" ? request.networkEnabled : current.networkEnabled,
        autoCompressContext: typeof request.autoCompressContext === "boolean" ? request.autoCompressContext : current.autoCompressContext,
        disabledSkillPaths: normalizeStringArray(request.disabledSkillPaths) ?? current.disabledSkillPaths
      };

      const apiKey = request.apiKey?.trim();
      if (apiKey) {
        next.encryptedApiKey = encryptApiKey(apiKey);
        process.env.DEEPSEEK_API_KEY = apiKey;
      }

      await writeDesktopSettings(next);
      return {
        ok: true,
        hasSavedApiKey: Boolean(next.encryptedApiKey),
        settings: visibleSettings(next)
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle("settings:clear-api-key", async (event) => {
    assertTrustedSender(event.senderFrame?.url);
    const settings = await readDesktopSettings();
    delete settings.encryptedApiKey;
    delete process.env.DEEPSEEK_API_KEY;
    await writeDesktopSettings(settings);
    return {
      ok: true,
      hasSavedApiKey: false,
      settings: visibleSettings(settings)
    };
  });

  ipcMain.handle("files:choose", async (event, request: { cwd?: string }) => {
    assertTrustedSender(event.senderFrame?.url);
    const cwd = path.resolve(request.cwd || process.cwd());
    const result = await dialog.showOpenDialog({
      title: "Attach files",
      defaultPath: cwd,
      properties: ["openFile", "multiSelections"]
    });
    if (result.canceled) {
      return { ok: true, files: [] };
    }
    return { ok: true, files: await readAttachmentFiles(result.filePaths) };
  });

  ipcMain.handle("files:read", async (event, request: { paths?: string[] }) => {
    assertTrustedSender(event.senderFrame?.url);
    return { ok: true, files: await readAttachmentFiles(normalizeStringArray(request.paths) ?? []) };
  });

  ipcMain.handle("files:open-path", async (event, request: { cwd?: string; path?: string; action?: "open" | "reveal" }) => {
    assertTrustedSender(event.senderFrame?.url);
    try {
      const cwd = path.resolve(request.cwd || process.cwd());
      const target = resolveWorkspacePath(cwd, request.path);
      const action = request.action === "reveal" ? "reveal" : "open";
      const existingTarget = await existingPathOrParent(target);

      if (action === "reveal") {
        shell.showItemInFolder(existingTarget.path);
        return {
          ok: true,
          action,
          path: existingTarget.path,
          fallback: existingTarget.fallback
        };
      }

      const error = await shell.openPath(existingTarget.path);
      if (error) {
        return { ok: false, error };
      }
      return {
        ok: true,
        action,
        path: existingTarget.path,
        fallback: existingTarget.fallback
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle("workspace:choose", async (event, request: { cwd?: string }) => {
    assertTrustedSender(event.senderFrame?.url);
    const cwd = path.resolve(request.cwd || process.cwd());
    const result = await dialog.showOpenDialog({
      title: "Choose workspace",
      defaultPath: cwd,
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: true };
    }
    return { ok: true, cwd: result.filePaths[0] };
  });

  ipcMain.handle("workspace:conversation-dir", async (event, request: { cwd?: string; conversationId?: string }) => {
    assertTrustedSender(event.senderFrame?.url);
    try {
      const cwd = path.resolve(request.cwd || process.cwd());
      const stats = await fs.stat(cwd);
      if (!stats.isDirectory()) {
        return { ok: false, error: "Workspace is not a directory." };
      }
      const conversationId = sanitizeConversationDirName(request.conversationId);
      const relativePath = path.join(".agent", "conversations", conversationId);
      const absolutePath = path.join(cwd, relativePath);
      await fs.mkdir(absolutePath, { recursive: true });
      return {
        ok: true,
        path: absolutePath,
        relativePath,
        conversationId
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}

async function loadDesktopConfig(cwd: string, apiBaseURLOverride?: string): Promise<AgentConfig> {
  const config = await loadConfig(cwd);
  const settings = await readDesktopSettings();
  const apiBaseURL = normalizeBaseURL(apiBaseURLOverride) || normalizeBaseURL(settings.apiBaseURL);
  return {
    ...config,
    deepseek: {
      ...config.deepseek,
      baseURL: apiBaseURL || defaultConfig.deepseek.baseURL
    }
  };
}

function tryCreateDeepSeekProvider(config: AgentConfig): DeepSeekProvider | undefined {
  try {
    return new DeepSeekProvider(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Missing DeepSeek API key/i.test(message)) {
      return undefined;
    }
    throw error;
  }
}

function requestPermission(prompt: string, runId?: string): Promise<boolean> {
  const window = mainWindow;
  if (!window) {
    return Promise.resolve(false);
  }

  const requestId = `perm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve) => {
    pendingPermissions.set(requestId, { runId, resolve });
    window.webContents.send("permission:request", { requestId, prompt });
    setTimeout(() => {
      if (pendingPermissions.has(requestId)) {
        pendingPermissions.delete(requestId);
        resolve(false);
      }
    }, 120_000);
  });
}

function cancelPendingPermissions(runId?: string): void {
  for (const [requestId, pending] of pendingPermissions.entries()) {
    if (!runId || pending.runId === runId) {
      pendingPermissions.delete(requestId);
      pending.resolve(false);
    }
  }
}

function createStreamBatcher(sender: WebContents, runId: string, flushMs = 40): {
  push: (stream: AgentStreamEvent) => void;
  flush: () => void;
} {
  let pending: RunStreamEvent[] = [];
  let timer: NodeJS.Timeout | undefined;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (!pending.length || sender.isDestroyed()) {
      pending = [];
      return;
    }
    const events = compactStreamEvents(pending);
    pending = [];
    for (const stream of events) {
      sender.send("agent:stream", stream);
    }
  };

  return {
    push(stream: AgentStreamEvent) {
      pending.push({ ...stream, runId });
      if (!timer) {
        timer = setTimeout(flush, flushMs);
      }
    },
    flush
  };
}

function normalizeRunId(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resolveWorkspacePath(cwd: string, value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    throw new Error("Path is required.");
  }
  const target = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(cwd, raw);
  const normalizedCwd = normalizeComparablePath(cwd);
  const normalizedTarget = normalizeComparablePath(target);
  if (normalizedTarget !== normalizedCwd && !normalizedTarget.startsWith(`${normalizedCwd}${path.sep}`)) {
    throw new Error("Path must stay inside the current workspace.");
  }
  return target;
}

async function existingPathOrParent(target: string): Promise<{ path: string; fallback: boolean }> {
  try {
    await fs.stat(target);
    return { path: target, fallback: false };
  } catch {
    const parent = path.dirname(target);
    await fs.stat(parent);
    return { path: parent, fallback: true };
  }
}

function normalizeComparablePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function sanitizeConversationDirName(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  const sanitized = text.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return sanitized || `conv-${Date.now()}`;
}

function isAbortError(error: unknown): boolean {
  const value = error as { name?: string; message?: string };
  return /abort|interrupted|cancel/i.test(`${value.name || ""} ${value.message || ""}`);
}

function assertTrustedSender(url?: string): void {
  if (!url || !url.startsWith("file://")) {
    throw new Error("Untrusted IPC sender.");
  }
}

function summarizeContextItems(items: Array<{ id: string; type: string; stable: boolean; score: number; tokens: number }>) {
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    stable: item.stable,
    score: item.score,
    tokens: item.tokens
  }));
}

function settingsFilePath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

async function readDesktopSettings(): Promise<DesktopSettings> {
  try {
    const raw = await fs.readFile(settingsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as DesktopSettings;
    return {
      encryptedApiKey: typeof parsed.encryptedApiKey === "string" ? parsed.encryptedApiKey : undefined,
      defaultCwd: typeof parsed.defaultCwd === "string" ? parsed.defaultCwd : undefined,
      permissionMode: normalizePermissionMode(parsed.permissionMode),
      defaultModel: typeof parsed.defaultModel === "string" ? parsed.defaultModel : undefined,
      thinkingMode: normalizeThinkingMode(parsed.thinkingMode),
      maxTurns: normalizeMaxTurns(parsed.maxTurns),
      apiBaseURL: normalizeBaseURL(parsed.apiBaseURL),
      networkEnabled: typeof parsed.networkEnabled === "boolean" ? parsed.networkEnabled : undefined,
      autoCompressContext: typeof parsed.autoCompressContext === "boolean" ? parsed.autoCompressContext : undefined,
      disabledSkillPaths: normalizeStringArray(parsed.disabledSkillPaths)
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeDesktopSettings(settings: DesktopSettings): Promise<void> {
  const target = settingsFilePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(settings, null, 2), "utf8");
}

function encryptApiKey(apiKey: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Current OS keychain is unavailable, so the API key was not saved.");
  }
  return safeStorage.encryptString(apiKey).toString("base64");
}

function decryptApiKey(encryptedApiKey?: string): string | undefined {
  if (!encryptedApiKey || !safeStorage.isEncryptionAvailable()) {
    return undefined;
  }
  try {
    return safeStorage.decryptString(Buffer.from(encryptedApiKey, "base64"));
  } catch {
    return undefined;
  }
}

async function getEffectiveApiKey(requestApiKey?: string): Promise<string | undefined> {
  const inlineKey = requestApiKey?.trim();
  if (inlineKey) {
    return inlineKey;
  }
  const settings = await readDesktopSettings();
  return decryptApiKey(settings.encryptedApiKey);
}

function visibleSettings(settings: DesktopSettings): Omit<DesktopSettings, "encryptedApiKey"> {
  return {
    defaultCwd: settings.defaultCwd,
    permissionMode: settings.permissionMode,
    defaultModel: settings.defaultModel,
    thinkingMode: settings.thinkingMode,
    maxTurns: settings.maxTurns,
    apiBaseURL: settings.apiBaseURL,
    networkEnabled: settings.networkEnabled,
    autoCompressContext: settings.autoCompressContext,
    disabledSkillPaths: settings.disabledSkillPaths
  };
}

function normalizePermissionMode(value: unknown): PermissionMode | undefined {
  return value === "ask" || value === "allow" || value === "deny" || value === "full_access"
    ? value
    : undefined;
}

function normalizeThinkingMode(value: unknown): "auto" | "enabled" | "disabled" | undefined {
  return value === "auto" || value === "enabled" || value === "disabled" ? value : undefined;
}

function normalizeMaxTurns(value: unknown): AgentTurnLimit | undefined {
  if (value === "auto") {
    return "auto";
  }
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 16 ? numeric : undefined;
}

function normalizeBaseURL(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
  return text || undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return [...new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean))];
}

function sanitizeAttachedFiles(value: unknown): AttachedContextFile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, 8).map((item) => {
    const file = item as Partial<AttachedContextFile>;
    return {
      path: String(file.path || ""),
      name: String(file.name || path.basename(String(file.path || "attached-file"))),
      size: Number(file.size || 0),
      content: String(file.content || "").slice(0, 80_000)
    };
  }).filter((file) => file.path && file.content);
}

async function readAttachmentFiles(paths: string[]): Promise<AttachedContextFile[]> {
  const files: AttachedContextFile[] = [];
  for (const filePath of paths.slice(0, 8)) {
    try {
      const resolved = path.resolve(filePath);
      const stat = await fs.stat(resolved);
      if (!stat.isFile() || stat.size > 2_000_000) {
        continue;
      }
      const buffer = await fs.readFile(resolved);
      if (buffer.includes(0)) {
        continue;
      }
      files.push({
        path: resolved,
        name: path.basename(resolved),
        size: stat.size,
        content: buffer.toString("utf8").slice(0, 80_000)
      });
    } catch {
      // Ignore unreadable attachments; the renderer keeps the rest.
    }
  }
  return files;
}
