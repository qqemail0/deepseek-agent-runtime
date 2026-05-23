const api = window.agentDesktop;

const labels = {
  ready: "\u5c31\u7eea",
  previewing: "\u6b63\u5728\u6784\u5efa\u4e0a\u4e0b\u6587",
  running: "\u6b63\u5728\u8fd0\u884c",
  stopping: "\u6b63\u5728\u4e2d\u65ad",
  stopped: "\u5df2\u4e2d\u65ad",
  previewReady: "\u9884\u89c8\u5b8c\u6210",
  runComplete: "\u8fd0\u884c\u5b8c\u6210",
  error: "\u9519\u8bef",
  noModelCall: "\u672a\u8c03\u7528\u6a21\u578b",
  noTools: "\u5c1a\u65e0\u5de5\u5177\u8c03\u7528\u3002",
  noContext: "\u5c1a\u65e0\u6761\u76ee\u3002",
  noReasoning: "\u5c1a\u65e0\u601d\u8003\u5185\u5bb9\u3002",
  noFiles: "\u5c1a\u65e0\u6587\u4ef6\u53d8\u66f4\u3002",
  usingEnvKey: "\u5df2\u4f7f\u7528\u73af\u5883\u53d8\u91cf Key",
  usingSavedKey: "\u5df2\u4fdd\u5b58 Key\uff08\u672c\u673a\u52a0\u5bc6\uff09",
  settingsSaved: "\u8bbe\u7f6e\u5df2\u4fdd\u5b58\u3002",
  keyCleared: "\u5df2\u6e05\u9664\u672c\u673a\u4fdd\u5b58\u7684 Key\u3002",
  noSkills: "\u5c1a\u672a\u627e\u5230 Skill\u3002",
  cacheWarmup: "\u9996\u8f6e\u9884\u70ed",
  cacheReused: "\u5df2\u590d\u7528\u524d\u7f00",
  autoModel: "\u81ea\u52a8\u8def\u7531",
  noAttachments: "\u5c1a\u672a\u9644\u52a0\u6587\u4ef6\u3002"
};

const elements = {
  cwd: document.querySelector("#cwd"),
  chooseWorkspaceBtn: document.querySelector("#chooseWorkspaceBtn"),
  workspaceSelect: document.querySelector("#workspaceSelect"),
  conversationWorkspace: document.querySelector("#conversationWorkspace"),
  apiKey: document.querySelector("#apiKey"),
  apiBaseURL: document.querySelector("#apiBaseURL"),
  permissionMode: document.querySelector("#permissionMode"),
  networkEnabled: document.querySelector("#networkEnabled"),
  autoCompressContext: document.querySelector("#autoCompressContext"),
  maxTurns: document.querySelector("#maxTurns"),
  modelSelect: document.querySelector("#modelSelect"),
  syncModelsBtn: document.querySelector("#syncModelsBtn"),
  saveSettingsBtn: document.querySelector("#saveSettingsBtn"),
  settingsSaveInModalBtn: document.querySelector("#settingsSaveInModalBtn"),
  clearKeyBtn: document.querySelector("#clearKeyBtn"),
  settingsCloseBtn: document.querySelector("#settingsCloseBtn"),
  settingsStatus: document.querySelector("#settingsStatus"),
  conversationHistory: document.querySelector("#conversationHistory"),
  clearHistoryBtn: document.querySelector("#clearHistoryBtn"),
  refreshSkillsBtn: document.querySelector("#refreshSkillsBtn"),
  toggleSkillsBtn: document.querySelector("#toggleSkillsBtn"),
  skillsBody: document.querySelector("#skillsBody"),
  skillSearch: document.querySelector("#skillSearch"),
  skillsList: document.querySelector("#skillsList"),
  skillPreview: document.querySelector("#skillPreview"),
  thinkingMode: document.querySelector("#thinkingMode"),
  task: document.querySelector("#task"),
  previewBtn: document.querySelector("#previewBtn"),
  attachFileBtn: document.querySelector("#attachFileBtn"),
  attachedFiles: document.querySelector("#attachedFiles"),
  runBtn: document.querySelector("#runBtn"),
  stopBtn: document.querySelector("#stopBtn"),
  newConversationBtn: document.querySelector("#newConversationBtn"),
  settingsEntryBtn: document.querySelector("#settingsEntryBtn"),
  settingsSection: document.querySelector("#settingsSection"),
  output: document.querySelector("#output"),
  routeSummary: document.querySelector("#routeSummary"),
  costPill: document.querySelector("#costPill"),
  toolResults: document.querySelector("#toolResults"),
  statusText: document.querySelector("#statusText"),
  budgetDetails: document.querySelector("#budgetDetails"),
  contextItems: document.querySelector("#contextItems"),
  capabilityList: document.querySelector("#capabilityList"),
  cacheRecommendations: document.querySelector("#cacheRecommendations"),
  metricModel: document.querySelector("#metricModel"),
  metricThinking: document.querySelector("#metricThinking"),
  metricRequestCache: document.querySelector("#metricRequestCache"),
  metricConversationCache: document.querySelector("#metricConversationCache"),
  taskGoalCard: document.querySelector("#taskGoalCard"),
  taskCompletionStatus: document.querySelector("#taskCompletionStatus"),
  taskGoalText: document.querySelector("#taskGoalText"),
  taskGoalStage: document.querySelector("#taskGoalStage"),
  taskGoalEvidence: document.querySelector("#taskGoalEvidence"),
  progressBar: document.querySelector("#progressBar"),
  progressList: document.querySelector("#progressList"),
  reasoningPanel: document.querySelector("#reasoningPanel"),
  completedFiles: document.querySelector("#completedFiles"),
  learningPanel: document.querySelector("#learningPanel"),
  permissionModal: document.querySelector("#permissionModal"),
  permissionPrompt: document.querySelector("#permissionPrompt"),
  permissionState: document.querySelector("#permissionState"),
  permissionDenyBtn: document.querySelector("#permissionDenyBtn"),
  permissionApproveBtn: document.querySelector("#permissionApproveBtn"),
  cacheRates: document.querySelector("#cacheRates")
};

let activePermissionRequest = null;
let conversationMessages = [];
let conversationMemory = "";
let preferredModel = "";
let skillsCollapsed = false;
let allSkills = [];
let disabledSkillPaths = new Set();
let attachedFiles = [];
let conversationWorkspace = "";
let conversationWorkdir = "";
let activeActivity = null;
let activeRunId = null;
let activeRunConversationId = null;
let currentConversationId = newConversationId();
let restoringConversation = false;
let autoFollowTranscript = true;
let currentTaskStatus = emptyTaskStatus();
const SIDE_SECTION_PREF_KEY = "dsAgentSideSectionCollapsedV1";
const SKILLS_COLLAPSED_PREF_KEY = "dsAgentSkillsCollapsedV1";
const CONVERSATION_HISTORY_KEY = "dsAgentConversationHistoryV1";
const DELETED_CONVERSATION_IDS_KEY = "dsAgentDeletedConversationIdsV1";
const MAX_RENDERED_MESSAGES = 200;
const MAX_CONVERSATION_MESSAGES = 200;
const MAX_HISTORY_RECORDS = 50;
const MAX_COMPACT_STORED_MESSAGE_CHARS = 12_000;
const USD_TO_CNY_RATE = 6.8;
const sessionCache = {
  inputTokens: 0,
  outputTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
  estimatedCostUsd: 0
};
let lastRequestCache = undefined;
let lastCostText = "";

init();

async function init() {
  try {
    const defaults = await api.getDefaults();
    const settings = defaults.settings || {};
    preferredModel = settings.defaultModel || "auto";
    disabledSkillPaths = new Set(settings.disabledSkillPaths || []);
    conversationWorkspace = defaults.cwd;
    elements.cwd.value = defaults.cwd;
    await ensureCurrentConversationWorkdir();
    renderTaskStatus(currentTaskStatus);
    renderConversationHistory();
    elements.apiBaseURL.value = settings.apiBaseURL || "";
    if (settings.permissionMode) {
      elements.permissionMode.value = settings.permissionMode;
    }
    if (settings.thinkingMode) {
      elements.thinkingMode.value = settings.thinkingMode;
    }
    elements.maxTurns.value = String(settings.maxTurns || "auto");
    elements.networkEnabled.value = String(settings.networkEnabled !== false);
    elements.autoCompressContext.value = String(settings.autoCompressContext !== false);
    if (defaults.hasSavedApiKey) {
      elements.apiKey.placeholder = labels.usingSavedKey;
    } else if (defaults.hasApiKey) {
      elements.apiKey.placeholder = labels.usingEnvKey;
    }
    populateModels(defaults.defaultModels || []);
    renderCapabilities(defaults.capabilities || []);
    renderAttachments();
    setSkillsCollapsed(localStorage.getItem(SKILLS_COLLAPSED_PREF_KEY) === "true", false);
    await loadSkills();
    installSideSectionToggles();
    if (defaults.hasApiKey) {
      await syncModels();
    }
  } catch (error) {
    setOutput(errorMessage(error));
  }

  elements.syncModelsBtn.addEventListener("click", syncModels);
  elements.completedFiles.addEventListener("click", handleCompletedFileAction);
  elements.chooseWorkspaceBtn.addEventListener("click", chooseWorkspace);
  elements.saveSettingsBtn.addEventListener("click", saveSettings);
  elements.settingsSaveInModalBtn.addEventListener("click", saveSettings);
  elements.clearKeyBtn.addEventListener("click", clearSavedKey);
  elements.settingsCloseBtn.addEventListener("click", closeSettingsPanel);
  elements.clearHistoryBtn.addEventListener("click", clearConversationHistory);
  elements.permissionDenyBtn.addEventListener("click", () => answerPermission(false));
  elements.permissionApproveBtn.addEventListener("click", () => answerPermission(true));
  elements.refreshSkillsBtn.addEventListener("click", loadSkills);
  elements.toggleSkillsBtn.addEventListener("click", toggleSkills);
  elements.skillSearch.addEventListener("input", () => renderSkills());
  elements.cwd.addEventListener("change", () => {
    setConversationWorkspace(elements.cwd.value);
  });
  elements.workspaceSelect.addEventListener("change", () => {
    const selectedWorkspace = elements.workspaceSelect.value;
    if (selectedWorkspace) {
      setConversationWorkspace(selectedWorkspace);
    }
    elements.workspaceSelect.value = "";
  });
  elements.previewBtn.addEventListener("click", preview);
  elements.attachFileBtn.addEventListener("click", chooseFiles);
  elements.runBtn.addEventListener("click", runAgent);
  elements.stopBtn.addEventListener("click", cancelRun);
  elements.newConversationBtn.addEventListener("click", newConversation);
  elements.settingsEntryBtn.addEventListener("click", openSettingsPanel);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.settingsSection.classList.contains("hidden")) {
      closeSettingsPanel();
    }
  });
  elements.task.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      runAgent();
    }
  });
  elements.task.addEventListener("paste", handlePaste);
  elements.output.addEventListener("click", handleTranscriptClick);
  api.onAgentProgress((progress) => {
    if (acceptRunEvent(progress)) {
      renderProgress(progress);
    }
  });
  api.onAgentStream((stream) => {
    if (acceptRunEvent(stream)) {
      renderAgentStream(stream);
    }
  });
  bindTranscriptScroll();
  api.onPermissionRequest((payload) => {
    activePermissionRequest = payload.requestId;
    elements.permissionState.textContent = "\u5f85\u786e\u8ba4";
    renderPermissionBlock(payload.requestId, payload.prompt);
  });
}

async function syncModels() {
  setBusy("\u6b63\u5728\u540c\u6b65\u6a21\u578b");
  try {
    const result = await api.listModels({
      cwd: activeCwd(),
      apiKey: elements.apiKey.value,
      apiBaseURL: elements.apiBaseURL.value
    });
    populateModels(result.models || []);
    setIdle(result.ok ? "\u6a21\u578b\u5df2\u540c\u6b65" : "\u4f7f\u7528\u9ed8\u8ba4\u6a21\u578b");
    if (!result.ok) {
      setOutput(`\u6a21\u578b\u540c\u6b65\u5931\u8d25\uff0c\u5df2\u56de\u9000\u5230\u9ed8\u8ba4\u6a21\u578b\u3002\n${result.error || ""}`);
    }
  } catch (error) {
    setError(errorMessage(error));
  }
}

