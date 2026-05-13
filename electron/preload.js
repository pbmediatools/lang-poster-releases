const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  submitKey: (key) => ipcRenderer.send("api-key:submit", key),
  cancel: () => ipcRenderer.send("api-key:cancel"),
});
