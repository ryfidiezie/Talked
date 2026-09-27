const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("talkedOverlay", {
  onHighlight: (callback) => {
    ipcRenderer.on("draw-highlight", (event, data) => callback(data));
  }
});