async function saveSettings() {
  setSettingsStatus("\u6b63\u5728\u4fdd\u5b58\u8bbe\u7f6e...");
  try {
    preferredModel = elements.modelSelect.value || preferredModel;
    const result = await api.saveSettings({
      apiKey: elements.apiKey.value,
      defaultCwd: activeCwd(),
      permissionMode: elements.permissionMode.value,
      defaultModel: elements.modelSelect.value || "auto",
      thinkingMode: elements.thinkingMode.value,
      maxTurns: selectedMaxTurns(),
      apiBaseURL: elements.apiBaseURL.value,
      networkEnabled: elements.networkEnabled.value === "true",
      autoCompressContext: elements.autoCompressContext.value === "true",
      disabledSkillPaths: [...disabledSkillPaths]
    });
    if (!result.ok) {
      throw new Error(result.error || "Save settings failed.");
    }
    elements.apiKey.value = "";
    if (result.hasSavedApiKey) {
      elements.apiKey.placeholder = labels.usingSavedKey;
    }
    setSettingsStatus(labels.settingsSaved);
  } catch (error) {
    setSettingsStatus(errorMessage(error), true);
  }
}

async function clearSavedKey() {
  setSettingsStatus("\u6b63\u5728\u6e05\u9664 Key...");
  try {
    const result = await api.clearSavedApiKey();
    if (!result.ok) {
      throw new Error(result.error || "Clear key failed.");
    }
    elements.apiKey.value = "";
    elements.apiKey.placeholder = "";
    setSettingsStatus(labels.keyCleared);
  } catch (error) {
    setSettingsStatus(errorMessage(error), true);
  }
}

async function chooseWorkspace() {
  try {
    const result = await api.chooseWorkspace({ cwd: activeCwd() });
    if (result.ok && result.cwd) {
      setConversationWorkspace(result.cwd);
    }
  } catch (error) {
    setSettingsStatus(errorMessage(error), true);
  }
}

function setConversationWorkspace(cwd) {
  conversationWorkspace = String(cwd || "").trim();
  conversationWorkdir = "";
  elements.cwd.value = conversationWorkspace;
  renderConversationWorkspace();
  renderWorkspaceHistory();
  loadSkills();
  void ensureCurrentConversationWorkdir().then(() => persistCurrentConversation());
}

function activeCwd() {
  return elements.cwd.value.trim() || conversationWorkspace;
}

async function ensureCurrentConversationWorkdir() {
  const cwd = activeCwd();
  if (!cwd || !api.ensureConversationWorkdir) {
    conversationWorkdir = "";
    renderConversationWorkspace();
    return "";
  }

  try {
    const result = await api.ensureConversationWorkdir({
      cwd,
      conversationId: currentConversationId
    });
    if (result?.ok && result.path) {
      conversationWorkdir = String(result.path);
    } else {
      conversationWorkdir = "";
    }
  } catch {
    conversationWorkdir = "";
  }
  renderConversationWorkspace();
  return conversationWorkdir;
}

function relativeConversationWorkdir() {
  const cwd = normalizeWorkspaceKey(activeCwd());
  const workdir = String(conversationWorkdir || "");
  const normalizedWorkdir = normalizeWorkspaceKey(workdir);
  if (cwd && normalizedWorkdir.startsWith(`${cwd}/`)) {
    return workdir.slice(String(activeCwd()).replace(/[\\/]+$/, "").length + 1);
  }
  return workdir;
}

function renderConversationWorkspace() {
  const workspace = shortPath(activeCwd() || "-");
  const workdir = conversationWorkdir ? ` | \u5bf9\u8bdd\u76ee\u5f55\uff1a${shortPath(relativeConversationWorkdir())}` : "";
  elements.conversationWorkspace.textContent = `\u5de5\u4f5c\u533a\uff1a${workspace}${workdir}`;
}

function openSettingsPanel() {
  elements.settingsSection?.classList.remove("hidden");
  elements.apiKey.focus();
}

function closeSettingsPanel() {
  elements.settingsSection?.classList.add("hidden");
}

function installSideSectionToggles() {
  const preferences = loadJsonMap(SIDE_SECTION_PREF_KEY);
  document.querySelectorAll(".left-panel .section, .right-panel .section").forEach((section) => {
    if (section.dataset.toggleReady === "true" || section.querySelector("#skillsBody")) {
      return;
    }
    section.dataset.toggleReady = "true";
    let title = section.querySelector(":scope > .section-title");
    const heading = section.querySelector(":scope > h2");
    if (!title && heading) {
      title = document.createElement("div");
      title.className = "section-title";
      section.insertBefore(title, heading);
      title.appendChild(heading);
    }
    if (!title) {
      return;
    }
    const button = document.createElement("button");
    button.className = "mini-btn section-collapse-btn";
    button.textContent = "\u6536\u8d77";
    title.appendChild(button);
    const rightPanel = section.closest(".right-panel");
    const sections = [...(rightPanel || section.closest(".left-panel"))?.querySelectorAll(".section") || []];
    const sectionIndex = sections.indexOf(section);
    const sectionKey = sideSectionPreferenceKey(section, sectionIndex);
    const defaultCollapsed = Boolean(rightPanel && sectionIndex >= 4);
    const collapsed = Object.prototype.hasOwnProperty.call(preferences, sectionKey)
      ? Boolean(preferences[sectionKey])
      : defaultCollapsed;
    setSectionCollapsed(section, button, collapsed);
    button.addEventListener("click", () => {
      const collapsed = section.classList.toggle("collapsed");
      setSectionCollapsed(section, button, collapsed);
      saveSideSectionPreference(sectionKey, collapsed);
    });
  });
}

function setSectionCollapsed(section, button, collapsed) {
  section.classList.toggle("collapsed", Boolean(collapsed));
  button.textContent = collapsed ? "\u5c55\u5f00" : "\u6536\u8d77";
}

function sideSectionPreferenceKey(section, index) {
  const side = section.closest(".left-panel") ? "left" : "right";
  const heading = section.querySelector(":scope > .section-title h2, :scope > h2")?.textContent?.trim();
  return `${side}:${heading || `section-${index}`}`;
}

function saveSideSectionPreference(key, collapsed) {
  const preferences = loadJsonMap(SIDE_SECTION_PREF_KEY);
  preferences[key] = Boolean(collapsed);
  localStorage.setItem(SIDE_SECTION_PREF_KEY, JSON.stringify(preferences));
}

async function loadSkills() {
  elements.skillsList.textContent = "\u6b63\u5728\u626b\u63cf Skill...";
  try {
    const result = await api.listSkills({ cwd: activeCwd() });
    if (!result.ok) {
      throw new Error(result.error || "List skills failed.");
    }
    allSkills = result.skills || [];
    renderSkills();
  } catch (error) {
    elements.skillsList.innerHTML = `<div class="skill-empty error">${escapeHtml(errorMessage(error))}</div>`;
  }
}

function renderSkills(skills = allSkills) {
  const query = elements.skillSearch.value.trim().toLowerCase();
  const visibleSkills = query
    ? skills.filter((skill) => `${skill.name} ${skill.description} ${skill.scope}`.toLowerCase().includes(query))
    : skills;

  if (!visibleSkills.length) {
    elements.skillsList.textContent = labels.noSkills;
    return;
  }

  elements.skillsList.innerHTML = visibleSkills
    .map((skill) => {
      const enabled = !disabledSkillPaths.has(skill.path || "");
      return `<div class="skill-row ${enabled ? "" : "disabled"}" data-skill="${escapeHtml(skill.name)}" data-skill-path="${escapeHtml(skill.path || "")}">
        <label class="skill-toggle">
          <input type="checkbox" ${enabled ? "checked" : ""} data-skill-toggle="${escapeHtml(skill.path || "")}" />
          <span>${enabled ? "\u542f\u7528" : "\u5173\u95ed"}</span>
        </label>
        <button class="skill-open" data-skill-open="${escapeHtml(skill.path || "")}">
          <span>${escapeHtml(skill.name)} <small>${escapeHtml(skill.scope || "project")}</small></span>
          <strong>${escapeHtml(skill.description || "")}</strong>
          <em>${escapeHtml(skill.tokens || 0)} tokens</em>
        </button>
      </div>`;
    })
    .join("");

  elements.skillsList.querySelectorAll("[data-skill-toggle]").forEach((node) => {
    node.addEventListener("change", () => toggleSkill(node.getAttribute("data-skill-toggle"), node.checked));
  });
  elements.skillsList.querySelectorAll("[data-skill-open]").forEach((node) => {
    node.addEventListener("click", () => {
      const row = node.closest("[data-skill]");
      previewSkill(row?.getAttribute("data-skill"), row?.getAttribute("data-skill-path"));
    });
  });
}

function toggleSkill(skillPath, enabled) {
  if (!skillPath) {
    return;
  }
  if (enabled) {
    disabledSkillPaths.delete(skillPath);
  } else {
    disabledSkillPaths.add(skillPath);
  }
  renderSkills();
  setSettingsStatus("\u6280\u80fd\u5f00\u5173\u5df2\u66f4\u65b0\uff0c\u70b9\u51fb\u4fdd\u5b58\u8bbe\u7f6e\u540e\u6301\u4e45\u5316\u3002");
}

function toggleSkills() {
  setSkillsCollapsed(!skillsCollapsed, true);
}

function setSkillsCollapsed(collapsed, persist) {
  skillsCollapsed = Boolean(collapsed);
  elements.skillsBody.hidden = skillsCollapsed;
  elements.toggleSkillsBtn.textContent = skillsCollapsed ? "\u5c55\u5f00" : "\u6536\u8d77";
  if (persist) {
    localStorage.setItem(SKILLS_COLLAPSED_PREF_KEY, String(skillsCollapsed));
  }
}

async function previewSkill(name, skillPath) {
  if (!name && !skillPath) {
    return;
  }
  elements.skillPreview.textContent = "\u6b63\u5728\u61d2\u52a0\u8f7d Skill...";
  try {
    const result = await api.readSkill({ cwd: activeCwd(), name, path: skillPath });
    if (!result.ok) {
      throw new Error(result.error || "Read skill failed.");
    }
    const skill = result.skill;
    elements.skillPreview.innerHTML = `<div class="skill-head">
      <strong>${escapeHtml(skill.name)}</strong>
      <span>${escapeHtml(skill.scope || "project")} | ${escapeHtml(skill.tokens)} tokens</span>
    </div>
    <p>${escapeHtml(skill.description || "")}</p>
    <code>${escapeHtml(skill.path || "")}</code>
    <pre>${escapeHtml(skill.body || "")}</pre>`;
  } catch (error) {
    elements.skillPreview.innerHTML = `<div class="skill-empty error">${escapeHtml(errorMessage(error))}</div>`;
  }
}

async function chooseFiles() {
  try {
    const result = await api.chooseFiles({ cwd: activeCwd() });
    if (!result.ok) {
      throw new Error(result.error || "Choose files failed.");
    }
    addAttachments(result.files || []);
  } catch (error) {
    appendMessage("error", errorMessage(error));
  }
}

async function handlePaste(event) {
  const pastedFiles = [...(event.clipboardData?.files || [])];
  if (pastedFiles.length) {
    const files = [];
    for (const file of pastedFiles.slice(0, 8)) {
      try {
        const content = await file.text();
        if (content && !content.includes("\u0000")) {
          files.push({
            path: file.path || `clipboard:${file.name}`,
            name: file.name || "clipboard-file",
            size: file.size || content.length,
            content
          });
        }
      } catch {
        // Keep normal paste behavior for unreadable clipboard files.
      }
    }
    if (files.length) {
      addAttachments(files);
      event.preventDefault();
      return;
    }
  }

  const text = event.clipboardData?.getData("text/plain") || "";
  const paths = extractLocalPaths(text);
  if (!paths.length) {
    return;
  }
  try {
    const result = await api.readFiles({ paths });
    if (result.ok && result.files?.length) {
      addAttachments(result.files);
      event.preventDefault();
    }
  } catch {
    // Keep normal paste behavior if paths cannot be read.
  }
}

