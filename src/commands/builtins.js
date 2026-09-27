const MATH_RE = /^[\d\s\+\-\*\/\^\%\(\)\.\,a-zA-Z]{2,}$/;
const HAS_OPERATOR = /[\+\-\*\/\^\%]/;
const HAS_DIGIT = /\d/;

export function tryCalc(query) {
  let q = query.trim();
  if (q.toLowerCase().startsWith("/calc ")) {
    q = q.slice(6).trim();
  }
  if (!MATH_RE.test(q) || !HAS_OPERATOR.test(q) || !HAS_DIGIT.test(q) || q.length < 2) return null;
  const safe = q
    .replace(/\^/g, "**")
    .replace(/\bsqrt\b/g, "Math.sqrt")
    .replace(/\babs\b/g, "Math.abs")
    .replace(/\bfloor\b/g, "Math.floor")
    .replace(/\bceil\b/g, "Math.ceil")
    .replace(/\bround\b/g, "Math.round")
    .replace(/\bPI\b|\bpi\b/g, "Math.PI")
    .replace(/\bsin\b/g, "Math.sin")
    .replace(/\bcos\b/g, "Math.cos")
    .replace(/\btan\b/g, "Math.tan")
    .replace(/\blog\b/g, "Math.log10")
    .replace(/\bln\b/g, "Math.log")
    .replace(/\bpow\b/g, "Math.pow");
  try {
    const fn = new Function("Math", `"use strict"; return (${safe})`);
    const result = fn(Math);
    if (typeof result === "number" && isFinite(result)) {
      return Number(parseFloat(result.toPrecision(12))).toString();
    }
  } catch (_) {}
  return null;
}

function parseReminder(input) {
  const timeRegex = /(?:^|\s)(?:in\s+)?(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)(?:\s|$)/i;
  const match = input.match(timeRegex);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const rawUnit = match[2].toLowerCase();
  let ms = num * 60000;
  if (rawUnit.startsWith("s")) ms = num * 1000;
  else if (rawUnit.startsWith("h")) ms = num * 3600000;
  const message = input.replace(match[0], " ").trim() || "Reminder";
  const displayUnit = rawUnit.startsWith("s") ? (num === 1 ? "second" : "seconds")
    : rawUnit.startsWith("h") ? (num === 1 ? "hour" : "hours")
    : (num === 1 ? "minute" : "minutes");
  return { ms, num, unit: displayUnit, message };
}

