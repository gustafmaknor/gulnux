// Det fönstren får göra i Gulapp – inget annat når huvudprocessen
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gulapp", {
  state: () => ipcRenderer.invoke("state"),
  save: (changes) => ipcRenderer.invoke("save", changes),
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  installPython: () => ipcRenderer.invoke("install-python"),
  install: (what) => ipcRenderer.invoke("install", what),
  clone: (github) => ipcRenderer.invoke("clone", github),
  search: (query) => ipcRenderer.invoke("search", query),
  open: (hit) => ipcRenderer.invoke("open", hit),
  openAgent: () => ipcRenderer.invoke("open-agent"),
  openPath: (p) => ipcRenderer.invoke("open-path", p),
  onLog: (fn) => ipcRenderer.on("log", (_e, line) => fn(line)),
});