function extractLocalPaths(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^"|"$/g, ""))
    .filter((line) => /^[a-zA-Z]:\\/.test(line) || /^\\\\/.test(line))
    .slice(0, 8);
}

function addAttachments(files) {
  const byPath = new Map(attachedFiles.map((file) => [file.path, file]));
  for (const file of files) {
    if (file?.path && file?.content) {
      byPath.set(file.path, file);
    }
  }
  attachedFiles = [...byPath.values()].slice(0, 8);
  renderAttachments();
}

function renderAttachments() {
  if (!attachedFiles.length) {
    elements.attachedFiles.innerHTML = "";
    return;
  }
  elements.attachedFiles.innerHTML = attachedFiles
    .map((file, index) => `<div class="attachment">
      <span>${escapeHtml(file.name || file.path)}</span>
      <em>${escapeHtml(formatBytes(file.size || 0))}</em>
      <button data-remove-attachment="${index}" title="\u79fb\u9664">\u00d7</button>
    </div>`)
    .join("");
  elements.attachedFiles.querySelectorAll("[data-remove-attachment]").forEach((node) => {
    node.addEventListener("click", () => {
      attachedFiles.splice(Number(node.getAttribute("data-remove-attachment")), 1);
      renderAttachments();
    });
  });
}

async function preview() {
  resetRunPanels();
  setBusy(labels.previewing);
  try {
    await ensureCurrentConversationWorkdir();
    const result = await api.previewContext({
      task: elements.task.value,
      cwd: activeCwd(),
      model: selectedModel(),
      thinking: selectedThinking(),
      conversationSummary: buildConversationSummary(),
      disabledSkillPaths: [...disabledSkillPaths],
      attachedFiles,
      networkEnabled: elements.networkEnabled.value === "true",
      autoCompressContext: elements.autoCompressContext.value === "true"
    });
    if (!result.ok) {
      throw new Error(result.error || "Preview failed.");
    }
    appendMessage("system", result.content);
    renderRoute(result.route, result.profile, result.estimatedTokens);
    renderBudget(result.budgetReport, false);
    renderContextItems(result.contextItems || []);
    elements.costPill.textContent = labels.noModelCall;
    elements.metricRequestCache.textContent = "-";
    elements.metricConversationCache.textContent = "-";
    renderCacheRates(undefined, undefined);
    renderTools([]);
    renderCompletedFiles([]);
    renderReasoning([]);
    renderRecommendations(result.budgetReport?.recommendations || []);
    setIdle(labels.previewReady);
  } catch (error) {
    setError(errorMessage(error));
  }
}

async function runAgent() {
  if (activeRunId) {
    return;
  }
  const outboundFiles = [...attachedFiles];
  const userTask = elements.task.value.trim() || (outboundFiles.length ? "\u8bf7\u5206\u6790\u9644\u4ef6\u3002" : "");
  if (!userTask) {
    setIdle(labels.ready);
    return;
  }
  const runId = newRunId();
  const runConversationId = currentConversationId;
  activeRunId = runId;
  activeRunConversationId = runConversationId;
  resetRunPanels();
  beginTaskStatus(userTask, outboundFiles);
  setBusy(labels.running, true);
  renderProgress({ stage: "route", message: "\u51c6\u5907\u8fd0\u884c", percent: 4 });
  appendMessage("user", userTask, outboundFiles);
  elements.task.value = "";
  attachedFiles = [];
  renderAttachments();
  beginInlineActivity(outboundFiles);
  recordLearningFromTask(userTask);
  try {
    await ensureCurrentConversationWorkdir();
    const result = await api.runAgent({
      runId,
      task: userTask,
      cwd: activeCwd(),
      apiKey: elements.apiKey.value,
      permissionMode: elements.permissionMode.value,
      maxTurns: selectedMaxTurns(),
      model: selectedModel(),
      thinking: selectedThinking(),
      conversationSummary: buildConversationSummary(),
      disabledSkillPaths: [...disabledSkillPaths],
      attachedFiles: outboundFiles,
      networkEnabled: elements.networkEnabled.value === "true",
      autoCompressContext: elements.autoCompressContext.value === "true"
    });
    if (!isCurrentRun(runId) || currentConversationId !== runConversationId) {
      return;
    }
    if (!result.ok) {
      if (result.aborted) {
        handleInterruptedRun(userTask, result.error || "\u5bf9\u8bdd\u5df2\u4e2d\u65ad\uff0c\u53ef\u4ee5\u91cd\u65b0\u53d1\u9001\u3002");
        return;
      }
      throw new Error(result.error || "Agent run failed.");
    }
    const assistantContent = reconciledAssistantContent(result);
    result.content = assistantContent;
    if (activeActivity?.streamedText) {
      finalizeStreamedAnswer(assistantContent);
      recordConversationMessage("assistant", assistantContent);
    } else {
      appendMessage("assistant", assistantContent);
    }
    updateConversationMemory(userTask, assistantContent);
    renderRoute(result.route, result.profile);
    renderBudget(result.budgetReport, true);
    renderContextItems(result.contextItems || []);
    elements.costPill.textContent = result.cost || "\u5c1a\u65e0\u7528\u91cf";
    lastRequestCache = normalizeCacheSnapshot(result.requestCache);
    lastCostText = result.cost || "";
    mergeSessionCache(result.conversationCache);
    const sessionSnapshot = sessionCacheSnapshot();
    elements.metricRequestCache.textContent = formatCacheRate(result.requestCache);
    elements.metricConversationCache.textContent = formatCacheRate(sessionSnapshot);
    renderCacheRates(result.requestCache, sessionSnapshot);
    renderRecommendations(cacheAwareRecommendations(result.cacheHealth?.recommendations || result.budgetReport?.recommendations || [], result.budgetReport, result.requestCache));
    renderTools(result.toolResults || []);
    renderReasoning(result.reasoning || []);
    renderCompletedFiles(result.completedFiles || [], result.toolResults || []);
    completeInlineActivity(result);
    completeTaskStatus(result);
    renderProgress({ stage: "final", message: "\u5df2\u5b8c\u6210", percent: 100 });
    persistCurrentConversation();
    setIdle(labels.runComplete);
  } catch (error) {
    if (isCurrentRun(runId)) {
      renderProgress({ stage: "error", message: errorMessage(error), percent: 100 });
      failTaskStatus(errorMessage(error));
      failInlineActivity(errorMessage(error));
      setError(errorMessage(error));
    }
  } finally {
    if (activeRunId === runId) {
      activeRunId = null;
      activeRunConversationId = null;
      elements.stopBtn.hidden = true;
      elements.stopBtn.disabled = true;
      elements.stopBtn.textContent = "\u4e2d\u65ad";
    }
  }
}

async function cancelRun() {
  if (!activeRunId) {
    return;
  }
  const runId = activeRunId;
  elements.stopBtn.disabled = true;
  elements.stopBtn.textContent = "\u4e2d\u65ad\u4e2d";
  elements.statusText.textContent = labels.stopping;
  activePermissionRequest = null;
  elements.permissionState.textContent = "\u5df2\u4e2d\u65ad";
  closePermissionModal();
  try {
    const result = await api.cancelAgent(runId);
    if (!result.ok) {
      throw new Error(result.error || "Cancel failed.");
    }
  } catch (error) {
    setError(errorMessage(error));
  }
}

function handleInterruptedRun(userTask, message) {
  const text = message || "\u5bf9\u8bdd\u5df2\u4e2d\u65ad\uff0c\u53ef\u4ee5\u91cd\u65b0\u53d1\u9001\u3002";
  if (!elements.task.value.trim()) {
    elements.task.value = userTask;
  }
  interruptInlineActivity(text);
  interruptTaskStatus(text);
  appendMessage("system", `${text}\n\u539f\u8bf7\u6c42\u5df2\u653e\u56de\u8f93\u5165\u6846\uff0c\u53ef\u76f4\u63a5\u56de\u8f66\u91cd\u65b0\u6267\u884c\u3002`);
  renderProgress({ stage: "error", message: "\u5df2\u4e2d\u65ad\uff0c\u7b49\u5f85\u91cd\u65b0\u8fd0\u884c", percent: 100 });
  setIdle(labels.stopped);
}

function newConversation() {
  persistCurrentConversation();
  currentConversationId = newConversationId();
  conversationMessages = [];
  conversationMemory = "";
  sessionCache.inputTokens = 0;
  sessionCache.outputTokens = 0;
  sessionCache.cacheHitTokens = 0;
  sessionCache.cacheMissTokens = 0;
  sessionCache.estimatedCostUsd = 0;
  lastRequestCache = undefined;
  lastCostText = "";
  currentTaskStatus = emptyTaskStatus();
  attachedFiles = [];
  activeActivity = null;
  conversationWorkdir = "";
  conversationWorkspace = elements.cwd.value || conversationWorkspace;
  elements.output.innerHTML = "";
  appendMessage("system", `\u5df2\u65b0\u5efa\u5bf9\u8bdd\u3002\u5f53\u524d\u5de5\u4f5c\u533a\uff1a${activeCwd()}\n\u4e0a\u4e0b\u6587\u3001\u4f1a\u8bdd\u547d\u4e2d\u7387\u548c\u5f53\u524d\u5bf9\u8bdd\u8bb0\u5fc6\u5df2\u6e05\u7a7a\u3002`);
  renderLearning();
  renderTaskStatus(currentTaskStatus);
  renderCacheRates(undefined, sessionCacheSnapshot());
  elements.metricRequestCache.textContent = "-";
  elements.metricConversationCache.textContent = "-";
  elements.costPill.textContent = "\u5c1a\u65e0\u6210\u672c\u6570\u636e";
  resetRunPanels();
  renderAttachments();
  renderReasoning([]);
  renderCompletedFiles([]);
  renderTools([]);
  renderContextItems([]);
  renderBudget(undefined);
  renderRecommendations([]);
  void ensureCurrentConversationWorkdir().then(() => persistCurrentConversation());
  renderConversationHistory();
}

async function answerPermission(approved) {
  if (!activePermissionRequest) {
    return;
  }
  await api.answerPermission(activePermissionRequest, approved);
  activePermissionRequest = null;
  elements.permissionState.textContent = approved ? "\u5df2\u5141\u8bb8" : "\u5df2\u62d2\u7edd";
  closePermissionModal();
}