const COMMANDS = [
  {
    id: "time",
    pattern: /^\/time$/i,
    group: "INFO",
    icon: "clock",
    label: () => {
      const now = new Date();
      return now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
    },
    sublabel: "Current local time - Enter to copy",
    action: async () => {
      const val = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
      return { label: val, copy: val };
    }
  },
  {
    id: "date",
    pattern: /^\/date$/i,
    group: "INFO",
    icon: "calendar",
    label: () => new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    sublabel: "Current date - Enter to copy",
    action: async () => {
      const val = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      return { label: val, copy: val };
    }
  },
  {
    id: "ip",
    pattern: /^\/ip$/i,
    group: "INFO",
    icon: "network",
    label: () => "Get local IP address",
    sublabel: "Fetch network interfaces",
    action: async () => {
      const res = await window.talkedDesktop?.executeTool("getNetworkInfo", {});
      const ips = (res?.ips || []).join(", ") || "Not found";
      return { label: ips, copy: ips };
    }
  },
  {
    id: "sysinfo",
    pattern: /^\/sys(?:info)?$/i,
    group: "INFO",
    icon: "cpu",
    label: () => "System information",
    sublabel: "CPU architecture, RAM, and OS details",
    action: async () => {
      const res = await window.talkedDesktop?.executeTool("getSystemInfo", {});
      if (!res) return { label: "Unavailable" };
      const label = `${res.platform} (${res.arch}) - ${Math.round(res.freeMemMB)}MB free / ${Math.round(res.totalMemMB)}MB total - Host: ${res.hostname}`;
      return { label, copy: label };
    }
  },
  {
    id: "encode",
    pattern: /^\/encode\s+(.+)/i,
    group: "INFO",
    icon: "code",
    label: (m) => { try { return btoa(unescape(encodeURIComponent(m[1]))); } catch { return "Invalid input"; } },
    sublabel: "Base64 encoded - Enter to copy",
    action: async (m) => {
      try {
        const val = btoa(unescape(encodeURIComponent(m[1])));
        return { label: val, copy: val };
      } catch { return { label: "Encoding failed" }; }
    }
  },
  {
    id: "decode",
    pattern: /^\/decode\s+(.+)/i,
    group: "INFO",
    icon: "code",
    label: (m) => { try { return decodeURIComponent(escape(atob(m[1].trim()))); } catch { return "Invalid base64"; } },
    sublabel: "Decoded text - Enter to copy",
    action: async (m) => {
      try {
        const val = decodeURIComponent(escape(atob(m[1].trim())));
        return { label: val, copy: val };
      } catch { return { label: "Decoding failed" }; }
    }
  },
  {
    id: "lock",
    pattern: /^\/lock$/i,
    group: "SYSTEM",
    icon: "lock",
    label: () => "Lock screen",
    sublabel: "Lock the workstation",
    action: async () => {
      await window.talkedDesktop?.executeTool("lockScreen", {});
      return { autoHide: true };
    }
  },
  {
    id: "sleep",
    pattern: /^\/sleep$/i,
    group: "SYSTEM",
    icon: "moon",
    label: () => "Sleep PC",
    sublabel: "Put computer to sleep",
    action: async () => {
      await window.talkedDesktop?.executeTool("sleepSystem", {});
      return { autoHide: true };
    }
  },
  {
    id: "vol-up",
    pattern: /^\/vol(?:ume)?[\s\-]+up$/i,
    group: "SYSTEM",
    icon: "volume",
    label: () => "Volume up",
    sublabel: "Increase system volume",
    action: async () => {
      await window.talkedDesktop?.executeTool("volumeUp", {});
      return { autoHide: true };
    }
  },
  {
    id: "vol-down",
    pattern: /^\/vol(?:ume)?[\s\-]+down$/i,
    group: "SYSTEM",
    icon: "volume",
    label: () => "Volume down",
    sublabel: "Decrease system volume",
    action: async () => {
      await window.talkedDesktop?.executeTool("volumeDown", {});
      return { autoHide: true };
    }
  },
  {
    id: "vol-mute",
    pattern: /^\/vol(?:ume)?[\s\-]+(?:mute|m)$/i,
    group: "SYSTEM",
    icon: "volume",
    label: () => "Toggle mute",
    sublabel: "Mute or unmute system audio",
    action: async () => {
      await window.talkedDesktop?.executeTool("volumeMute", {});
      return { autoHide: true };
    }
  },
  {
    id: "shutdown",
    pattern: /^\/shutdown$/i,
    group: "SYSTEM",
    icon: "power",
    label: () => "Shutdown in 60s",
    sublabel: "Schedule shutdown - use /shutdown cancel to abort",
    action: async () => {
      await window.talkedDesktop?.executeTool("shutdownSystem", { delay: 60 });
      return { label: "Shutting down in 60 seconds. Type /shutdown cancel to abort." };
    }
  },
  {
    id: "shutdown-now",
    pattern: /^\/shutdown[\s\-]+now$/i,
    group: "SYSTEM",
    icon: "power",
    label: () => "Shutdown now",
    sublabel: "Immediately shut down the PC",
    action: async () => {
      await window.talkedDesktop?.executeTool("shutdownSystem", { delay: 0 });
      return { autoHide: true };
    }
  },
  {
    id: "shutdown-cancel",
    pattern: /^\/shutdown[\s\-]+cancel$/i,
    group: "SYSTEM",
    icon: "power",
    label: () => "Cancel shutdown",
    sublabel: "Abort a scheduled shutdown or restart",
    action: async () => {
      await window.talkedDesktop?.executeTool("cancelShutdown", {});
      return { label: "Shutdown cancelled." };
    }
  },
  {
    id: "restart",
    pattern: /^\/restart$/i,
    group: "SYSTEM",
    icon: "refresh",
    label: () => "Restart in 60s",
    sublabel: "Schedule restart - use /shutdown cancel to abort",
    action: async () => {
      await window.talkedDesktop?.executeTool("restartSystem", { delay: 60 });
      return { label: "Restarting in 60 seconds. Type /shutdown cancel to abort." };
    }
  },
  {
    id: "type",
    pattern: /^\/type\s+(.+)/i,
    group: "TOOLS",
    icon: "keyboard",
    label: (m) => `Type: "${m[1].slice(0, 55)}"`,
    sublabel: "Pastes text into active app",
    action: async (m) => {
      await window.talkedDesktop?.executeTool("typeText", { text: m[1] });
      return { autoHide: true };
    }
  },
  {
    id: "open",
    pattern: /^\/open\s+(.+)/i,
    group: "TOOLS",
    icon: "monitor",
    label: (m) => `Open: ${m[1]}`,
    sublabel: "Launch an application",
    action: async (m) => {
      await window.talkedDesktop?.executeTool("openApplication", { appName: m[1] });
      return { autoHide: true };
    }
  },
  {
    id: "url",
    pattern: /^\/url\s+(.+)/i,
    group: "TOOLS",
    icon: "globe",
    label: (m) => `Open URL: ${m[1].slice(0, 50)}`,
    sublabel: "Opens link in default browser",
    action: async (m) => {
      let url = m[1].trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
      await window.talkedDesktop?.executeTool("openUrl", { url });
      return { autoHide: true };
    }
  },
  {
    id: "clip",
    pattern: /^\/cl?i?p?(?:board)?$/i,
    group: "TOOLS",
    icon: "clipboard",
    label: () => "Read clipboard",
    sublabel: "Show clipboard contents",
    action: async () => {
      const res = await window.talkedDesktop?.executeTool("readClipboard", {});
      const text = res?.text || "(Clipboard is empty)";
      return { label: text, copy: text };
    }
  },
  {
    id: "run",
    pattern: /^\/run\s+(.+)/i,
    group: "TOOLS",
    icon: "terminal",
    label: (m) => `Run: ${m[1].slice(0, 55)}`,
    sublabel: "Execute a shell command with approval",
    action: async (m) => {
      const res = await window.talkedDesktop?.executeTool("runCommand", { command: m[1] });
      if (res?.error) return { label: `Error: ${res.error}` };
      const out = [res?.stdout, res?.stderr].filter(Boolean).join("\n").trim() || "(no output)";
      return { label: out, copy: out };
    }
  },
  {
    id: "kill",
    pattern: /^\/kill\s+(.+)/i,
    group: "TOOLS",
    icon: "x-circle",
    label: (m) => `Kill process: ${m[1]}`,
    sublabel: "Terminate a running process",
    action: async (m) => {
      const res = await window.talkedDesktop?.executeTool("killProcess", { name: m[1] });
      return { label: res?.success ? `Killed: ${m[1]}` : `Failed: ${res?.error || "unknown"}` };
    }
  },
  {
    id: "reminder",
    pattern: /^\/reminder(?:\s+(.+))?$/i,
    group: "UTILITY",
    icon: "bell",
    label: (m) => {
      const arg = m[1]?.trim();
      if (!arg) return "Set reminder (e.g. /reminder 5m take break)";
      const parsed = parseReminder(arg);
      if (!parsed) return `Reminder: e.g. /reminder ${arg} 5m`;
      return `Set reminder for ${parsed.num} ${parsed.unit}: "${parsed.message}"`;
    },
    sublabel: "e.g. /reminder 5m stretch or /reminder in 10s test",
    action: async (m) => {
      const arg = m[1]?.trim();
      if (!arg) return { label: "Usage: /reminder 5m take a break (or 10s, 1h)" };
      const parsed = parseReminder(arg);
      if (!parsed) return { label: "Invalid format. Example: /reminder 5m take a break" };
      await window.talkedDesktop?.scheduleReminder(parsed.ms, "Talked Reminder", parsed.message);
      return { label: `Reminder scheduled for ${parsed.num} ${parsed.unit}: "${parsed.message}"` };
    }
  },
  {
    id: "downloads",
    pattern: /^\/downloads?$/i,
    group: "TOOLS",
    icon: "folder",
    label: () => "Open Downloads folder",
    sublabel: "Show downloaded files in Explorer",
    action: async () => {
      await window.talkedDesktop?.openSystemFolder("downloads");
      return { autoHide: true };
    }
  },
  {
    id: "documents",
    pattern: /^\/documents?$/i,
    group: "TOOLS",
    icon: "folder",
    label: () => "Open Documents folder",
    sublabel: "Show Documents in Explorer",
    action: async () => {
      await window.talkedDesktop?.openSystemFolder("documents");
      return { autoHide: true };
    }
  },
  {
    id: "desktop-folder",
    pattern: /^\/desktop$/i,
    group: "TOOLS",
    icon: "monitor",
    label: () => "Open Desktop folder",
    sublabel: "Show Desktop files in Explorer",
    action: async () => {
      await window.talkedDesktop?.openSystemFolder("desktop");
      return { autoHide: true };
    }
  },
  {
    id: "pictures",
    pattern: /^\/pictures?$/i,
    group: "TOOLS",
    icon: "camera",
    label: () => "Open Pictures folder",
    sublabel: "Show Pictures in Explorer",
    action: async () => {
      await window.talkedDesktop?.openSystemFolder("pictures");
      return { autoHide: true };
    }
  },
  {
    id: "trash",
    pattern: /^\/(?:trash|recycle)$/i,
    group: "SYSTEM",
    icon: "trash",
    label: () => "Empty Recycle Bin",
    sublabel: "Permanently delete items in Recycle Bin",
    action: async () => {
      await window.talkedDesktop?.emptyRecycleBin();
      return { label: "Recycle bin emptied." };
    }
  },
  {
    id: "screenshot",
    pattern: /^\/(?:screenshot|ss)$/i,
    group: "TOOLS",
    icon: "camera",
    label: () => "Take screenshot to clipboard",
    sublabel: "Captures primary display and copies image",
    action: async () => {
      await window.talkedDesktop?.takeScreenshot();
      return { autoHide: true };
    }
  },
  {
    id: "clip-clear",
    pattern: /^\/clip(?:s)?\s+clear$/i,
    group: "TOOLS",
    icon: "trash",
    label: () => "Clear clipboard history",
    sublabel: "Delete all saved clipboard history",
    action: async () => {
      await window.talkedDesktop?.clearClipboardHistory();
      return { label: "Clipboard history cleared." };
    }
  },
  {
    id: "color",
    pattern: /^\/(?:color|picker)$/i,
    group: "TOOLS",
    icon: "pipette",
    label: () => "Screen Color Picker",
    sublabel: "Inspect pixel under cursor and copy HEX",
    action: async () => {
      const res = await window.talkedDesktop?.pickScreenColor();
      if (res?.success) {
        return { label: `Color: ${res.hex} (${res.rgb}) copied to clipboard`, copy: res.hex };
      }
      return { label: res?.error ? `Color pick failed: ${res.error}` : "Failed to sample screen pixel" };
    }
  },
  {
    id: "snap-left",
    pattern: /^\/snap\s+left$/i,
    group: "WINDOW",
    icon: "layout",
    label: () => "Snap Left",
    sublabel: "Snap active window to left half",
    action: async () => {
      await window.talkedDesktop?.manageWindow("snap-left");
      return { autoHide: true };
    }
  },
  {
    id: "snap-right",
    pattern: /^\/snap\s+right$/i,
    group: "WINDOW",
    icon: "layout",
    label: () => "Snap Right",
    sublabel: "Snap active window to right half",
    action: async () => {
      await window.talkedDesktop?.manageWindow("snap-right");
      return { autoHide: true };
    }
  },
  {
    id: "maximize",
    pattern: /^\/(?:maximize|max)$/i,
    group: "WINDOW",
    icon: "maximize",
    label: () => "Maximize Window",
    sublabel: "Maximize active application window",
    action: async () => {
      await window.talkedDesktop?.manageWindow("maximize");
      return { autoHide: true };
    }
  },
  {
    id: "minimize",
    pattern: /^\/(?:minimize|min)$/i,
    group: "WINDOW",
    icon: "minimize",
    label: () => "Minimize Window",
    sublabel: "Minimize active application window",
    action: async () => {
      await window.talkedDesktop?.manageWindow("minimize");
      return { autoHide: true };
    }
  },
  {
    id: "show-desktop",
    pattern: /^\/(?:show-desktop|desktop-view|minimize-all)$/i,
    group: "WINDOW",
    icon: "monitor",
    label: () => "Show Desktop",
    sublabel: "Minimize all windows to view desktop",
    action: async () => {
      await window.talkedDesktop?.manageWindow("show-desktop");
      return { autoHide: true };
    }
  },
  {
    id: "settings",
    pattern: /^\/settings?$/i,
    group: "UTILITY",
    icon: "settings",
    label: () => "Open Settings",
    sublabel: "Configure shortcuts and settings",
    action: async (_, ctx) => {
      ctx?.onOpenSettings?.();
      return { autoHide: false };
    }
  },
  {
    id: "clear",
    pattern: /^\/clear$/i,
    group: "UTILITY",
    icon: "trash",
    label: () => "Clear output",
    sublabel: "Clear command output",
    action: async (_, ctx) => {
      ctx?.onClear?.();
      return { autoHide: true };
    }
  },
  {
    id: "help",
    pattern: /^\/help$/i,
    group: "UTILITY",
    icon: "help",
    label: () => "Show all commands",
    sublabel: "List available commands",
    action: async () => {
      return {
        label: "/color  /snap left  /snap right  /maximize  /minimize  /show-desktop\n/clips  /screenshot  /downloads  /documents  /desktop  /trash\n/time  /date  /ip  /sys  /encode  /decode\n/lock  /sleep  /vol up  /vol down  /vol mute\n/shutdown  /shutdown now  /shutdown cancel  /restart\n/open  /type  /url  /clip  /run  /kill\n/reminder 5m <text>  /settings  /clear"
      };
    }
  }
];

