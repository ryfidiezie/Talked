const { app, BrowserWindow, globalShortcut, ipcMain, screen, session, desktopCapturer, shell, clipboard, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const { exec, execSync } = require("child_process");
const https = require("https");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

let mainWindow = null;
let overlayWindow = null;
let previousWindowTitle = "";
let pendingCommandResolvers = new Map();
let commandConfirmCounter = 0;

const psEnc = (script) => {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return `powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`;
};

function showSystemNotification(title, body) {
  const t = (title || "Talked Reminder").replace(/['"\\]/g, "");
  const b = (body || "You have a reminder!").replace(/['"\\]/g, "");

  let delivered = false;
  try {
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: t,
        body: b,
        silent: false
      });
      notif.show();
      delivered = true;
    }
  } catch (_) {}

  if (!delivered) {
    const psToast = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$nodes = $template.GetElementsByTagName('text')
$nodes.Item(0).AppendChild($template.CreateTextNode('${t}')) > $null
$nodes.Item(1).AppendChild($template.CreateTextNode('${b}')) > $null
$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show($toast)
[System.Media.SystemSounds]::Exclamation.Play()
`;
    exec(psEnc(psToast), { windowsHide: true }, () => {});
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("reminder-fired", { title: t, body: b });
  }
}

let clipboardHistory = [];
let lastClipboardText = "";

function getClipboardHistoryFilePath() {
  return path.join(app.getPath("userData"), "talked-clipboard.json");
}

function loadClipboardHistory() {
  try {
    const fp = getClipboardHistoryFilePath();
    if (fs.existsSync(fp)) {
      const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (Array.isArray(parsed)) {
        clipboardHistory = parsed.slice(0, 50);
      }
    }
  } catch (_) {}
}

function saveClipboardHistory() {
  try {
    const fp = getClipboardHistoryFilePath();
    fs.writeFileSync(fp, JSON.stringify(clipboardHistory.slice(0, 50)), "utf8");
  } catch (_) {}
}

function startClipboardWatcher() {
  try {
    lastClipboardText = clipboard.readText().trim();
  } catch (_) {}

  setInterval(() => {
    try {
      const current = clipboard.readText();
      if (!current) return;
      const text = current.trim();
      if (!text || text === lastClipboardText || text.length > 50000) return;
      lastClipboardText = text;
      clipboardHistory = clipboardHistory.filter((item) => item.text !== text);
      clipboardHistory.unshift({
        id: "clip-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        text: text,
        preview: text.length > 100 ? text.slice(0, 100) + "..." : text,
        chars: text.length,
        lines: text.split("\n").length,
        time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      });
      if (clipboardHistory.length > 50) {
        clipboardHistory = clipboardHistory.slice(0, 50);
      }
      saveClipboardHistory();
    } catch (_) {}
  }, 750);
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) {
        toggleWindow();
      } else {
        mainWindow.focus();
      }
    }
  });
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return;
  }
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  overlayWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "overlay-preload.js"),
      contextIsolation: true
    }
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile(path.join(__dirname, "overlay.html"));

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const winWidth = 680;
  const initialHeight = 70;
  const x = Math.round((screenWidth - winWidth) / 2);
  const y = Math.round(screenHeight * 0.14);

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: initialHeight,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  const distPath = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadFile(path.join(__dirname, "index.html"));
  }

  let isReadyForBlur = false;

  const bringToFront = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.moveTop();
      mainWindow.setAlwaysOnTop(true, "screen-saver");
      setTimeout(() => {
        isReadyForBlur = true;
      }, 1200);
    }
  };

  mainWindow.once("ready-to-show", bringToFront);
  mainWindow.webContents.once("did-finish-load", bringToFront);

  mainWindow.webContents.on("console-message", (event, level, message) => {
    console.log("[TALKED]", message);
  });

  mainWindow.on("blur", () => {
    if (!isReadyForBlur) {
      return;
    }
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.webContents.send("toggle-talked", { action: "blur" });
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function getPreviousWindowTitle() {
  try {
    const title = execSync(
      `powershell -NoProfile -NonInteractive -Command "(Get-Process | Where-Object {$_.MainWindowTitle -ne '' -and $_.ProcessName -notmatch 'electron'} | Sort-Object CPU -Descending | Select-Object -First 1).MainWindowTitle"`,
      { timeout: 800, windowsHide: true }
    ).toString().trim();
    return title;
  } catch (e) {
    return "";
  }
}

let currentPosition = "upper-center";

function calculateWindowPosition(positionKey, winWidth, winHeight) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const w = winWidth || 680;
  const h = winHeight || 70;

  let x = Math.round((screenWidth - w) / 2);
  let y = Math.round(screenHeight * 0.14);

  if (positionKey === "center") {
    y = Math.round((screenHeight - h) / 2);
  } else if (positionKey === "top") {
    y = Math.round(screenHeight * 0.05);
  } else if (positionKey === "bottom") {
    y = Math.round(Math.max(10, screenHeight * 0.88 - h));
  } else if (positionKey === "top-right") {
    x = Math.round(screenWidth - w - 24);
    y = Math.round(screenHeight * 0.06);
  } else {
    y = Math.round(screenHeight * 0.14);
  }

  return { x, y };
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.webContents.send("toggle-talked", { action: "hide" });
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
      }
    }, 80);
  } else {
    previousWindowTitle = getPreviousWindowTitle();
    const bounds = mainWindow.getBounds();
    const { x, y } = calculateWindowPosition(currentPosition, bounds.width, bounds.height);

    mainWindow.setPosition(x, y);
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.webContents.send("toggle-talked", { action: "activate" });
  }
}

app.whenReady().then(() => {
  try {
    app.setAppUserModelId("Talked.Launcher");
  } catch (_) {}

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === "media") {
      callback(true);
      return;
    }
    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return true;
  });

  createWindow();

  loadClipboardHistory();
  startClipboardWatcher();

  const toggleShortcuts = ["Alt+Space", "CommandOrControl+Space", "CommandOrControl+Shift+Space"];
  for (const sc of toggleShortcuts) {
    try {
      globalShortcut.register(sc, () => {
        toggleWindow();
      });
    } catch (err) {}
  }

  try {
    globalShortcut.register("Alt+C", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.isVisible()) {
          toggleWindow();
        }
        mainWindow.webContents.send("trigger-screen-capture");
      }
    });
  } catch (err) {}

  ipcMain.handle("search-apps", async (event, query) => {
    const q = (query || "").toLowerCase().trim();
    if (!q) return [];
    const os = require("os");
    const results = [];

    if (process.platform === "linux") {
      const linuxDirs = [
        "/usr/share/applications",
        "/usr/local/share/applications",
        path.join(os.homedir(), ".local/share/applications"),
        "/var/lib/flatpak/exports/share/applications",
        path.join(os.homedir(), ".local/share/flatpak/exports/share/applications")
      ];
      for (const dir of linuxDirs) {
        if (results.length >= 8) break;
        if (!fs.existsSync(dir)) continue;
        try {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            if (!f.endsWith(".desktop")) continue;
            try {
              const content = fs.readFileSync(path.join(dir, f), "utf8");
              if (content.includes("NoDisplay=true")) continue;
              const nameMatch = content.match(/^Name=([^\r\n]+)/m);
              const execMatch = content.match(/^Exec=([^\r\n]+)/m);
              if (nameMatch) {
                const appName = nameMatch[1].trim();
                if (appName.toLowerCase().includes(q)) {
                  let execCmd = execMatch ? execMatch[1].replace(/%[a-zA-Z]/g, "").trim() : appName;
                  if (!results.some((r) => r.name.toLowerCase() === appName.toLowerCase())) {
                    results.push({ name: appName, path: execCmd });
                    if (results.length >= 8) break;
                  }
                }
              }
            } catch (_) {}
          }
        } catch (_) {}
      }
      return results.slice(0, 8);
    }

    const dirs = [
      path.join("C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs"),
      path.join(os.homedir(), "AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs")
    ];
    function scanDir(dir, depth) {
      if (depth > 3) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          scanDir(path.join(dir, entry.name), depth + 1);
        } else if (entry.name.endsWith(".lnk")) {
          const name = entry.name.slice(0, -4);
          if (name.toLowerCase().includes(q)) {
            results.push({ name, path: path.join(dir, entry.name) });
            if (results.length >= 8) return;
          }
        }
      }
    }
    for (const dir of dirs) {
      if (results.length >= 8) break;
      scanDir(dir, 0);
    }
    return results.slice(0, 8);
  });

  ipcMain.handle("schedule-reminder", (event, { ms, title, body }) => {
    const id = ++commandConfirmCounter;
    setTimeout(() => {
      showSystemNotification(title, body);
    }, Math.max(50, Number(ms) || 1000));
    return { id, scheduled: true };
  });

  ipcMain.handle("confirm-command", async (event, { id, cmd }) => {
    return new Promise((resolve) => {
      pendingCommandResolvers.set(id, resolve);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("command-confirm-request", { id, cmd });
      } else {
        resolve(false);
      }
    });
  });

  ipcMain.on("command-confirm-response", (event, { id, allowed }) => {
    const resolver = pendingCommandResolvers.get(id);
    if (resolver) {
      pendingCommandResolvers.delete(id);
      resolver(allowed);
    }
  });

  ipcMain.handle("get-clipboard-history", () => {
    return clipboardHistory;
  });

  ipcMain.handle("clear-clipboard-history", () => {
    clipboardHistory = [];
    saveClipboardHistory();
    return { success: true };
  });

  ipcMain.handle("delete-clipboard-item", (event, id) => {
    clipboardHistory = clipboardHistory.filter((item) => item.id !== id);
    saveClipboardHistory();
    return { success: true };
  });

  ipcMain.handle("paste-clipboard-item", async (event, text) => {
    if (!text) return { success: false };
    clipboard.writeText(text);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        exec(`powershell -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`, { windowsHide: true }, () => {
          resolve({ success: true });
        });
      }, 150);
    });
  });

  ipcMain.handle("open-system-folder", async (event, folderName) => {
    try {
      let targetPath = "";
      if (folderName === "downloads") targetPath = app.getPath("downloads");
      else if (folderName === "documents") targetPath = app.getPath("documents");
      else if (folderName === "desktop") targetPath = app.getPath("desktop");
      else if (folderName === "pictures") targetPath = app.getPath("pictures");
      else if (folderName === "music") targetPath = app.getPath("music");
      else if (folderName === "videos") targetPath = app.getPath("videos");
      else if (folderName === "home") targetPath = app.getPath("home");
      if (targetPath) {
        await shell.openPath(targetPath);
        return { success: true, path: targetPath };
      }
      return { success: false, error: "Folder not found" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("empty-recycle-bin", async () => {
    return new Promise((resolve) => {
      if (process.platform === "linux") {
        exec("gio trash --empty || rm -rf ~/.local/share/Trash/files/*", (err) => {
          if (!err) showSystemNotification("Trash", "Trash emptied.");
          resolve({ success: !err });
        });
      } else {
        exec(psEnc("Clear-RecycleBin -Force -ErrorAction SilentlyContinue"), { windowsHide: true }, (err) => {
          if (!err) {
            showSystemNotification("Recycle Bin", "Recycle bin emptied.");
          }
          resolve({ success: !err });
        });
      }
    });
  });

  ipcMain.handle("take-screenshot-to-clipboard", async () => {
    try {
      const cursorPoint = screen.getCursorScreenPoint();
      const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
      const chosenDisplay = activeDisplay || screen.getPrimaryDisplay();
      const { width, height } = chosenDisplay.size;
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width, height }
      });
      if (sources && sources.length > 0) {
        let chosenSource = sources.find((s) => s.display_id === String(chosenDisplay.id)) || sources[0];
        if (chosenSource && !chosenSource.thumbnail.isEmpty()) {
          clipboard.writeImage(chosenSource.thumbnail);
          showSystemNotification("Screenshot Captured", "Image copied to clipboard.");
          return { success: true };
        }
      }
      return { success: false, error: "No screen capture available" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("browse-directory", async (event, requestedPath) => {
    const os = require("os");
    let target = (requestedPath || "").trim();
    if (!target || (process.platform === "win32" && target === "/")) {
      return { success: false, error: "Invalid path", items: [] };
    }
    if (target.startsWith("~")) {
      target = path.join(os.homedir(), target.slice(1));
    }
    target = path.resolve(target);

    try {
      if (!fs.existsSync(target)) {
        return { success: false, error: "Path not found", path: target, items: [] };
      }
      const stat = fs.statSync(target);
      if (!stat.isDirectory()) {
        return { success: true, isFile: true, path: target, items: [] };
      }

      const entries = fs.readdirSync(target, { withFileTypes: true });
      const items = [];

      for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.name !== ".config") continue;
        const fullPath = path.join(target, entry.name);
        const isDir = entry.isDirectory();
        let size = 0;
        if (!isDir) {
          try { size = fs.statSync(fullPath).size; } catch (_) {}
        }
        items.push({
          name: entry.name,
          path: fullPath,
          isDirectory: isDir,
          size: size,
          ext: isDir ? "" : path.extname(entry.name).toLowerCase()
        });
      }

      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      });

      return {
        success: true,
        path: target,
        parent: path.dirname(target) !== target ? path.dirname(target) : null,
        items: items.slice(0, 50)
      };
    } catch (e) {
      return { success: false, error: e.message, path: target, items: [] };
    }
  });

  ipcMain.handle("open-path", async (event, targetPath) => {
    try {
      if (process.platform === "linux") {
        exec(`xdg-open "${targetPath.replace(/"/g, '\\"')}"`, () => {});
        return { success: true };
      }
      const res = await shell.openPath(targetPath);
      return { success: res === "", error: res };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.on("hide-talked", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("toggle-talked", { action: "hide" });
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide();
        }
      }, 120);
    }
  });

  ipcMain.handle("set-launcher-position", (event, pos) => {
    currentPosition = pos || "upper-center";
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      const { x, y } = calculateWindowPosition(currentPosition, bounds.width, bounds.height);
      mainWindow.setPosition(x, y, true);
    }
    return { success: true, position: currentPosition };
  });

  ipcMain.handle("pick-screen-color", async () => {
    try {
      const cursorPoint = screen.getCursorScreenPoint();
      const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
      const chosenDisplay = activeDisplay || screen.getPrimaryDisplay();
      const { width, height } = chosenDisplay.size;
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width, height }
      });
      if (sources && sources.length > 0) {
        let chosenSource = sources.find((s) => s.display_id === String(chosenDisplay.id)) || sources[0];
        if (chosenSource && !chosenSource.thumbnail.isEmpty()) {
          const displayBounds = chosenDisplay.bounds;
          const relX = Math.max(0, Math.min(width - 1, cursorPoint.x - displayBounds.x));
          const relY = Math.max(0, Math.min(height - 1, cursorPoint.y - displayBounds.y));
          const cropped = chosenSource.thumbnail.crop({ x: relX, y: relY, width: 1, height: 1 });
          const bmp = cropped.toBitmap();
          const b = bmp[0];
          const g = bmp[1];
          const r = bmp[2];
          const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
          const rgb = `rgb(${r}, ${g}, ${b})`;
          clipboard.writeText(hex);
          showSystemNotification("Color Picked", `${hex} copied to clipboard.`);
          return { success: true, hex, rgb, r, g, b };
        }
      }
      return { success: false, error: "Failed to sample screen pixel" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("manage-window", async (event, action) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        if (process.platform === "linux") {
          let cmd = "";
          if (action === "snap-left") cmd = "xdotool key super+Left";
          else if (action === "snap-right") cmd = "xdotool key super+Right";
          else if (action === "maximize") cmd = "wmctrl -r :ACTIVE: -b toggle,maximized_vert,maximized_horz";
          else if (action === "minimize") cmd = "xdotool getactivewindow windowminimize";
          else if (action === "show-desktop") cmd = "xdotool key super+d";
          if (cmd) {
            exec(cmd, () => resolve({ success: true }));
            return;
          }
          resolve({ success: false });
        } else {
          let sendKeysPattern = "";
          if (action === "snap-left") sendKeysPattern = "#{LEFT}";
          else if (action === "snap-right") sendKeysPattern = "#{RIGHT}";
          else if (action === "maximize") sendKeysPattern = "#{UP}";
          else if (action === "minimize") sendKeysPattern = "#{DOWN}";
          else if (action === "show-desktop") sendKeysPattern = "#d";

          if (sendKeysPattern) {
            const script = `$w = New-Object -ComObject WScript.Shell; $w.SendKeys("${sendKeysPattern}")`;
            exec(psEnc(script), { windowsHide: true }, (err) => resolve({ success: !err }));
          } else {
            resolve({ success: false });
          }
        }
      }, 100);
    });
  });

  ipcMain.on("resize-talked", (event, newHeight) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      const clampedHeight = Math.max(90, Math.min(newHeight, 840));
      if (bounds.height !== clampedHeight) {
        const { x, y } = calculateWindowPosition(currentPosition, bounds.width, clampedHeight);
        mainWindow.setBounds({
          x: x,
          y: y,
          width: bounds.width,
          height: clampedHeight
        });
      }
    }
  });

  ipcMain.handle("capture-screen", async () => {
    try {
      const cursorPoint = screen.getCursorScreenPoint();
      const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
      const primaryDisplay = screen.getPrimaryDisplay();
      const chosenDisplay = activeDisplay || primaryDisplay;

      const { width, height } = chosenDisplay.size;
      const targetWidth = Math.min(1920, width);
      const targetHeight = Math.round((targetWidth / width) * height);
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: targetWidth, height: targetHeight }
      });
      if (sources && sources.length > 0) {
        let chosenSource = null;
        if (chosenDisplay) {
          chosenSource = sources.find(s => s.display_id === String(chosenDisplay.id));
        }
        if (!chosenSource || chosenSource.thumbnail.isEmpty()) {
          chosenSource = sources.find(s => !s.thumbnail.isEmpty()) || sources[0];
        }
        if (chosenSource.thumbnail.isEmpty()) {
          for (const s of sources) {
            if (!s.thumbnail.isEmpty()) {
              chosenSource = s;
              break;
            }
          }
        }
        const jpegBuffer = chosenSource.thumbnail.toJPEG(75);
        console.log("[CAPTURE SCREEN]", chosenSource.name, "id:", chosenSource.id, "display_id:", chosenSource.display_id, "size:", chosenSource.thumbnail.getSize(), "bytes:", jpegBuffer.length);
        return jpegBuffer.toString("base64");
      }
      return null;
    } catch (err) {
      console.log("[SCREEN CAP ERROR]", err.message);
      return null;
    }
  });

  ipcMain.on("show-notification", (event, { title, body }) => {
    showSystemNotification(title, body);
  });

  ipcMain.on("show-highlight", (event, data) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      createOverlayWindow();
    }
    if (overlayWindow) {
      if (!overlayWindow.isVisible()) {
        overlayWindow.showInactive();
      }
      if (overlayWindow.webContents) {
        overlayWindow.webContents.send("draw-highlight", data);
      }
    }
  });

  ipcMain.handle("execute-desktop-tool", async (event, { name, args }) => {
    if (name === "drawOnScreen" || name === "highlightScreen") {
      if (!overlayWindow || overlayWindow.isDestroyed()) {
        createOverlayWindow();
      }
      if (overlayWindow) {
        if (!overlayWindow.isVisible()) {
          overlayWindow.showInactive();
        }
        if (overlayWindow.webContents) {
          overlayWindow.webContents.send("draw-highlight", args);
        }
      }
      return { success: true, message: "Screen drawing rendered" };
    }

    if (name === "lockScreen") {
      if (process.platform === "linux") {
        exec("xdg-screensaver lock || loginctl lock-session", { windowsHide: true });
      } else {
        exec("rundll32.exe user32.dll,LockWorkStation", { windowsHide: true });
      }
      return { success: true };
    }

    if (name === "sleepSystem") {
      if (process.platform === "linux") {
        exec("systemctl suspend", { windowsHide: true });
      } else {
        exec("rundll32.exe powrprof.dll,SetSuspendState 0,1,0", { windowsHide: true });
      }
      return { success: true };
    }

    if (name === "shutdownSystem") {
      const delay = Number(args.delay ?? 60);
      if (process.platform === "linux") {
        const mins = Math.max(0, Math.round(delay / 60));
        exec(delay === 0 ? "systemctl poweroff" : `shutdown -h +${Math.max(1, mins)}`, { windowsHide: true });
      } else {
        exec(`shutdown /s /t ${delay}`, { windowsHide: true, shell: true });
      }
      return { success: true };
    }

    if (name === "restartSystem") {
      const delay = Number(args.delay ?? 60);
      if (process.platform === "linux") {
        exec(delay === 0 ? "systemctl reboot" : `shutdown -r +${Math.max(1, Math.round(delay / 60))}`, { windowsHide: true });
      } else {
        exec(`shutdown /r /t ${delay}`, { windowsHide: true, shell: true });
      }
      return { success: true };
    }

    if (name === "cancelShutdown") {
      if (process.platform === "linux") {
        exec("shutdown -c", { windowsHide: true });
      } else {
        exec("shutdown /a", { windowsHide: true, shell: true });
      }
      return { success: true };
    }

    if (name === "volumeUp") {
      if (process.platform === "linux") {
        return new Promise((resolve) => {
          exec("pactl set-sink-volume @DEFAULT_SINK@ +5% || amixer -D pulse sset Master 5%+", (err) => resolve({ success: !err }));
        });
      }
      const script = "$w = New-Object -ComObject WScript.Shell; 1..4 | ForEach-Object { $w.SendKeys([char]175) }";
      return new Promise((resolve) => {
        exec(psEnc(script), { windowsHide: true }, (err) => resolve({ success: !err }));
      });
    }

    if (name === "volumeDown") {
      if (process.platform === "linux") {
        return new Promise((resolve) => {
          exec("pactl set-sink-volume @DEFAULT_SINK@ -5% || amixer -D pulse sset Master 5%-", (err) => resolve({ success: !err }));
        });
      }
      const script = "$w = New-Object -ComObject WScript.Shell; 1..4 | ForEach-Object { $w.SendKeys([char]174) }";
      return new Promise((resolve) => {
        exec(psEnc(script), { windowsHide: true }, (err) => resolve({ success: !err }));
      });
    }

    if (name === "volumeMute") {
      if (process.platform === "linux") {
        return new Promise((resolve) => {
          exec("pactl set-sink-mute @DEFAULT_SINK@ toggle || amixer -D pulse sset Master toggle", (err) => resolve({ success: !err }));
        });
      }
      const script = "$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]173)";
      return new Promise((resolve) => {
        exec(psEnc(script), { windowsHide: true }, (err) => resolve({ success: !err }));
      });
    }

    if (name === "getNetworkInfo") {
      const os = require("os");
      const interfaces = os.networkInterfaces();
      const ips = [];
      for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (const alias of iface) {
          if (alias.family === "IPv4" && !alias.internal && !alias.address.startsWith("169.254.")) {
            ips.push(`${alias.address} (${devName})`);
          }
        }
      }
      return { ips: ips.length > 0 ? ips : ["127.0.0.1 (localhost)"] };
    }

    if (name === "killProcess") {
      const procName = (args.name || "").replace(/\.exe$/i, "").trim();
      if (!procName) return { success: false, error: "No process name provided" };
      if (process.platform === "linux") {
        return new Promise((resolve) => {
          exec(`pkill -f "${procName}" || killall "${procName}"`, (err) => {
            resolve({ success: !err, error: err ? err.message : null });
          });
        });
      }
      return new Promise((resolve) => {
        exec(`taskkill /F /IM "${procName}.exe" /T`, { windowsHide: true }, (err) => {
          if (!err) return resolve({ success: true });
          exec(`taskkill /F /IM "${procName}" /T`, { windowsHide: true }, (err2) => {
            resolve({ success: !err2, error: err2 ? err2.message : null });
          });
        });
      });
    }

    if (name === "runSilent") {
      const script = args.script || "";
      if (!script) return { error: "No script" };
      return new Promise((resolve) => {
        exec(psEnc(script), { windowsHide: true, timeout: 10000 }, (err, stdout, stderr) =>
          resolve({ stdout: (stdout || "").trim(), stderr: (stderr || "").trim(), exitCode: err ? err.code : 0 })
        );
      });
    }

    if (name === "getCursorPosition") {
      const point = screen.getCursorScreenPoint();
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.bounds;
      const pctX = Math.round((point.x / width) * 100);
      const pctY = Math.round((point.y / height) * 100);
      return {
        screenX: point.x,
        screenY: point.y,
        percentX: pctX,
        percentY: pctY
      };
    }

    if (name === "openApplication") {
      const appName = (args.appName || args.app_name || "").trim();
      if (!appName) return { success: false, error: "App name required" };

      if (process.platform === "linux") {
        exec(appName, () => {});
        return { success: true };
      }

      const isPath = appName.includes("\\") || appName.includes("/") || /\.(lnk|exe|bat|com|cmd)$/i.test(appName);
      if (isPath) {
        const result = await shell.openPath(appName);
        if (result === "") return { success: true };
      }

      return new Promise((resolve) => {
        exec(`start "" "${appName}"`, { windowsHide: true, shell: true }, (err) => {
          if (!err) return resolve({ success: true });
          const script = `Start-Process '${appName.replace(/'/g, "''")}' -ErrorAction Stop`;
          exec(psEnc(script), { windowsHide: true, timeout: 5000 }, (err2) => {
            resolve({ success: !err2, error: err2 ? err2.message : null });
          });
        });
      });
    }

    if (name === "openUrl") {
      const url = args.url || "";
      if (url.startsWith("http://") || url.startsWith("https://")) {
        shell.openExternal(url);
        return { success: true, url };
      }
      return { success: false, error: "Invalid URL" };
    }

    if (name === "getSystemInfo") {
      const os = require("os");
      return {
        platform: os.platform(),
        arch: os.arch(),
        uptimeMinutes: Math.round(os.uptime() / 60),
        freeMemMB: Math.round(os.freemem() / 1024 / 1024),
        totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
        hostname: os.hostname()
      };
    }

    if (name === "readClipboard") {
      const text = clipboard.readText();
      return { text, length: text.length };
    }

    if (name === "writeClipboard") {
      const text = args.text || "";
      clipboard.writeText(text);
      return { success: true, written: text.length };
    }

    if (name === "getActiveWindow") {
      return { title: previousWindowTitle || "Unknown" };
    }

    if (name === "typeText") {
      const text = args.text || "";
      if (!text) return { success: false, error: "No text provided" };
      return new Promise((resolve) => {
        const prev = clipboard.readText();
        clipboard.writeText(text);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide();
        }
        setTimeout(() => {
          if (process.platform === "linux") {
            exec("xdotool key --clearmodifiers ctrl+v || ydotool key 29:1 47:1 47:0 29:0", () => {
              setTimeout(() => {
                clipboard.writeText(prev);
                resolve({ success: true, typed: text.length });
              }, 300);
            });
          } else {
            exec(`powershell -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`, { windowsHide: true }, () => {
              setTimeout(() => {
                clipboard.writeText(prev);
                resolve({ success: true, typed: text.length });
              }, 300);
            });
          }
        }, 150);
      });
    }

    if (name === "searchWeb") {
      const query = args.query || "";
      if (!query) return { error: "No query provided" };
      return new Promise((resolve) => {
        const encoded = encodeURIComponent(query);
        const options = {
          hostname: "api.duckduckgo.com",
          path: `/?q=${encoded}&format=json&no_html=1&skip_disambig=1&t=talked`,
          method: "GET",
          headers: { "User-Agent": "Talked/1.0" }
        };
        const req = https.request(options, (res) => {
          let body = "";
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => {
            try {
              const json = JSON.parse(body);
              const results = [];
              if (json.AbstractText) results.push({ title: json.Heading || query, snippet: json.AbstractText, url: json.AbstractURL });
              if (json.RelatedTopics) {
                for (const t of json.RelatedTopics.slice(0, 5)) {
                  if (t.Text) results.push({ snippet: t.Text, url: t.FirstURL || "" });
                }
              }
              resolve({ query, results, answerType: json.Type || "" });
            } catch (e) {
              resolve({ query, results: [], error: "Parse error" });
            }
          });
        });
        req.on("error", (e) => resolve({ query, results: [], error: e.message }));
        req.setTimeout(5000, () => { req.destroy(); resolve({ query, results: [], error: "Timeout" }); });
        req.end();
      });
    }

    if (name === "moveMouse") {
      const tx = Math.round(args.x || 0);
      const ty = Math.round(args.y || 0);
      return new Promise((resolve) => {
        exec(
          `powershell -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${tx}, ${ty})"`,
          { windowsHide: true },
          (err) => resolve(err ? { success: false, error: err.message } : { success: true, x: tx, y: ty })
        );
      });
    }

    if (name === "clickAt") {
      const cx = Math.round(args.x || 0);
      const cy = Math.round(args.y || 0);
      const button = args.button || "left";
      const dbl = args.double === true;
      const clickScript = dbl
        ? `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${cx}, ${cy}); Start-Sleep -Milliseconds 80; Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int d,int e);' -Name U -Namespace W; [W.U]::mouse_event(2,0,0,0,0); [W.U]::mouse_event(4,0,0,0,0); Start-Sleep -Milliseconds 60; [W.U]::mouse_event(2,0,0,0,0); [W.U]::mouse_event(4,0,0,0,0);`
        : button === "right"
        ? `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${cx}, ${cy}); Start-Sleep -Milliseconds 80; Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int d,int e);' -Name U -Namespace W; [W.U]::mouse_event(8,0,0,0,0); [W.U]::mouse_event(16,0,0,0,0);`
        : `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${cx}, ${cy}); Start-Sleep -Milliseconds 80; Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int d,int e);' -Name U -Namespace W; [W.U]::mouse_event(2,0,0,0,0); [W.U]::mouse_event(4,0,0,0,0);`;
      return new Promise((resolve) => {
        exec(
          `powershell -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.Windows.Forms; ${clickScript}"`,
          { windowsHide: true },
          (err) => resolve(err ? { success: false, error: err.message } : { success: true, x: cx, y: cy, button })
        );
      });
    }

    if (name === "runCommand") {
      const cmd = args.command || args.cmd || "";
      if (!cmd) return { error: "No command provided" };
      const confirmId = ++commandConfirmCounter;
      const allowed = await new Promise((resolve) => {
        pendingCommandResolvers.set(confirmId, resolve);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("command-confirm-request", { id: confirmId, cmd });
        } else {
          resolve(false);
        }
      });
      if (!allowed) return { error: "User denied" };
      return new Promise((resolve) => {
        exec(`powershell -NoProfile -NonInteractive -Command "${cmd.replace(/"/g, '\\"')}"`, { windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
          resolve({ stdout: (stdout || "").trim(), stderr: (stderr || "").trim(), exitCode: err ? err.code : 0 });
        });
      });
    }

    return { error: "Unknown tool" };
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
