const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  httpRequest: (payload) => ipcRenderer.invoke("http:request", payload),
});

contextBridge.exposeInMainWorld("agent", {
  listCollections: () => ipcRenderer.invoke("agent:listCollections"),
  getCollection: (id) => ipcRenderer.invoke("agent:getCollection", id),
  saveCollection: (id, body) =>
    ipcRenderer.invoke("agent:saveCollection", id, body),
  deleteCollection: (id) => ipcRenderer.invoke("agent:deleteCollection", id),
  listEnvironments: () => ipcRenderer.invoke("agent:listEnvironments"),
  getEnvironment: (id) => ipcRenderer.invoke("agent:getEnvironment", id),
  saveEnvironment: (id, body) =>
    ipcRenderer.invoke("agent:saveEnvironment", id, body),
  deleteEnvironment: (id) =>
    ipcRenderer.invoke("agent:deleteEnvironment", id),
  getGitSettings: () => ipcRenderer.invoke("agent:getGitSettings"),
  putGitSettings: (body) => ipcRenderer.invoke("agent:putGitSettings", body),
  putGitCredentials: (body) =>
    ipcRenderer.invoke("agent:putGitCredentials", body),
  gitListBranches: (body) => ipcRenderer.invoke("agent:gitListBranches", body),
  gitSync: (body) => ipcRenderer.invoke("agent:gitSync", body ?? {}),
});