function populateModels(models) {
  const current = elements.modelSelect.value || preferredModel;
  const normalized = models.length ? models : [
    { id: "deepseek-v4-flash", ownedBy: "deepseek" },
    { id: "deepseek-v4-pro", ownedBy: "deepseek" }
  ];
  elements.modelSelect.innerHTML = `<option value="auto">${labels.autoModel}</option>` + normalized
    .map((model) => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.id)} · ${escapeHtml(model.ownedBy || "deepseek")}</option>`)
    .join("");
  if (current === "auto") {
    elements.modelSelect.value = "auto";
  } else if (current && normalized.some((model) => model.id === current)) {
    elements.modelSelect.value = current;
  }
}

function selectedModel() {
  return elements.modelSelect.value && elements.modelSelect.value !== "auto" ? elements.modelSelect.value : undefined;
}

function selectedThinking() {
  return elements.thinkingMode.value === "auto" ? undefined : elements.thinkingMode.value;
}

function selectedMaxTurns() {
  return elements.maxTurns.value === "auto" ? "auto" : Number(elements.maxTurns.value || 8);
}

function renderRoute(route, profile, estimatedTokens) {
  elements.routeSummary.textContent = route
    ? `${route.model} | thinking ${route.thinking} | ${profile?.kind || "task"} | ${route.source || "auto"}`
    : "\u5c1a\u672a\u9009\u62e9\u8def\u7531";

  elements.metricModel.textContent = route?.model || "-";
  elements.metricThinking.textContent = route?.thinking || "-";
  if (!elements.metricRequestCache.textContent || elements.metricRequestCache.textContent === "-") {
    elements.metricRequestCache.textContent = estimatedTokens ? `${estimatedTokens} ctx` : "-";
  }
}

function renderBudget(report, markPrefix = false) {
  if (!report) {
    elements.budgetDetails.innerHTML = "";
    return;
  }
  const prefixHash = report.cacheablePrefixHash || report.stablePrefixHash;
  const prefixState = prefixHash ? prefixWarmState(prefixHash, markPrefix) : "-";

  const rows = [
    ["\u9884\u7b97", report.budgetTokens],
    ["\u52a8\u6001\u9884\u7b97", report.dynamicBudgetTokens || "-"],
    ["\u5df2\u7528", report.usedTokens],
    ["\u7a33\u5b9a", report.stableTokens],
    ["\u52a8\u6001", report.dynamicTokens],
    ["\u53ef\u7f13\u5b58", report.cacheablePrefixTokens ?? report.stableTokens],
    ["\u6ce2\u52a8\u5c3e\u90e8", report.volatileTailTokens ?? report.dynamicTokens],
    ["\u6700\u5c0f\u52a8\u6001", report.minimumDynamicTokens ?? "-"],
    ["\u53ef\u9009\u52a8\u6001", report.optionalDynamicTokens ?? "-"],
    ["\u9884\u4f30\u590d\u7528", formatRate(report.projectedWarmCacheHitRate ?? report.stableRatio)],
    ["99.1\u4e0a\u9650", report.dynamicTokenCeilingForTarget ?? "-"],
    ["\u8d85\u989d", report.dynamicTokensOverTarget ?? 0],
    ["\u9700\u7a33\u5b9a\u8865\u9f50", report.stablePaddingTokensForTarget ?? 0],
    ["\u538b\u7f29", report.compressionLevel || "none"],
    ["\u8282\u7701", report.compressedTokensSaved || 0],
    ["\u524d\u7f00", prefixHash],
    ["\u9884\u70ed", prefixState],
    ["\u7b56\u7565", report.cacheStrategy]
  ];

  elements.budgetDetails.innerHTML = rows
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function renderCacheRates(requestCache, conversationCache) {
  const rows = [
    ["\u5f53\u6b21", requestCache],
    ["\u5f53\u524d\u5bf9\u8bdd", conversationCache],
    ["\u76ee\u6807", { cacheHitRate: 0.991, cacheHitTokens: "-", cacheMissTokens: "-" }]
  ];
  elements.cacheRates.innerHTML = rows
    .map(([label, item]) => `<div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(label === "\u76ee\u6807" ? formatRate(item?.cacheHitRate) : formatCacheRate(item))}</strong>
      <em>${escapeHtml(cacheTokenText(item))}</em>
    </div>`)
    .join("");
}

function cacheTokenText(item) {
  const denominator = Number(item?.cacheHitTokens || 0) + Number(item?.cacheMissTokens || 0);
  return item && denominator > 0 ? `hit ${item.cacheHitTokens} / miss ${item.cacheMissTokens}` : "-";
}

function prefixWarmState(hash, markPrefix) {
  const key = "dsAgentStablePrefixWarm";
  const seen = loadJsonMap(key);
  const seenBefore = Boolean(seen[hash]);
  if (markPrefix) {
    seen[hash] = Date.now();
    localStorage.setItem(key, JSON.stringify(seen));
  }
  return seenBefore ? labels.cacheReused : labels.cacheWarmup;
}

function cacheAwareRecommendations(items, budgetReport, requestCache) {
  const recommendations = [...items];
  const hasModelUsage = Number(requestCache?.cacheHitTokens || 0) + Number(requestCache?.cacheMissTokens || 0) > 0;
  if (hasModelUsage && requestCache.cacheHitRate < 0.2) {
    recommendations.unshift("\u9996\u6b21\u4f7f\u7528\u67d0\u4e2a\u7a33\u5b9a\u524d\u7f00\u65f6\uff0cDeepSeek \u8fd8\u6ca1\u6709\u53ef\u590d\u7528\u7684\u8fdc\u7a0b\u7f13\u5b58\uff0c\u4f4e\u547d\u4e2d\u662f\u6b63\u5e38\u7684\uff1b\u7b2c\u4e8c\u6b21\u8d77\u624d\u80fd\u89c2\u5bdf\u771f\u5b9e\u524d\u7f00\u590d\u7528\u3002");
  }
  if (budgetReport?.cacheStrategy === "excellent") {
    recommendations.push("\u5f53\u524d\u524d\u7f00\u5df2\u7ecf\u5c3d\u91cf\u7a33\u5b9a\uff1a\u4e0d\u6539\u7cfb\u7edf\u89c4\u5219\u548c Skill \u5185\u5bb9\uff0c\u52a8\u6001\u6587\u4ef6\u7247\u6bb5\u653e\u5728\u5c3e\u90e8\u3002");
  }
  if (Number(budgetReport?.dynamicTokensOverTarget || 0) > 0) {
    recommendations.push(`99.1% \u76ee\u6807\u9700\u8981\u6781\u5c0f\u52a8\u6001\u5c3e\u90e8\uff1a\u5f53\u524d\u8d85\u51fa ${budgetReport.dynamicTokensOverTarget} \u4f30\u7b97 token\u3002\u4e3a\u4e86\u771f\u5b9e\u964d\u4f4e\u6d88\u8017\uff0c\u5df2\u4f18\u5148\u88c1\u526a\u52a8\u6001\u4e0a\u4e0b\u6587\uff0c\u800c\u4e0d\u662f\u7528\u5197\u957f\u524d\u7f00\u5237\u547d\u4e2d\u7387\u3002`);
  }
  if (budgetReport && budgetReport.targetReachableWithoutPadding === false) {
    recommendations.push(`\u5f53\u524d\u8f6e\u6b21\u4ec5\u7528\u6237\u4efb\u52a1\u672c\u8eab\u5c31\u9700\u8981\u7ea6 ${budgetReport.minimumDynamicTokens || 0} \u4f30\u7b97 token\uff0c\u5728\u4e0d\u589e\u52a0\u5197\u4f59\u524d\u7f00\u7684\u524d\u63d0\u4e0b\u65e0\u6cd5\u7a33\u5b9a\u8fbe\u5230 99.1%\uff1b\u7b97\u6cd5\u5df2\u6539\u4e3a\u88c1\u526a\u53ef\u9009\u4e0a\u4e0b\u6587\u6765\u964d\u4f4e\u771f\u5b9e miss tokens\u3002`);
  }
  return [...new Set(recommendations)];
}

function mergeSessionCache(cache) {
  if (!cache) {
    return;
  }
  sessionCache.inputTokens += Number(cache.inputTokens || 0);
  sessionCache.outputTokens += Number(cache.outputTokens || 0);
  sessionCache.cacheHitTokens += Number(cache.cacheHitTokens || 0);
  sessionCache.cacheMissTokens += Number(cache.cacheMissTokens || 0);
  sessionCache.estimatedCostUsd += Number(cache.estimatedCostUsd || 0);
}

function sessionCacheSnapshot() {
  const denominator = sessionCache.cacheHitTokens + sessionCache.cacheMissTokens;
  return normalizeCacheSnapshot({
    ...sessionCache,
    cacheHitRate: denominator ? sessionCache.cacheHitTokens / denominator : 0
  });
}

function conversationMetricsSnapshot() {
  const conversationCache = sessionCacheSnapshot();
  return {
    version: 1,
    lastRequestCache: hasCacheUsage(lastRequestCache) ? normalizeCacheSnapshot(lastRequestCache) : undefined,
    conversationCache,
    costText: lastCostText || "",
    costUsd: conversationCache.estimatedCostUsd,
    updatedAt: Date.now()
  };
}

function conversationMetricsFromRecord(record) {
  const metrics = record?.metrics || {};
  const conversationCache = normalizeCacheSnapshot(metrics.conversationCache || record?.sessionCache);
  const lastRequest = normalizeCacheSnapshot(metrics.lastRequestCache || metrics.requestCache || record?.lastRequestCache);
  return {
    lastRequestCache: lastRequest,
    conversationCache,
    costText: String(metrics.costText || record?.costText || ""),
    costUsd: Number(metrics.costUsd ?? conversationCache.estimatedCostUsd ?? 0)
  };
}

function normalizeCacheSnapshot(value = {}) {
  const inputTokens = Number(value.inputTokens || 0);
  const outputTokens = Number(value.outputTokens || 0);
  const cacheHitTokens = Number(value.cacheHitTokens || 0);
  const cacheMissTokens = Number(value.cacheMissTokens || 0);
  const estimatedCostUsd = Number(value.estimatedCostUsd || 0);
  const denominator = cacheHitTokens + cacheMissTokens;
  const cacheHitRate = denominator > 0 ? cacheHitTokens / denominator : Number(value.cacheHitRate || 0);
  return {
    inputTokens,
    outputTokens,
    cacheHitTokens,
    cacheMissTokens,
    cacheHitRate,
    estimatedCostUsd
  };
}

function hasCacheUsage(cache) {
  return Number(cache?.cacheHitTokens || 0) + Number(cache?.cacheMissTokens || 0) > 0;
}

function renderContextItems(items) {
  if (!items.length) {
    elements.contextItems.textContent = labels.noContext;
    return;
  }

  elements.contextItems.innerHTML = items
    .slice(0, 14)
    .map((item) => `<div class="context-item ${item.stable ? "stable" : "dynamic"}">
      <span>${escapeHtml(item.type)} ${item.stable ? "stable" : "dynamic"}</span>
      <strong>${escapeHtml(item.id)}</strong>
      <em>${escapeHtml(item.tokens)} tokens | score ${escapeHtml(item.score)}</em>
    </div>`)
    .join("");
}

function renderTools(toolResults) {
  if (!toolResults.length) {
    elements.toolResults.textContent = labels.noTools;
    return;
  }

  elements.toolResults.innerHTML = toolResults
    .map((tool) => {
      const state = tool.ok ? "ok" : "fail";
      return `<div class="tool ${state}">
        <span>${escapeHtml(tool.risk || "safe")}</span>
        <p>${escapeHtml(tool.summary || "")}</p>
      </div>`;
    })
    .join("");
}

function renderReasoning(items) {
  if (!items.length) {
    elements.reasoningPanel.textContent = labels.noReasoning;
    return;
  }

  elements.reasoningPanel.innerHTML = items
    .map((item, index) => `<details>
      <summary>${escapeHtml(inlineReasoningTitle(item, index))}</summary>
      <pre>${escapeHtml(item)}</pre>
    </details>`)
    .join("");
}

function reasoningTitle(item, index) {
  if (/^任务分类摘要/.test(item)) return "\u4efb\u52a1\u5206\u7c7b";
  if (/^模型路由摘要/.test(item)) return "\u6a21\u578b\u8def\u7531";
  if (/^工具候选/.test(item)) return "\u5de5\u5177\u9009\u62e9";
  if (/^上下文预算/.test(item)) return "\u4e0a\u4e0b\u6587\u9884\u7b97";
  if (/^直接操作/.test(item)) return "\u76f4\u63a5\u7535\u8111\u64cd\u4f5c";
  if (/^直接工具调用|^工具结果/.test(item)) return "\u5de5\u5177\u6267\u884c";
  return `\u601d\u8003\u7247\u6bb5 ${index + 1}`;
}

function renderCompletedFiles(files = [], toolResults = []) {
  const entries = collectCompletedFileEntries(files, toolResults);
  if (!entries.length) {
    elements.completedFiles.textContent = labels.noFiles;
    return;
  }

  elements.completedFiles.innerHTML = entries
    .map((item) => `<div class="file-item audit-item">
      <strong title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</strong>
      <span>${typeof item.added === "number" || typeof item.removed === "number" ? `+${escapeHtml(item.added || 0)} / -${escapeHtml(item.removed || 0)}` : "\u5df2\u5b8c\u6210"}</span>
      <div class="file-actions">
        <button data-completed-action="open" data-completed-path="${escapeHtml(item.path)}" title="\u6253\u5f00\u6587\u4ef6\u6216\u76ee\u5f55">\u6253\u5f00</button>
        <button data-completed-action="reveal" data-completed-path="${escapeHtml(item.path)}" title="\u5728\u8d44\u6e90\u7ba1\u7406\u5668\u4e2d\u5b9a\u4f4d">\u5b9a\u4f4d</button>
      </div>
    </div>`)
    .join("");
}

async function handleCompletedFileAction(event) {
  const button = event.target?.closest?.("[data-completed-action]");
  if (!button || !elements.completedFiles.contains(button)) {
    return;
  }

  const action = button.getAttribute("data-completed-action");
  const filePath = button.getAttribute("data-completed-path");
  if (!action || !filePath) {
    return;
  }

  const original = button.textContent;
  button.disabled = true;
  button.textContent = "\u5904\u7406";
  try {
    const result = await api.openPath({
      cwd: activeCwd(),
      path: filePath,
      action
    });
    if (!result.ok) {
      throw new Error(result.error || "Open path failed.");
    }
    button.textContent = result.fallback ? "\u76ee\u5f55" : "\u5b8c\u6210";
  } catch (error) {
    button.textContent = "\u5931\u8d25";
    setSettingsStatus(errorMessage(error), true);
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = original;
    }, 1100);
  }
}

function renderFileAudit(toolResults) {
  renderCompletedFiles([], toolResults);
}

function renderInlineFileAudit(result) {
  const audit = collectFileAudit(result.toolResults || []);
  if (!audit.length || !activeActivity?.details) {
    return;
  }
  activeActivity.details.insertAdjacentHTML("beforeend", `<details open><summary>\u6587\u4ef6\u4fee\u6539\u5ba1\u8ba1</summary>${audit
    .map((item) => `<pre>${escapeHtml(item.path)}  +${escapeHtml(item.added)} / -${escapeHtml(item.removed)}</pre>`)
    .join("")}</details>`);
}

function collectFileAudit(toolResults) {
  const byPath = new Map();
  for (const tool of toolResults || []) {
    for (const item of normalizeAuditItems(tool?.metadata?.audit)) {
      const current = byPath.get(item.path) || { path: item.path, added: 0, removed: 0 };
      current.added += item.added;
      current.removed += item.removed;
      byPath.set(item.path, current);
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function collectCompletedFileEntries(files = [], toolResults = []) {
  const byPath = new Map();
  for (const item of collectFileAudit(toolResults)) {
    byPath.set(item.path, item);
  }
  for (const file of collectCompletedFilePaths(files, toolResults)) {
    if (!byPath.has(file)) {
      byPath.set(file, { path: file, added: undefined, removed: undefined });
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function collectCompletedFilePaths(files = [], toolResults = []) {
  const paths = new Set(files.map((file) => String(file || "").trim()).filter(Boolean));
  for (const tool of toolResults || []) {
    const metadata = tool?.metadata || {};
    const audit = normalizeAuditItems(metadata.audit);
    const explicitlyUnmodified = metadata.modified === false || metadata.checkOnly === true;
    const modified = metadata.modified === true || (!explicitlyUnmodified && audit.length > 0);
    if (!modified) {
      continue;
    }
    if (typeof metadata.path === "string" && metadata.path.trim()) {
      paths.add(metadata.path.trim());
    }
    if (Array.isArray(metadata.paths)) {
      for (const item of metadata.paths) {
        const pathValue = String(item || "").trim();
        if (pathValue) {
          paths.add(pathValue);
        }
      }
    }
    for (const item of audit) {
      paths.add(item.path);
    }
  }
  return [...paths];
}

function normalizeAuditItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => ({
      path: String(item?.path || "").trim(),
      added: Number(item?.added || 0),
      removed: Number(item?.removed || 0)
    }))
    .filter((item) => item.path && (item.added || item.removed));
}

function createMessageArticle(role, content, files = []) {
  const safeRole = role || "system";
  const article = document.createElement("article");
  article.className = `message ${safeRole}`;
  const fileBlock = files.length
    ? `<div class="message-attachments">${files.map((file) => `<span>${escapeHtml(file.name || file.path)} <em>${escapeHtml(formatBytes(file.size || 0))}</em></span>`).join("")}</div>`
    : "";
  article.copyText = String(content || "");
  article.innerHTML = `<div class="message-role"><span>${escapeHtml(roleLabel(safeRole))}</span><button class="message-copy-btn" data-copy-message title="\u590d\u5236\u8fd9\u6761\u5bf9\u8bdd" aria-label="\u590d\u5236\u8fd9\u6761\u5bf9\u8bdd">\u590d\u5236</button></div><div class="message-body"><pre>${escapeHtml(content || "")}</pre>${fileBlock}</div>`;
  return article;
}

function appendMessage(role, content, files = []) {
  const safeRole = role || "system";
  const followBottom = safeRole === "user" || isTranscriptNearBottom();
  const article = createMessageArticle(safeRole, content, files);
  elements.output.appendChild(article);
  const attachmentSummary = files.length ? `\nAttachments: ${files.map((file) => file.path || file.name).join(", ")}` : "";
  recordConversationMessage(safeRole, `${String(content || "")}${attachmentSummary}`);
  const oldMessages = [...elements.output.querySelectorAll(".message")];
  oldMessages.slice(0, Math.max(0, oldMessages.length - MAX_RENDERED_MESSAGES)).forEach((node) => node.remove());
  requestAnimationFrame(() => {
    if (followBottom) {
      elements.output.scrollTop = elements.output.scrollHeight;
    }
  });
}

function recordConversationMessage(role, content) {
  addConversationMessage(role, content);
  persistCurrentConversation();
}

function addConversationMessage(role, content) {
  conversationMessages.push({
    role: role || "system",
    content: String(content || ""),
    at: Date.now()
  });
  if (conversationMessages.length > MAX_CONVERSATION_MESSAGES) {
    conversationMessages = conversationMessages.slice(-MAX_CONVERSATION_MESSAGES);
  }
}

function commitActiveActivitySnapshot(reason) {
  if (!activeActivity) {
    return false;
  }
  const streamed = String(activeActivity.streamedText || "").trim();
  const status = reason || "\u5df2\u4fdd\u5b58\u5f53\u524d\u8fd0\u884c\u7684\u53ef\u89c1\u8f93\u51fa\u3002";
  if (streamed) {
    const content = `${streamed}\n\n[\u72b6\u6001] ${status}`;
    const last = conversationMessages.at(-1);
    if (!(last?.role === "assistant" && last.content === content)) {
      addConversationMessage("assistant", content);
    }
  } else {
    addConversationMessage("system", `[\u72b6\u6001] ${status}`);
  }
  return true;
}

function bindTranscriptScroll() {
  elements.output.addEventListener("wheel", (event) => {
    if (elements.output.scrollHeight <= elements.output.clientHeight) {
      return;
    }
    event.preventDefault();
    elements.output.scrollTop += event.deltaY;
    autoFollowTranscript = isTranscriptNearBottom(140);
  }, { passive: false });
  elements.output.addEventListener("scroll", () => {
    autoFollowTranscript = isTranscriptNearBottom(140);
  });
}

function isTranscriptNearBottom(threshold = 80) {
  const distance = elements.output.scrollHeight - elements.output.clientHeight - elements.output.scrollTop;
  return distance < threshold;
}

function scrollTranscriptToBottom() {
  requestAnimationFrame(() => {
    elements.output.scrollTop = elements.output.scrollHeight;
  });
}

async function handleTranscriptClick(event) {
  const button = event.target?.closest?.("[data-copy-message]");
  if (!button || !elements.output.contains(button)) {
    return;
  }
  const article = button.closest(".message");
  const text = article?.copyText || article?.querySelector(".message-body pre, .stream-output pre")?.textContent || "";
  if (!String(text).trim()) {
    flashCopyButton(button, false);
    return;
  }
  try {
    await copyTextToClipboard(text);
    flashCopyButton(button, true);
  } catch {
    flashCopyButton(button, false);
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(String(text));
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = String(text);
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Copy failed.");
  }
}

function flashCopyButton(button, ok) {
  const original = button.dataset.originalText || button.textContent || "\u590d\u5236";
  button.dataset.originalText = original;
  button.textContent = ok ? "\u5df2\u590d\u5236" : "\u5931\u8d25";
  button.classList.toggle("copied", Boolean(ok));
  button.classList.toggle("copy-failed", !ok);
  window.setTimeout(() => {
    button.textContent = original;
    button.classList.remove("copied", "copy-failed");
  }, 1100);
}

function roleLabel(role) {
  if (role === "user") return "\u4f60";
  if (role === "assistant") return "Agent";
  if (role === "error") return "\u9519\u8bef";
  return "\u7cfb\u7edf";
}

function renderConversationHistory() {
  const records = loadConversationHistory();
  renderWorkspaceHistory(records);
  if (!records.length) {
    elements.conversationHistory.textContent = "\u5c1a\u65e0\u5386\u53f2\u5bf9\u8bdd\u3002";
    return;
  }

  elements.conversationHistory.innerHTML = records
    .map((record) => {
      const metrics = conversationMetricsFromRecord(record);
      return `<div class="history-item ${record.id === currentConversationId ? "active" : ""}">
      <button class="history-open" data-conversation-id="${escapeHtml(record.id)}">
        <strong>${escapeHtml(record.title || "\u672a\u547d\u540d\u5bf9\u8bdd")}</strong>
        <span>${escapeHtml(shortPath(record.cwd || ""))}</span>
        <div class="history-metrics">
          <span>\u4f1a\u8bdd ${escapeHtml(formatCacheRate(metrics.conversationCache))}</span>
          <span>\u5f53\u6b21 ${escapeHtml(formatCacheRate(metrics.lastRequestCache))}</span>
          <span>${escapeHtml(historyTokenText(metrics.conversationCache))}</span>
          <span>${escapeHtml(compactCostText(metrics.conversationCache) || "-")}</span>
        </div>
        <em>${escapeHtml(formatHistoryTime(record.updatedAt))}</em>
      </button>
      <button class="history-delete" data-delete-conversation-id="${escapeHtml(record.id)}" title="\u5220\u9664\u8fd9\u4e2a\u5bf9\u8bdd">\u5220\u9664</button>
    </div>`;
    })
    .join("");
  elements.conversationHistory.querySelectorAll("[data-conversation-id]").forEach((node) => {
    node.addEventListener("click", () => restoreConversation(node.getAttribute("data-conversation-id")));
  });
  elements.conversationHistory.querySelectorAll("[data-delete-conversation-id]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteConversation(node.getAttribute("data-delete-conversation-id"));
    });
  });
}

function renderWorkspaceHistory(records = loadConversationHistory()) {
  if (!elements.workspaceSelect) {
    return;
  }
  const workspaces = workspaceHistoryOptions(records);
  elements.workspaceSelect.disabled = workspaces.length === 0;
  elements.workspaceSelect.innerHTML = [
    `<option value="">${workspaces.length ? "\u5386\u53f2\u5de5\u4f5c\u533a" : "\u65e0\u5386\u53f2\u5de5\u4f5c\u533a"}</option>`,
    ...workspaces.map((workspace) => `<option value="${escapeHtml(workspace.cwd)}">${escapeHtml(workspace.label)}</option>`)
  ].join("");
}

function workspaceHistoryOptions(records) {
  const seen = new Set();
  const workspaces = [];
  for (const record of records) {
    const cwd = String(record?.cwd || "").trim();
    const key = normalizeWorkspaceKey(cwd);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    workspaces.push({ cwd, label: shortPath(cwd) });
    if (workspaces.length >= 16) {
      break;
    }
  }
  return workspaces;
}

function normalizeWorkspaceKey(cwd) {
  return String(cwd || "").trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

async function prepareCurrentConversationForSwitch(targetConversationId) {
  if (targetConversationId === currentConversationId && !activeRunId) {
    persistCurrentConversation();
    return false;
  }

  const hadActiveRun = Boolean(activeRunId);
  if (hadActiveRun) {
    commitActiveActivitySnapshot("\u5207\u6362\u5386\u53f2\u5bf9\u8bdd\u65f6\u5df2\u4fdd\u5b58\u53ef\u89c1\u8f93\u51fa\uff0c\u5e76\u4e2d\u65ad\u539f\u8fd0\u884c\u3002");
    const runId = activeRunId;
    activeRunId = null;
    activeRunConversationId = null;
    activePermissionRequest = null;
    closePermissionModal();
    try {
      await api.cancelAgent(runId);
    } catch {
      // The run may already have ended; the saved snapshot is still valid.
    }
    elements.stopBtn.hidden = true;
    elements.stopBtn.disabled = true;
    elements.stopBtn.textContent = "\u4e2d\u65ad";
  }

  persistCurrentConversation();
  activeActivity = null;
  return hadActiveRun;
}

async function restoreConversation(id) {
  if (!id) {
    return;
  }
  if (id === currentConversationId && !activeRunId) {
    return;
  }

  const canceledActiveRun = await prepareCurrentConversationForSwitch(id);
  const record = loadConversationHistory().find((item) => item.id === id);
  if (!record) {
    return;
  }

  restoringConversation = true;
  currentConversationId = record.id;
  conversationMessages = Array.isArray(record.messages) ? record.messages.slice(-MAX_CONVERSATION_MESSAGES) : [];
  conversationMemory = record.memory || "";
  currentTaskStatus = normalizeTaskStatus(record.taskStatus);
  conversationWorkdir = String(record.conversationWorkdir || "");
  elements.task.value = record.draft || "";
  const metrics = conversationMetricsFromRecord(record);
  lastRequestCache = hasCacheUsage(metrics.lastRequestCache) ? metrics.lastRequestCache : undefined;
  lastCostText = metrics.costText || "";
  resetSessionCache(metrics.conversationCache);
  if (record.cwd) {
    conversationWorkspace = record.cwd;
    elements.cwd.value = record.cwd;
    loadSkills();
  }
  elements.output.innerHTML = "";
  for (const message of conversationMessages) {
    elements.output.appendChild(createMessageArticle(message.role, message.content));
  }
  if (!conversationMessages.length) {
    elements.output.appendChild(createMessageArticle("system", "\u5df2\u52a0\u8f7d\u7a7a\u5bf9\u8bdd\u3002"));
  }
  restoringConversation = false;
  if (conversationWorkdir) {
    renderConversationWorkspace();
  } else {
    void ensureCurrentConversationWorkdir();
  }
  renderLearning();
  renderTaskStatus(currentTaskStatus);
  resetRunPanels();
  renderCacheRates(lastRequestCache, sessionCacheSnapshot());
  elements.metricRequestCache.textContent = formatCacheRate(lastRequestCache);
  elements.metricConversationCache.textContent = formatCacheRate(sessionCacheSnapshot());
  elements.costPill.textContent = lastCostText || compactCostText(sessionCacheSnapshot()) || "\u5c1a\u65e0\u6210\u672c\u6570\u636e";
  renderReasoning([]);
  renderCompletedFiles([]);
  renderTools([]);
  renderContextItems([]);
  renderBudget(undefined);
  renderRecommendations([]);
  renderConversationHistory();
  if (canceledActiveRun) {
    setIdle("\u5df2\u4fdd\u5b58\u5e76\u5207\u6362\u5bf9\u8bdd");
  }
  requestAnimationFrame(() => {
    elements.output.scrollTop = elements.output.scrollHeight;
  });
}

function persistCurrentConversation() {
  if (restoringConversation) {
    return;
  }
  if (isConversationDeleted(currentConversationId)) {
    return;
  }
  const draft = currentConversationDraft();
  const meaningful = conversationMessages.some((message) => ["user", "assistant", "error"].includes(message.role)) || Boolean(draft);
  if (!meaningful) {
    renderConversationHistory();
    return;
  }
  const record = {
    id: currentConversationId,
    title: conversationTitle(conversationMessages, draft),
    cwd: activeCwd(),
    conversationWorkdir,
    updatedAt: Date.now(),
    messages: conversationMessages.slice(-MAX_CONVERSATION_MESSAGES),
    draft,
    memory: conversationMemory,
    taskStatus: currentTaskStatus,
    sessionCache: { ...sessionCache },
    metrics: conversationMetricsSnapshot()
  };
  const records = loadConversationHistory().filter((item) => item.id !== currentConversationId);
  saveConversationHistory([record, ...records].slice(0, MAX_HISTORY_RECORDS));
  renderConversationHistory();
}

function currentConversationDraft() {
  return String(elements.task?.value || "").trim();
}

function clearConversationHistory() {
  const existingIds = loadConversationHistory().map((item) => item.id);
  markConversationsDeleted([...existingIds, currentConversationId]);
  localStorage.removeItem(CONVERSATION_HISTORY_KEY);
  resetCurrentConversationState();
  elements.output.innerHTML = "";
  appendMessage("system", "\u5df2\u6e05\u7a7a\u5386\u53f2\u5bf9\u8bdd\uff0c\u5e76\u65b0\u5efa\u4e00\u4e2a\u672a\u4fdd\u5b58\u7684\u7a7a\u5bf9\u8bdd\u3002");
  renderTaskStatus(currentTaskStatus);
  renderConversationHistory();
}

function deleteConversation(id) {
  if (!id) {
    return;
  }
  markConversationsDeleted([id]);
  const records = loadConversationHistory().filter((item) => item.id !== id);
  saveConversationHistory(records);
  if (id === currentConversationId) {
    resetCurrentConversationState();
    elements.output.innerHTML = "";
    appendMessage("system", "\u5df2\u5220\u9664\u5f53\u524d\u5bf9\u8bdd\uff0c\u5e76\u65b0\u5efa\u4e00\u4e2a\u7a7a\u5bf9\u8bdd\u3002");
    renderLearning();
    currentTaskStatus = emptyTaskStatus();
    renderTaskStatus(currentTaskStatus);
    renderCacheRates(undefined, sessionCacheSnapshot());
    renderReasoning([]);
    renderCompletedFiles([]);
    renderTools([]);
    renderContextItems([]);
    renderBudget(undefined);
    renderRecommendations([]);
  }
  renderConversationHistory();
}

function loadConversationHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONVERSATION_HISTORY_KEY) || "[]");
    const deleted = deletedConversationIds();
    return Array.isArray(parsed)
      ? parsed
        .filter((item) => item && typeof item.id === "string" && !deleted.has(item.id))
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      : [];
  } catch {
    return [];
  }
}

function saveConversationHistory(records) {
  const deleted = deletedConversationIds();
  const visibleRecords = records.filter((record) => record?.id && !deleted.has(record.id));
  try {
    localStorage.setItem(CONVERSATION_HISTORY_KEY, JSON.stringify(visibleRecords));
  } catch {
    try {
      localStorage.setItem(CONVERSATION_HISTORY_KEY, JSON.stringify(compactHistoryForStorage(visibleRecords)));
    } catch {
      localStorage.setItem(CONVERSATION_HISTORY_KEY, JSON.stringify(compactHistoryForStorage(visibleRecords.slice(0, 12))));
    }
  }
}

function compactHistoryForStorage(records) {
  return records.slice(0, MAX_HISTORY_RECORDS).map((record, index) => ({
    ...record,
    messages: Array.isArray(record.messages)
      ? record.messages
        .slice(index === 0 ? -120 : -20)
        .map((message) => ({
          ...message,
          content: compactStoredMessage(message?.content)
        }))
      : []
  }));
}

function compactStoredMessage(content) {
  const text = String(content || "");
  if (text.length <= MAX_COMPACT_STORED_MESSAGE_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_COMPACT_STORED_MESSAGE_CHARS)}\n\n[历史存储压缩：该条消息过长，仅保留前 ${MAX_COMPACT_STORED_MESSAGE_CHARS} 个字符。]`;
}