const PREVIEW_ITEMS = [
  { id: "lock", commandId: "lock", label: "/lock", sublabel: "Lock workstation", category: "SYSTEM", icon: "lock", needsArgs: false },
  { id: "sleep", commandId: "sleep", label: "/sleep", sublabel: "Put computer to sleep", category: "SYSTEM", icon: "moon", needsArgs: false },
  { id: "trash", commandId: "trash", label: "/trash", sublabel: "Empty Windows Recycle Bin", category: "SYSTEM", icon: "trash", needsArgs: false },
  { id: "vol-up", commandId: "vol-up", label: "/vol up", sublabel: "Increase volume", category: "SYSTEM", icon: "volume", needsArgs: false },
  { id: "vol-down", commandId: "vol-down", label: "/vol down", sublabel: "Decrease volume", category: "SYSTEM", icon: "volume", needsArgs: false },
  { id: "vol-mute", commandId: "vol-mute", label: "/vol mute", sublabel: "Toggle audio mute", category: "SYSTEM", icon: "volume", needsArgs: false },
  { id: "shutdown", commandId: "shutdown", label: "/shutdown", sublabel: "Shutdown in 60 seconds", category: "SYSTEM", icon: "power", needsArgs: false },
  { id: "shutdown-now", commandId: "shutdown-now", label: "/shutdown now", sublabel: "Immediate shutdown", category: "SYSTEM", icon: "power", needsArgs: false },
  { id: "shutdown-cancel", commandId: "shutdown-cancel", label: "/shutdown cancel", sublabel: "Cancel shutdown", category: "SYSTEM", icon: "power", needsArgs: false },
  { id: "restart", commandId: "restart", label: "/restart", sublabel: "Restart in 60 seconds", category: "SYSTEM", icon: "refresh", needsArgs: false },

  { id: "snap-left", commandId: "snap-left", label: "/snap left", sublabel: "Snap active window left", category: "WINDOW", icon: "layout", needsArgs: false },
  { id: "snap-right", commandId: "snap-right", label: "/snap right", sublabel: "Snap active window right", category: "WINDOW", icon: "layout", needsArgs: false },
  { id: "maximize", commandId: "maximize", label: "/maximize", sublabel: "Maximize active window", category: "WINDOW", icon: "maximize", needsArgs: false },
  { id: "minimize", commandId: "minimize", label: "/minimize", sublabel: "Minimize active window", category: "WINDOW", icon: "minimize", needsArgs: false },
  { id: "show-desktop", commandId: "show-desktop", label: "/show-desktop", sublabel: "Minimize all windows", category: "WINDOW", icon: "monitor", needsArgs: false },
  { id: "color", commandId: "color", label: "/color", sublabel: "Screen pixel color picker", category: "TOOLS", icon: "pipette", needsArgs: false },

  { id: "clips", commandId: "clips", label: "/clips", sublabel: "Search clipboard history", category: "TOOLS", icon: "clipboard", needsArgs: false },
  { id: "screenshot", commandId: "screenshot", label: "/screenshot", sublabel: "Copy screenshot to clipboard", category: "TOOLS", icon: "camera", needsArgs: false },
  { id: "downloads", commandId: "downloads", label: "/downloads", sublabel: "Open Downloads folder", category: "TOOLS", icon: "folder", needsArgs: false },
  { id: "documents", commandId: "documents", label: "/documents", sublabel: "Open Documents folder", category: "TOOLS", icon: "folder", needsArgs: false },
  { id: "desktop-folder", commandId: "desktop-folder", label: "/desktop", sublabel: "Open Desktop folder", category: "TOOLS", icon: "monitor", needsArgs: false },
  { id: "pictures", commandId: "pictures", label: "/pictures", sublabel: "Open Pictures folder", category: "TOOLS", icon: "camera", needsArgs: false },
  { id: "open", commandId: "open", label: "/open", sublabel: "Launch application", category: "TOOLS", icon: "monitor", needsArgs: true },
  { id: "type", commandId: "type", label: "/type", sublabel: "Type text into active app", category: "TOOLS", icon: "keyboard", needsArgs: true },
  { id: "url", commandId: "url", label: "/url", sublabel: "Open website link", category: "TOOLS", icon: "globe", needsArgs: true },
  { id: "clip", commandId: "clip", label: "/clip", sublabel: "Read clipboard", category: "TOOLS", icon: "clipboard", needsArgs: false },
  { id: "run", commandId: "run", label: "/run", sublabel: "Execute shell command", category: "TOOLS", icon: "terminal", needsArgs: true },
  { id: "kill", commandId: "kill", label: "/kill", sublabel: "Terminate process", category: "TOOLS", icon: "x-circle", needsArgs: true },

  { id: "time", commandId: "time", label: "/time", sublabel: "Show current time", category: "INFO", icon: "clock", needsArgs: false },
  { id: "date", commandId: "date", label: "/date", sublabel: "Show current date", category: "INFO", icon: "calendar", needsArgs: false },
  { id: "ip", commandId: "ip", label: "/ip", sublabel: "Show IP addresses", category: "INFO", icon: "network", needsArgs: false },
  { id: "sysinfo", commandId: "sysinfo", label: "/sys", sublabel: "System and RAM info", category: "INFO", icon: "cpu", needsArgs: false },
  { id: "encode", commandId: "encode", label: "/encode", sublabel: "Base64 encode", category: "INFO", icon: "code", needsArgs: true },
  { id: "decode", commandId: "decode", label: "/decode", sublabel: "Base64 decode", category: "INFO", icon: "code", needsArgs: true },

  { id: "reminder", commandId: "reminder", label: "/reminder", sublabel: "Set timed reminder", category: "UTILITY", icon: "bell", needsArgs: true },
  { id: "settings", commandId: "settings", label: "/settings", sublabel: "Settings", category: "UTILITY", icon: "settings", needsArgs: false },
  { id: "clear", commandId: "clear", label: "/clear", sublabel: "Clear output", category: "UTILITY", icon: "trash", needsArgs: false },
  { id: "help", commandId: "help", label: "/help", sublabel: "List commands", category: "UTILITY", icon: "help", needsArgs: false }
];

