const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("talkedDesktop", {
  isElectron: true,
  onToggle: (callback) => {
    ipcRenderer.on("toggle-talked", (event, data) => callback(data));
  },
  hideWindow: () => {
    ipcRenderer.send("hide-talked");
  },
  setHeight: (height) => {
    ipcRenderer.send("resize-talked", height);
  },
  captureScreen: () => {
    return ipcRenderer.invoke("capture-screen");
  },
  showHighlight: (data) => {
    ipcRenderer.send("show-highlight", data);
  },
  executeTool: (name, args) => {
    return ipcRenderer.invoke("execute-desktop-tool", { name, args });
  },
  onCaptureScreenHotkey: (callback) => {
    ipcRenderer.on("trigger-screen-capture", () => callback());
  },
  showNotification: (title, body) => ipcRenderer.send("show-notification", { title, body }),
  scheduleReminder: (ms, title, body) => ipcRenderer.invoke("schedule-reminder", { ms, title, body }),
  searchApps: (query) => ipcRenderer.invoke("search-apps", query),
  onCommandConfirmRequest: (callback) => {
    ipcRenderer.on("command-confirm-request", (event, data) => callback(data));
  },
  respondCommandConfirm: (id, allowed) => {
    ipcRenderer.send("command-confirm-response", { id, allowed });
  },
  readClipboard: () => ipcRenderer.invoke("execute-desktop-tool", { name: "readClipboard", args: {} }),
  writeClipboard: (text) => ipcRenderer.invoke("execute-desktop-tool", { name: "writeClipboard", args: { text } }),
  getActiveWindow: () => ipcRenderer.invoke("execute-desktop-tool", { name: "getActiveWindow", args: {} }),
  typeText: (text) => ipcRenderer.invoke("execute-desktop-tool", { name: "typeText", args: { text } }),
  searchWeb: (query) => ipcRenderer.invoke("execute-desktop-tool", { name: "searchWeb", args: { query } }),
  onReminderFired: (callback) => {
    ipcRenderer.on("reminder-fired", (event, data) => callback(data));
  },
  getClipboardHistory: () => ipcRenderer.invoke("get-clipboard-history"),
  clearClipboardHistory: () => ipcRenderer.invoke("clear-clipboard-history"),
  deleteClipboardItem: (id) => ipcRenderer.invoke("delete-clipboard-item", id),
  pasteClipboardItem: (text) => ipcRenderer.invoke("paste-clipboard-item", text),
  openSystemFolder: (folder) => ipcRenderer.invoke("open-system-folder", folder),
  emptyRecycleBin: () => ipcRenderer.invoke("empty-recycle-bin"),
  takeScreenshot: () => ipcRenderer.invoke("take-screenshot-to-clipboard"),
  browseDirectory: (targetPath) => ipcRenderer.invoke("browse-directory", targetPath),
  openPath: (targetPath) => ipcRenderer.invoke("open-path", targetPath),
  setLauncherPosition: (position) => ipcRenderer.invoke("set-launcher-position", position),
  pickScreenColor: () => ipcRenderer.invoke("pick-screen-color"),
  manageWindow: (action) => ipcRenderer.invoke("manage-window", action)
});
