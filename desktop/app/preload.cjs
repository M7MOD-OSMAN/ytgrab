// The only doorway from the page into Electron: two folder actions, nothing else.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("streampull", {
  pickFolder: (current) => ipcRenderer.invoke("pick-folder", current),
  openFolder: (dir) => ipcRenderer.invoke("open-folder", dir),
});