function resolveLabel(cmd, m) {
  try {
    return typeof cmd.label === "function" ? cmd.label(m) : cmd.label;
  } catch (_) {
    return cmd.id;
  }
}

export function matchBuiltins(query) {
  const q = query.trim();
  if (!q.startsWith("/")) return [];

  if (q === "/") {
    return PREVIEW_ITEMS.map((item) => ({
      id: `preview-${item.id}`,
      type: "command-preview",
      label: item.label,
      sublabel: item.sublabel,
      category: item.category,
      group: item.category,
      icon: item.icon,
      needsArgs: item.needsArgs,
      commandId: item.commandId
    }));
  }

  const matched = [];
  for (const cmd of COMMANDS) {
    const m = q.match(cmd.pattern);
    if (m) {
      matched.push({
        id: cmd.id,
        type: "builtin",
        label: resolveLabel(cmd, m),
        sublabel: cmd.sublabel,
        category: cmd.group,
        group: cmd.group,
        icon: cmd.icon,
        _match: m,
        _def: cmd
      });
    }
  }

  if (matched.length === 0) {
    const term = q.slice(1).toLowerCase();
    for (const item of PREVIEW_ITEMS) {
      const strippedLabel = item.label.slice(1).toLowerCase();
      if (strippedLabel.startsWith(term) || item.id.startsWith(term) || item.commandId.startsWith(term)) {
        matched.push({
          id: `suggest-${item.id}`,
          type: "command-preview",
          label: item.label,
          sublabel: item.sublabel,
          category: item.category,
          group: item.category,
          icon: item.icon,
          needsArgs: item.needsArgs,
          commandId: item.commandId
        });
      }
    }
  }

  return matched;
}

export async function executeBuiltin(result, context) {
  if (result._def && result._match) {
    return await result._def.action(result._match, context);
  }
  if (result.commandId) {
    const cmd = COMMANDS.find((c) => c.id === result.commandId);
    if (cmd) {
      const match = [result.label];
      return await cmd.action(match, context);
    }
  }
  return null;
}