function resetCurrentConversationState() {
  currentConversationId = newConversationId();
  conversationMessages = [];
  conversationMemory = "";
  resetSessionCache();
  lastRequestCache = undefined;
  lastCostText = "";
  attachedFiles = [];
  activeActivity = null;
  currentTaskStatus = emptyTaskStatus();
  renderAttachments();
}

function deletedConversationIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETED_CONVERSATION_IDS_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function isConversationDeleted(id) {
  return deletedConversationIds().has(id);
}

function markConversationsDeleted(ids) {
  const deleted = deletedConversationIds();
  for (const id of ids) {
    if (id) {
      deleted.add(id);
    }
  }
  const compact = [...deleted].slice(-500);
  localStorage.setItem(DELETED_CONVERSATION_IDS_KEY, JSON.stringify(compact));
}

function conversationTitle(messages, draft = "") {
  const firstUser = messages.find((message) => message.role === "user")?.content;
  return compactText(firstUser || draft || "\u65b0\u5bf9\u8bdd", 42);
}

function newConversationId() {
  return `conv-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function newRunId() {
  return `run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function isCurrentRun(runId) {
  return Boolean(runId && activeRunId === runId);
}

function acceptRunEvent(event) {
  return !event?.runId || event.runId === activeRunId;
}

function resetSessionCache(value = {}) {
  sessionCache.inputTokens = Number(value.inputTokens || 0);
  sessionCache.outputTokens = Number(value.outputTokens || 0);
  sessionCache.cacheHitTokens = Number(value.cacheHitTokens || 0);
  sessionCache.cacheMissTokens = Number(value.cacheMissTokens || 0);
  sessionCache.estimatedCostUsd = Number(value.estimatedCostUsd || 0);
}

function formatHistoryTime(value) {
  const time = Number(value || 0);
  if (!time) {
    return "-";
  }
  return new Date(time).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildConversationSummary() {
  const recent = conversationMessages
    .slice(-4)
    .map((item) => `${roleLabel(item.role)}: ${compactText(item.content, 180)}`)
    .join("\n");
  const learning = loadLearningNotes().slice(-5).map((item) => `- ${compactText(item, 120)}`).join("\n");
  const workdir = conversationWorkdir ? `Current conversation work directory:\n${conversationWorkdir}` : "";
  return [
    workdir,
    conversationMemory ? `Running summary:\n${compactText(conversationMemory, 650)}` : "",
    learning ? `User corrections/preferences learned:\n${learning}` : "",
    recent ? `Recent turns:\n${recent}` : ""
  ].filter(Boolean).join("\n\n");
}

function updateConversationMemory(task, answer) {
  const line = `Task: ${compactText(task, 140)} | Result: ${compactText(answer, 180)}`;
  conversationMemory = compactText([conversationMemory, line].filter(Boolean).join("\n"), 900);
  renderLearning();
  persistCurrentConversation();
}

function recordLearningFromTask(task) {
  if (/sk-[a-z0-9]/i.test(task)) {
    return;
  }
  if (!/(\u8bb0\u4f4f|\u4ee5\u540e|\u4e0d\u8981|\u522b|\u66f4\u559c\u6b22|\u504f\u597d|\u4e0d\u5bf9|wrong|prefer|remember|never)/i.test(task)) {
    return;
  }
  const notes = loadLearningNotes();
  const note = compactText(task, 220);
  if (!notes.includes(note)) {
    notes.push(note);
    localStorage.setItem("dsAgentLearningNotes", JSON.stringify(notes.slice(-30)));
  }
  renderLearning();
}

function loadLearningNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem("dsAgentLearningNotes") || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function loadJsonMap(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function renderLearning() {
  const notes = loadLearningNotes();
  const sections = [
    conversationMemory ? `<div><span>\u5f53\u524d\u6458\u8981</span><p>${escapeHtml(conversationMemory)}</p></div>` : "",
    notes.length ? `<div><span>\u7ea0\u9519 / \u504f\u597d</span><p>${escapeHtml(notes.slice(-6).join("\n"))}</p></div>` : ""
  ].filter(Boolean);
  elements.learningPanel.innerHTML = sections.length ? sections.join("") : "\u5c1a\u65e0\u4f1a\u8bdd\u6458\u8981\u6216\u7ea0\u9519\u4fe1\u53f7\u3002";
}

function renderCapabilities(items) {
  if (!items.length) {
    elements.capabilityList.textContent = "-";
    return;
  }

  elements.capabilityList.innerHTML = items
    .map((item) => `<div class="capability ${escapeHtml(item.status)}">
      <span>${escapeHtml(localizeStatus(item.status))}</span>
      <strong>${escapeHtml(item.name)}</strong>
    </div>`)
    .join("");
}

function renderRecommendations(items) {
  if (!items.length) {
    elements.cacheRecommendations.innerHTML = "";
    return;
  }

  elements.cacheRecommendations.innerHTML = items
    .map((item) => `<li>${escapeHtml(localizeRecommendation(item))}</li>`)
    .join("");
}

function emptyTaskStatus() {
  return {
    status: "idle",
    label: "\u5f85\u786e\u8ba4",
    goal: "\u5c1a\u672a\u8fd0\u884c\u4efb\u52a1\u3002",
    stage: "\u72b6\u6001\uff1a\u5f85\u673a",
    evidence: "\u5b8c\u6210\u4f9d\u636e\uff1a-",
    percent: 0,
    updatedAt: Date.now()
  };
}

function normalizeTaskStatus(value) {
  if (!value || typeof value !== "object") {
    return emptyTaskStatus();
  }
  return {
    ...emptyTaskStatus(),
    ...value,
    status: ["idle", "running", "done", "partial", "failed", "interrupted"].includes(value.status) ? value.status : "idle",
    label: String(value.label || "\u5f85\u786e\u8ba4"),
    goal: String(value.goal || "\u5c1a\u672a\u8fd0\u884c\u4efb\u52a1\u3002"),
    stage: String(value.stage || "\u72b6\u6001\uff1a\u5f85\u673a"),
    evidence: String(value.evidence || "\u5b8c\u6210\u4f9d\u636e\uff1a-"),
    percent: Number(value.percent || 0)
  };
}

function beginTaskStatus(task, files = []) {
  currentTaskStatus = {
    status: "running",
    label: "\u76ee\u6807\u5df2\u786e\u8ba4",
    goal: taskGoalText(task, files),
    stage: "\u72b6\u6001\uff1a\u51c6\u5907\u8fd0\u884c",
    evidence: "\u5b8c\u6210\u4f9d\u636e\uff1a\u7b49\u5f85\u6a21\u578b\u548c\u5de5\u5177\u7ed3\u679c",
    percent: 0,
    updatedAt: Date.now()
  };
  renderTaskStatus(currentTaskStatus);
}

function updateTaskStatusProgress(progress) {
  if (currentTaskStatus.status !== "running") {
    return;
  }
  currentTaskStatus = {
    ...currentTaskStatus,
    stage: `\u72b6\u6001\uff1a${localizeProgress(progress.message || progress.stage)}`,
    percent: Math.max(0, Math.min(100, Number(progress.percent || 0))),
    updatedAt: Date.now()
  };
  renderTaskStatus(currentTaskStatus);
}

function completeTaskStatus(result) {
  const assessment = assessTaskCompletion(result);
  currentTaskStatus = {
    ...currentTaskStatus,
    status: assessment.status,
    label: assessment.label,
    stage: `\u72b6\u6001\uff1a${assessment.stage}`,
    evidence: `\u5b8c\u6210\u4f9d\u636e\uff1a${assessment.evidence}`,
    percent: 100,
    updatedAt: Date.now()
  };
  renderTaskStatus(currentTaskStatus);
}

function failTaskStatus(message) {
  currentTaskStatus = {
    ...currentTaskStatus,
    status: "failed",
    label: "\u5931\u8d25",
    stage: "\u72b6\u6001\uff1a\u8fd0\u884c\u5931\u8d25",
    evidence: `\u5b8c\u6210\u4f9d\u636e\uff1a${compactText(message, 180)}`,
    percent: 100,
    updatedAt: Date.now()
  };
  renderTaskStatus(currentTaskStatus);
}

function interruptTaskStatus(message) {
  currentTaskStatus = {
    ...currentTaskStatus,
    status: "interrupted",
    label: "\u5df2\u4e2d\u65ad",
    stage: "\u72b6\u6001\uff1a\u7528\u6237\u4e2d\u65ad",
    evidence: `\u5b8c\u6210\u4f9d\u636e\uff1a${compactText(message, 180)}`,
    percent: 100,
    updatedAt: Date.now()
  };
  renderTaskStatus(currentTaskStatus);
}

function renderTaskStatus(state = currentTaskStatus) {
  if (!elements.taskGoalCard) {
    return;
  }
  const normalized = normalizeTaskStatus(state);
  elements.taskGoalCard.className = `task-goal-card ${normalized.status}`;
  elements.taskCompletionStatus.textContent = normalized.label;
  elements.taskGoalText.textContent = normalized.goal;
  elements.taskGoalStage.textContent = normalized.stage;
  elements.taskGoalEvidence.textContent = normalized.evidence;
}

function taskGoalText(task, files = []) {
  const base = compactText(task, 220) || "\u8bf7\u5206\u6790\u5f53\u524d\u8f93\u5165\u3002";
  const fileNote = files.length
    ? `\n\u9644\u4ef6\uff1a${files.map((file) => file.name || file.path).slice(0, 3).join(", ")}${files.length > 3 ? ` \u7b49 ${files.length} \u4e2a` : ""}`
    : "";
  return `${base}${fileNote}`;
}

function assessTaskCompletion(result) {
  const content = String(result?.content || "");
  const tools = Array.isArray(result?.toolResults) ? result.toolResults : [];
  const completedFiles = Array.isArray(result?.completedFiles) ? result.completedFiles : [];
  const failedTools = tools.filter((item) => !item.ok).length;
  const successfulTools = tools.length - failedTools;
  const textSignalsFailure = /permission denied|operation failed|blocked|failed|error|\u5931\u8d25|\u9519\u8bef|\u62d2\u7edd|\u65e0\u6cd5|\u672a\u80fd|\u6ca1\u6709\u6743\u9650/i.test(content);
  const textSignalsPartial = /partial|unfinished|remaining|continue|next request|\u90e8\u5206|\u672a\u5b8c\u6210|\u9700\u8981\u7ee7\u7eed|\u5269\u4f59|\u4e0b\u4e00\u6b65|\u65e0\u6cd5\u786e\u8ba4|\u672a\u9a8c\u8bc1/i.test(content);
  const evidence = completionEvidence({ content, tools, completedFiles, successfulTools, failedTools });

  if (result?.ok === false || (failedTools > 0 && successfulTools === 0 && textSignalsFailure)) {
    return {
      status: "failed",
      label: "\u5931\u8d25",
      stage: "\u672a\u5b8c\u6210",
      evidence
    };
  }

  if (failedTools > 0 || textSignalsPartial) {
    return {
      status: "partial",
      label: "\u90e8\u5206\u5b8c\u6210",
      stage: "\u9700\u8981\u590d\u6838",
      evidence
    };
  }

  return {
    status: "done",
    label: "\u5df2\u5b8c\u6210",
    stage: "\u76ee\u6807\u5df2\u5b8c\u6210",
    evidence
  };
}

function completionEvidence({ content, tools, completedFiles, successfulTools, failedTools }) {
  const parts = [];
  if (content.trim()) {
    parts.push("\u5df2\u8fd4\u56de\u6700\u7ec8\u56de\u7b54");
  }
  if (tools.length) {
    parts.push(`\u5de5\u5177 ${successfulTools}/${tools.length} \u6210\u529f`);
  }
  if (completedFiles.length) {
    parts.push(`\u5b8c\u6210\u6587\u4ef6 ${completedFiles.length} \u4e2a`);
  }
  if (failedTools) {
    parts.push(`\u5931\u8d25 ${failedTools} \u9879`);
  }
  return parts.join("\uff0c") || "\u5df2\u6536\u5230\u8fd0\u884c\u7ed3\u679c";
}

function renderProgress(progress) {
  elements.progressBar.style.width = `${Math.max(0, Math.min(100, Number(progress.percent || 0)))}%`;
  updateTaskStatusProgress(progress);
  const line = document.createElement("div");
  line.className = `progress-line ${progress.stage}`;
  line.innerHTML = `<span>${escapeHtml(progress.percent || 0)}%</span><strong>${escapeHtml(localizeProgress(progress.message || progress.stage))}</strong>`;
  elements.progressList.prepend(line);
  const nodes = [...elements.progressList.querySelectorAll(".progress-line")];
  nodes.slice(12).forEach((node) => node.remove());
  updateInlineActivity(progress);
}

function beginInlineActivity(files = []) {
  const article = document.createElement("article");
  article.className = "message assistant activity-message";
  const fileNote = files.length ? `<div class="activity-files">${files.map((file) => `<span>${escapeHtml(file.name || file.path)}</span>`).join("")}</div>` : "";
  article.copyText = "";
  article.innerHTML = `<div class="message-role"><span>Agent</span><button class="message-copy-btn" data-copy-message title="\u590d\u5236\u8fd9\u6761\u5bf9\u8bdd" aria-label="\u590d\u5236\u8fd9\u6761\u5bf9\u8bdd">\u590d\u5236</button></div>
    <div class="message-body">
      <div class="activity-head">
        <strong>\u6b63\u5728\u6267\u884c</strong>
        <span class="activity-status">\u51c6\u5907\u8fd0\u884c</span>
      </div>
      <div class="activity-progress"><div class="activity-progress-bar"></div></div>
      ${fileNote}
      <div class="stream-output" hidden><pre></pre></div>
      <details class="stream-reasoning" hidden>
        <summary>\u5b9e\u65f6\u601d\u8003</summary>
        <pre></pre>
      </details>
      <div class="activity-steps"></div>
      <div class="activity-details"></div>
    </div>`;
  elements.output.appendChild(article);
  autoFollowTranscript = true;
  activeActivity = {
    article,
    status: article.querySelector(".activity-status"),
    bar: article.querySelector(".activity-progress-bar"),
    steps: article.querySelector(".activity-steps"),
    details: article.querySelector(".activity-details"),
    streamOutput: article.querySelector(".stream-output"),
    streamPre: article.querySelector(".stream-output pre"),
    reasoningBox: article.querySelector(".stream-reasoning"),
    reasoningPre: article.querySelector(".stream-reasoning pre"),
    streamedText: "",
    streamedReasoning: ""
  };
  scrollTranscriptToBottom();
}

function updateInlineActivity(progress) {
  if (!activeActivity) {
    return;
  }
  activeActivity.status.textContent = localizeProgress(progress.message || progress.stage);
  activeActivity.bar.style.width = `${Math.max(0, Math.min(100, Number(progress.percent || 0)))}%`;
  const line = document.createElement("div");
  line.className = `activity-step ${progress.stage}`;
  line.innerHTML = `<span>${escapeHtml(progress.percent || 0)}%</span><strong>${escapeHtml(localizeProgress(progress.message || progress.stage))}</strong>`;
  activeActivity.steps.appendChild(line);
  const rows = [...activeActivity.steps.querySelectorAll(".activity-step")];
  rows.slice(0, Math.max(0, rows.length - 10)).forEach((node) => node.remove());
}

function renderAgentStream(stream) {
  if (!activeActivity || !stream?.delta) {
    return;
  }
  if (stream.type === "reasoning") {
    activeActivity.streamedReasoning += stream.delta;
    activeActivity.reasoningBox.hidden = false;
    activeActivity.reasoningPre.textContent = compactLiveText(activeActivity.streamedReasoning, 9000);
    return;
  }

  activeActivity.streamedText += stream.delta;
  activeActivity.article.copyText = activeActivity.streamedText;
  activeActivity.streamOutput.hidden = false;
  activeActivity.streamPre.textContent = activeActivity.streamedText;
  activeActivity.status.textContent = "\u6b63\u5728\u8fde\u7eed\u8f93\u51fa";
  if (autoFollowTranscript) {
    scrollTranscriptToBottom();
  }
}

function finalizeStreamedAnswer(content) {
  if (!activeActivity?.streamPre) {
    return String(content || "");
  }
  const merged = mergeDisplayText(activeActivity.streamedText, content);
  activeActivity.streamedText = merged;
  activeActivity.article.copyText = merged;
  activeActivity.streamOutput.hidden = false;
  activeActivity.streamPre.textContent = merged;
  return merged;
}

function completeInlineActivity(result) {
  if (!activeActivity) {
    return;
  }
  activeActivity.status.textContent = "\u5df2\u5b8c\u6210";
  activeActivity.bar.style.width = "100%";
  const displayContent = mergeDisplayText(activeActivity.streamedText, result.content);
  if (displayContent && activeActivity.streamPre) {
    activeActivity.streamedText = displayContent;
    activeActivity.article.copyText = displayContent;
    activeActivity.streamOutput.hidden = false;
    activeActivity.streamPre.textContent = displayContent;
  }
  const reasoning = result.reasoning || [];
  const tools = result.toolResults || [];
  const files = result.completedFiles || [];
  activeActivity.details.innerHTML = [
    reasoning.length ? `<details><summary>\u6267\u884c\u8f68\u8ff9 / \u601d\u8003</summary>${reasoning.map((item, index) => `<details class="inline-reasoning-fragment"><summary>${escapeHtml(inlineReasoningTitle(item, index))}</summary><pre>${escapeHtml(item)}</pre></details>`).join("")}</details>` : "",
    tools.length ? `<details><summary>\u5de5\u5177\u7ed3\u679c</summary>${tools.map((tool) => `<pre>${escapeHtml(tool.summary || "")}</pre>`).join("")}</details>` : "",
    files.length ? `<details><summary>\u5b8c\u6210\u6587\u4ef6</summary>${files.map((file) => `<pre>${escapeHtml(file)}</pre>`).join("")}</details>` : ""
  ].filter(Boolean).join("");
  renderInlineFileAudit(result);
  scrollTranscriptToBottom();
  activeActivity = null;
}

function reconciledAssistantContent(result) {
  return mergeDisplayText(activeActivity?.streamedText || "", result?.content || "");
}

function mergeDisplayText(streamedContent, finalContent) {
  const streamed = String(streamedContent || "");
  const final = String(finalContent || "");
  if (!streamed) {
    return final;
  }
  if (!final) {
    return streamed;
  }
  if (streamed === final) {
    return final;
  }
  if (final.includes(streamed)) {
    return final;
  }
  if (streamed.includes(final)) {
    return streamed;
  }

  const overlap = displayTextOverlap(streamed, final);
  if (overlap >= 24) {
    return `${streamed}${final.slice(overlap)}`;
  }

  if (overlap > 0) {
    return `${streamed}${final.slice(overlap)}`;
  }

  return `${streamed.trimEnd()}\n\n${final.trimStart()}`;
}

function displayTextOverlap(left, right) {
  const max = Math.min(left.length, right.length, 4000);
  for (let size = max; size > 0; size -= 1) {
    if (left.slice(-size) === right.slice(0, size)) {
      return size;
    }
  }
  return 0;
}

function failInlineActivity(message) {
  if (!activeActivity) {
    return;
  }
  activeActivity.status.textContent = "\u5931\u8d25";
  activeActivity.article.classList.add("error");
  activeActivity.details.innerHTML = `<pre>${escapeHtml(message)}</pre>`;
  scrollTranscriptToBottom();
  activeActivity = null;
}

function interruptInlineActivity(message) {
  if (!activeActivity) {
    return;
  }
  activeActivity.status.textContent = "\u5df2\u4e2d\u65ad";
  activeActivity.article.classList.add("interrupted");
  activeActivity.details.innerHTML = `<pre>${escapeHtml(message)}</pre>`;
  scrollTranscriptToBottom();
  activeActivity = null;
}

function resetRunPanels() {
  elements.progressList.innerHTML = "";
  elements.progressBar.style.width = "0%";
  elements.permissionState.textContent = "\u65e0\u5f85\u5904\u7406";
  elements.permissionPrompt.textContent = "";
  closePermissionModal();
}

function renderPermissionBlock(requestId, prompt) {
  activePermissionRequest = requestId;
  elements.permissionPrompt.textContent = localizePermissionPrompt(prompt);
  elements.permissionModal.classList.remove("hidden");
  elements.permissionDenyBtn.focus();
}

function closePermissionModal() {
  elements.permissionModal.classList.add("hidden");
}

function setBusy(label, canCancel = false) {
  elements.previewBtn.disabled = true;
  elements.runBtn.disabled = true;
  elements.syncModelsBtn.disabled = true;
  elements.newConversationBtn.disabled = true;
  elements.stopBtn.hidden = !canCancel;
  elements.stopBtn.disabled = !canCancel;
  elements.stopBtn.textContent = "\u4e2d\u65ad";
  elements.statusText.textContent = label;
}

function setIdle(label) {
  elements.previewBtn.disabled = false;
  elements.runBtn.disabled = false;
  elements.syncModelsBtn.disabled = false;
  elements.newConversationBtn.disabled = false;
  elements.stopBtn.hidden = true;
  elements.stopBtn.disabled = true;
  elements.stopBtn.textContent = "\u4e2d\u65ad";
  elements.statusText.textContent = label;
}

function setError(message) {
  elements.previewBtn.disabled = false;
  elements.runBtn.disabled = false;
  elements.syncModelsBtn.disabled = false;
  elements.newConversationBtn.disabled = false;
  elements.stopBtn.hidden = true;
  elements.stopBtn.disabled = true;
  elements.stopBtn.textContent = "\u4e2d\u65ad";
  elements.statusText.textContent = labels.error;
  appendMessage("error", message);
}

function setSettingsStatus(message, isError = false) {
  elements.settingsStatus.textContent = message;
  elements.settingsStatus.classList.toggle("error", Boolean(isError));
}

function setOutput(content) {
  appendMessage("system", content || "");
}

function localizeStatus(status) {
  if (status === "ready") return "\u5df2\u5c31\u7eea";
  if (status === "stub") return "\u5360\u4f4d";
  if (status === "planned") return "\u8ba1\u5212";
  return status;
}

function localizeProgress(message) {
  return message
    .replace("Classifying task and routing model.", "\u5206\u7c7b\u4efb\u52a1\u5e76\u8def\u7531\u6a21\u578b")
    .replace("Selecting project context and building cache-friendly prompt.", "\u9009\u62e9\u9879\u76ee\u4e0a\u4e0b\u6587\u5e76\u6784\u5efa\u7f13\u5b58\u53cb\u597d Prompt")
    .replace("Preparing direct desktop operation without model tokens.", "\u51c6\u5907\u76f4\u63a5\u7535\u8111\u64cd\u4f5c\uff0c\u4e0d\u6d88\u8017\u6a21\u578b Token")
    .replace("High-confidence direct desktop operation; skipping model tokens.", "\u9ad8\u7f6e\u4fe1\u76f4\u63a5\u7535\u8111\u64cd\u4f5c\uff0c\u8df3\u8fc7\u6a21\u578b Token")
    .replace("Checking desktop operation permission.", "\u68c0\u67e5\u7535\u8111\u64cd\u4f5c\u6743\u9650")
    .replace("Desktop operation completed.", "\u7535\u8111\u64cd\u4f5c\u5df2\u5b8c\u6210")
    .replace("Desktop operation failed.", "\u7535\u8111\u64cd\u4f5c\u5931\u8d25")
    .replace("Final answer received.", "\u5df2\u6536\u5230\u6700\u7ec8\u56de\u7b54")
    .replace("Calling", "\u8c03\u7528")
    .replace("Running tool", "\u6267\u884c\u5de5\u5177");
}

function localizeRecommendation(text) {
  return text
    .replace("No model usage yet. Run a real DeepSeek request to observe cache hit tokens.", "\u5c1a\u65e0\u771f\u5b9e\u6a21\u578b\u7528\u91cf\uff0c\u8fd0\u884c DeepSeek \u8bf7\u6c42\u540e\u53ef\u89c2\u6d4b\u7f13\u5b58\u547d\u4e2d\u3002")
    .replace("Cache hit rate is low. Keep system rules, tool protocol, project summary, and selected skill text stable between turns.", "\u7f13\u5b58\u547d\u4e2d\u7387\u504f\u4f4e\uff1a\u8bf7\u4fdd\u6301\u7cfb\u7edf\u89c4\u5219\u3001\u5de5\u5177\u534f\u8bae\u3001\u9879\u76ee\u6458\u8981\u548c Skill \u6587\u672c\u7a33\u5b9a\u3002")
    .replace("Cache hit rate is moderate. Reduce volatile file snippets and command output in the dynamic tail.", "\u7f13\u5b58\u547d\u4e2d\u7387\u4e2d\u7b49\uff1a\u51cf\u5c11\u52a8\u6001\u5c3e\u90e8\u7684\u6587\u4ef6\u7247\u6bb5\u548c\u547d\u4ee4\u8f93\u51fa\u3002")
    .replace("Cache hit rate is healthy. Preserve the current prefix order and wording.", "\u7f13\u5b58\u547d\u4e2d\u5065\u5eb7\uff1a\u4fdd\u6301\u5f53\u524d\u524d\u7f00\u987a\u5e8f\u548c\u63aa\u8f9e\u3002")
    .replace("Context budget report says the dynamic tail is too dominant; shorten snippets before the next request.", "\u4e0a\u4e0b\u6587\u9884\u7b97\u663e\u793a\u52a8\u6001\u5c3e\u90e8\u8fc7\u5927\uff1a\u4e0b\u6b21\u8bf7\u6c42\u524d\u5e94\u7f29\u77ed\u7247\u6bb5\u3002")
    .replace("Stable prefix hash:", "\u7a33\u5b9a\u524d\u7f00 Hash\uff1a")
    .replace("Direct desktop operation skipped model tokens and avoided project context loading.", "\u76f4\u63a5\u7535\u8111\u64cd\u4f5c\u5df2\u8df3\u8fc7\u6a21\u578b Token\uff0c\u4e5f\u6ca1\u6709\u52a0\u8f7d\u9879\u76ee\u4e0a\u4e0b\u6587\u3002");
}

function localizePermissionPrompt(prompt) {
  return prompt
    .replace("Approve", "\u786e\u8ba4\u6267\u884c")
    .replace("risk tool call?", "\u98ce\u9669\u5de5\u5177\u8c03\u7528\uff1f")
    .replace("tool:", "\u5de5\u5177\uff1a")
    .replace("args:", "\u53c2\u6570\uff1a")
    .replace("Type y to approve:", "\u70b9\u51fb\u5141\u8bb8\u6267\u884c\uff1a");
}

function inlineReasoningTitle(item, index) {
  if (/^Task profile/.test(item)) return "\u4efb\u52a1\u5206\u7c7b";
  if (/^Model route/.test(item)) return "\u6a21\u578b\u8def\u7531";
  if (/^Tool candidates/.test(item)) return "\u5de5\u5177\u9009\u62e9";
  if (/^Context budget/.test(item)) return "\u4e0a\u4e0b\u6587\u9884\u7b97";
  if (/^Direct operation/.test(item)) return "\u76f4\u63a5\u7535\u8111\u64cd\u4f5c";
  if (/^Direct tool call|^Tool result/.test(item)) return "\u5de5\u5177\u6267\u884c";
  return `\u601d\u8003\u7247\u6bb5 ${index + 1}`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function formatRate(value) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "-";
}

function formatCacheRate(item) {
  const denominator = Number(item?.cacheHitTokens || 0) + Number(item?.cacheMissTokens || 0);
  return denominator > 0 ? formatRate(item.cacheHitRate) : "-";
}

function historyTokenText(item) {
  const input = Number(item?.inputTokens || 0);
  const output = Number(item?.outputTokens || 0);
  return input + output > 0 ? `${input}/${output} tok` : "-";
}

function compactCostText(item) {
  const usd = Number(item?.estimatedCostUsd || 0);
  if (usd <= 0) {
    return "";
  }
  const cny = usd * USD_TO_CNY_RATE;
  return `RMB ${cny < 0.01 ? cny.toFixed(6) : cny.toFixed(4)}`;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function shortPath(value) {
  const text = String(value || "");
  if (text.length <= 42) return text;
  return `${text.slice(0, 18)}...${text.slice(-21)}`;
}

function compactText(text, maxChars) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
}

function compactLiveText(text, maxChars) {
  const value = String(text || "");
  return value.length > maxChars ? `...[live stream truncated]\n${value.slice(-maxChars)}` : value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
