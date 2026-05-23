const { contextBridge, ipcRenderer } = require("electron");

const api = {
  runAgent: (request) => ipcRenderer.invoke("agent:run", request),
  cancelAgent: (runId) => ipcRenderer.invoke("agent:cancel", { runId }),
  previewContext: (request) => ipcRenderer.invoke("agent:context", request),
  listModels: (request) => ipcRenderer.invoke("models:list", request),
  listSkills: (request) => ipcRenderer.invoke("skills:list", request),
  readSkill: (request) => ipcRenderer.invoke("skills:read", request),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (request) => ipcRenderer.invoke("settings:save", request),
  clearSavedApiKey: () => ipcRenderer.invoke("settings:clear-api-key"),
  chooseFiles: (request) => ipcRenderer.invoke("files:choose", request),
  readFiles: (request) => ipcRenderer.invoke("files:read", request),
  openPath: (request) => ipcRenderer.invoke("files:open-path", request),
  chooseWorkspace: (request) => ipcRenderer.invoke("workspace:choose", request),
  ensureConversationWorkdir: (request) => ipcRenderer.invoke("workspace:conversation-dir", request),
  getDefaults: () => ipcRenderer.invoke("app:defaults"),
  answerPermission: (requestId, approved) => ipcRenderer.invoke("permission:answer", { requestId, approved }),
  onAgentProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("agent:progress", listener);
    return () => ipcRenderer.removeListener("agent:progress", listener);
  },
  onAgentStream: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("agent:stream", listener);
    return () => ipcRenderer.removeListener("agent:stream", listener);
  },
  onPermissionRequest: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("permission:request", listener);
    return () => ipcRenderer.removeListener("permission:request", listener);
  }
};

contextBridge.exposeInMainWorld("agentDesktop", api);
