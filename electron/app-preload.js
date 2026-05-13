// Preload for the main app window.
// Exposes a small, safe surface to the renderer via contextBridge.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Returns: { status: "uptodate"|"available"|"downloaded"|"error"|"unavailable", version?, message? }
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
});
