import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LauncherBar } from "./components/LauncherBar";
import { ResultsPanel } from "./components/ResultsPanel";
import { ActionGrid } from "./components/ActionGrid";
import { SettingsModal } from "./components/SettingsModal";
import { CommandConfirmModal } from "./components/CommandConfirmModal";
import { SpotlightBar } from "./components/SpotlightBar";
import { DialogueFeed } from "./components/DialogueFeed";
import { GeminiTextClient } from "./services/geminiTextClient";
import { tryCalc, matchBuiltins, executeBuiltin } from "./commands/builtins";
import { tryConvert } from "./utils/converters";

const STORAGE_API_KEY = "talked_gemini_api_key";
const STORAGE_PROMPT = "talked_gemini_prompt";
const STORAGE_POSITION = "talked_launcher_position";
const STORAGE_DEFAULT_MODE = "talked_default_mode";

function formatSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function buildResults({ query, appResults, clipboardItems, directoryItems, isPathQuery }) {
  const q = query.trim();
  if (!q) return [];

  const raw = [];

  const calcResult = tryCalc(q);
  if (calcResult !== null) {
    raw.push({
      id: "calc",
      type: "calc",
      label: calcResult,
      sublabel: q,
      category: "QUICK",
      icon: "calculator",
      calcValue: calcResult
    });
  }

  const convertResult = tryConvert(q);
  if (convertResult !== null) {
    raw.push({
      id: "convert",
      type: "calc",
      label: convertResult,
      sublabel: q,
      category: "QUICK",
      icon: "calculator",
      calcValue: convertResult
    });
  }

  const isClipMode = /^\/(?:clip|clips|history)(?:\s+(.*))?$/i.test(q);
  if (isClipMode) {
    const match = q.match(/^\/(?:clip|clips|history)(?:\s+(.*))?$/i);
    const filterTerm = (match[1] || "").trim().toLowerCase();
    if (filterTerm !== "clear") {
      const filtered = filterTerm
        ? (clipboardItems || []).filter((item) => item.text.toLowerCase().includes(filterTerm))
        : clipboardItems || [];

      for (const item of filtered.slice(0, 25)) {
        raw.push({
          id: item.id,
          type: "clipboard-item",
          label: item.preview,
          sublabel: `${item.time} - ${item.chars} chars${item.lines > 1 ? ", " + item.lines + " lines" : ""} - Enter to paste`,
          category: "CLIPBOARD",
          icon: "clipboard",
          text: item.text
        });
      }
    }
  }

  if (isPathQuery && directoryItems && directoryItems.length > 0) {
    for (const item of directoryItems) {
      if (item.isDirectory) {
        raw.push({
          id: "dir-" + item.path,
          type: "dir-item",
          label: item.name,
          sublabel: item.path,
          category: "FILES",
          icon: "folder",
          itemPath: item.path
        });
      } else {
        raw.push({
          id: "file-" + item.path,
          type: "file-item",
          label: item.name,
          sublabel: `${formatSize(item.size)} - ${item.path}`,
          category: "FILES",
          icon: "file",
          itemPath: item.path
        });
      }
    }
  }

  const builtins = matchBuiltins(q);
  raw.push(...builtins);

  if (!q.startsWith("/")) {
    raw.push(...appResults);
  }

  if (!q.startsWith("/") && (!directoryItems || directoryItems.length === 0)) {
    raw.push(
      {
        id: "web-google",
        type: "web",
        label: `Search Google for "${q.length > 45 ? q.slice(0, 45) + "..." : q}"`,
        sublabel: "Opens in browser",
        category: "WEB",
        icon: "globe",
        url: `https://www.google.com/search?q=${encodeURIComponent(q)}`
      },
      {
        id: "web-ddg",
        type: "web",
        label: `Search DuckDuckGo for "${q.length > 45 ? q.slice(0, 45) + "..." : q}"`,
        sublabel: "Opens in browser",
        category: "WEB",
        icon: "globe",
        url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
      }
    );
  }

  const isCommandQuery = q.startsWith("/") && !isPathQuery;
  const categoryOrder = isCommandQuery
    ? ["WINDOW", "TOOLS", "SYSTEM", "INFO", "UTILITY", "CLIPBOARD", "FILES", "QUICK", "APPS", "WEB"]
    : ["QUICK", "CLIPBOARD", "FILES", "WINDOW", "TOOLS", "SYSTEM", "INFO", "UTILITY", "APPS", "WEB"];

  const grouped = [];
  for (const cat of categoryOrder) {
    for (const item of raw) {
      if ((item.category || item.group) === cat) {
        grouped.push(item);
      }
    }
  }
  for (const item of raw) {
    if (!categoryOrder.includes(item.category || item.group)) {
      grouped.push(item);
    }
  }

  return grouped;
}

export function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_API_KEY) || "");
  const [position, setPosition] = useState(() => localStorage.getItem(STORAGE_POSITION) || "upper-center");
  const [defaultMode, setDefaultMode] = useState(() => localStorage.getItem(STORAGE_DEFAULT_MODE) || "search");
  const [activeMode, setActiveMode] = useState(() => localStorage.getItem(STORAGE_DEFAULT_MODE) || "search");

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState(null);
  const [commandConfirmPending, setCommandConfirmPending] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [commandOutput, setCommandOutput] = useState(null);

  const [appResults, setAppResults] = useState([]);
  const [clipboardItems, setClipboardItems] = useState([]);
  const [directoryItems, setDirectoryItems] = useState([]);

  const [aiState, setAiState] = useState("idle");
  const [aiTurns, setAiTurns] = useState([]);
  const [aiCurrentTurn, setAiCurrentTurn] = useState({});
  const [aiMicLevel, setAiMicLevel] = useState(0);
  const [aiIsListening, setAiIsListening] = useState(false);
  const [aiIsMuted, setAiIsMuted] = useState(false);
  const [aiIsUserSpeaking, setAiIsUserSpeaking] = useState(false);
  const [aiIsTransmitting, setAiIsTransmitting] = useState(false);
  const [aiIsCapturingScreen, setAiIsCapturingScreen] = useState(false);
  const [aiScreenShareActive, setAiScreenShareActive] = useState(false);
  const [aiAttachedImage, setAiAttachedImage] = useState(null);
  const [aiErrorMessage, setAiErrorMessage] = useState("");
  const [aiModel, setAiModel] = useState("models/gemini-3.8-live");
  const [aiModelMenuOpen, setAiModelMenuOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const aiClientRef = useRef(null);
  const aiTurnIdRef = useRef(0);

  const appRootRef = useRef(null);

  useEffect(() => {
    if (window.talkedDesktop?.setLauncherPosition) {
      window.talkedDesktop.setLauncherPosition(position);
    }
  }, [position]);

  const fetchClipboard = useCallback(async () => {
    if (window.talkedDesktop?.getClipboardHistory) {
      try {
        const items = await window.talkedDesktop.getClipboardHistory();
        setClipboardItems(items || []);
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    fetchClipboard();
  }, [fetchClipboard]);

  const isPathQuery = useMemo(() => {
    const q = query.trim();
    if (!q) return false;
    if (q.startsWith("/") && !/^\/(?:home|usr|etc|var|tmp|opt)(?:[/\\]|$)/i.test(q)) {
      return false;
    }
    return /^(?:~[/\\]?|[a-zA-Z]:[/\\]?|\.\.?[/\\]|\/(?:home|usr|etc|var|tmp|opt)(?:[/\\]|$))/i.test(q);
  }, [query]);

  const results = useMemo(
    () => buildResults({ query, appResults, clipboardItems, directoryItems, isPathQuery }),
    [query, appResults, clipboardItems, directoryItems, isPathQuery]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleQueryChange = useCallback((val) => {
    setQuery(val);
    setCommandOutput(null);
    if (/^\/(?:clip|clips|history)/i.test(val.trim())) {
      fetchClipboard();
    }
  }, [fetchClipboard]);

  useEffect(() => {
    const q = query.trim();
    if (!q || q.startsWith("/") || isPathQuery) {
      setAppResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      if (window.talkedDesktop?.searchApps) {
        try {
          const found = await window.talkedDesktop.searchApps(q);
          setAppResults(
            (found || []).map((app) => ({
              id: `sysapp-${app.name}`,
              type: "app",
              label: `Open ${app.name}`,
              sublabel: app.path || app.name,
              category: "APPS",
              icon: "monitor",
              appPath: app.path,
              appName: app.name
            }))
          );
        } catch (_) {}
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, isPathQuery]);

  useEffect(() => {
    if (!isPathQuery) {
      setDirectoryItems([]);
      return;
    }
    const q = query.trim();
    const timer = setTimeout(async () => {
      if (window.talkedDesktop?.browseDirectory) {
        try {
          const res = await window.talkedDesktop.browseDirectory(q);
          if (res?.success && Array.isArray(res.items)) {
            setDirectoryItems(res.items);
          } else {
            setDirectoryItems([]);
          }
        } catch (_) {
          setDirectoryItems([]);
        }
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [query, isPathQuery]);

  useEffect(() => {
    if (window.talkedDesktop?.onCommandConfirmRequest) {
      window.talkedDesktop.onCommandConfirmRequest((data) => {
        setCommandConfirmPending(data);
      });
    }
  }, []);

  useEffect(() => {
    if (!window.talkedDesktop?.onReminderFired) return;
    window.talkedDesktop.onReminderFired((data) => {
      setCommandOutput({
        label: `Reminder: ${data.body || data.title}`
      });
    });
  }, []);

  useEffect(() => {
    if (!window.talkedDesktop?.onToggle) return;
    window.talkedDesktop.onToggle((payload) => {
      if (payload.action === "activate") {
        setQuery("");
        setCommandOutput(null);
        setExecuting(false);
        setActiveMode(defaultMode);
        fetchClipboard();
      } else if (payload.action === "hide" || payload.action === "blur") {
        setQuery("");
        setCommandOutput(null);
        setExecuting(false);
      }
    });
  }, [fetchClipboard, defaultMode]);

  useEffect(() => {
    if (!window.talkedDesktop?.setHeight) return;
    const el = appRootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = Math.max(68, Math.ceil(el.getBoundingClientRect().height));
      window.talkedDesktop.setHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeMode]);

  const getOrCreateAiClient = useCallback(() => {
    if (!aiClientRef.current) {
      aiClientRef.current = new GeminiTextClient({
        apiKey: apiKey,
        model: aiModel,
        onStateChange: (s) => {
          setAiState(s);
          setAiIsListening(s === "listening");
        },
        onTranscript: (text, role) => {
          if (role === "user") {
            setAiCurrentTurn((prev) => ({ ...prev, user: text }));
          } else {
            setAiCurrentTurn((prev) => ({ ...prev, model: (prev.model || "") + text }));
          }
        },
        onError: (msg) => setAiErrorMessage(msg),
        onMicLevel: (level, speaking) => {
          setAiMicLevel(level);
          setAiIsUserSpeaking(speaking);
        },
        onAudioTx: () => setAiIsTransmitting(true),
        onSpeechEnd: () => {
          setAiIsTransmitting(false);
          setAiCurrentTurn((prev) => {
            const id = ++aiTurnIdRef.current;
            if (prev.user || prev.model) {
              setAiTurns((turns) => [...turns, { ...prev, id }]);
            }
            return {};
          });
        },
        onToolCall: async (name, args) => {
          return await window.talkedDesktop?.executeTool(name, args) ?? { success: false };
        }
      });
    } else {
      aiClientRef.current.setApiKey(apiKey);
      aiClientRef.current.setModel(aiModel);
    }
    return aiClientRef.current;
  }, [apiKey, aiModel]);

  const handleAiToggleMic = useCallback(() => {
    if (!apiKey) {
      setShowSettings(true);
      return;
    }
    const client = getOrCreateAiClient();
    if (!aiIsListening) {
      client.connect();
    } else {
      client.disconnect?.();
      setAiIsListening(false);
      setAiState("idle");
    }
  }, [apiKey, aiIsListening, getOrCreateAiClient]);

  const handleAiSubmit = useCallback(async () => {
    const text = aiQuery.trim();
    if (!text) return;
    if (!apiKey) {
      setShowSettings(true);
      return;
    }
    const client = getOrCreateAiClient();
    setAiCurrentTurn({ user: text });
    setAiQuery("");
    setAiErrorMessage("");
    const img = aiAttachedImage?.base64 || null;
    setAiAttachedImage(null);
    try {
      await client.send(text, img);
    } catch (e) {
      setAiErrorMessage(e.message);
    }
  }, [aiQuery, apiKey, aiAttachedImage, getOrCreateAiClient]);

  const handleAiInterrupt = useCallback(() => {
    aiClientRef.current?.stopPlayback?.();
    setAiState("listening");
  }, []);

  const handleAiToggleScreenShare = useCallback(async () => {
    if (aiScreenShareActive) {
      setAiScreenShareActive(false);
      return;
    }
    if (window.talkedDesktop?.captureScreen) {
      setAiIsCapturingScreen(true);
      const base64 = await window.talkedDesktop.captureScreen();
      setAiIsCapturingScreen(false);
      if (base64) {
        setAiAttachedImage({ base64, mimeType: "image/jpeg", name: "screenshot" });
        setAiScreenShareActive(true);
      }
    }
  }, [aiScreenShareActive]);

  const aiGetFrequencyData = useCallback((arr) => {
    return aiClientRef.current?.getFrequencyData(arr) ?? false;
  }, []);

  const handleActivate = useCallback(async (result) => {
    if (!result) return;

    if (result.type === "calc") {
      navigator.clipboard.writeText(result.calcValue).catch(() => {});
      setCopiedId("calc");
      setQuery("");
      setTimeout(() => setCopiedId(null), 1500);
      return;
    }

    if (result.type === "clipboard-item") {
      await window.talkedDesktop?.pasteClipboardItem(result.text);
      setQuery("");
      return;
    }

    if (result.type === "dir-item") {
      const separator = result.itemPath.includes("/") ? "/" : "\\";
      const next = result.itemPath.endsWith(separator) ? result.itemPath : result.itemPath + separator;
      setQuery(next);
      return;
    }

    if (result.type === "file-item") {
      window.talkedDesktop?.openPath(result.itemPath);
      setQuery("");
      window.talkedDesktop?.hideWindow();
      return;
    }

    if (result.type === "web") {
      window.talkedDesktop?.executeTool("openUrl", { url: result.url });
      setQuery("");
      window.talkedDesktop?.hideWindow();
      return;
    }

    if (result.type === "app") {
      window.talkedDesktop?.executeTool("openApplication", { appName: result.appPath || result.appName });
      setQuery("");
      window.talkedDesktop?.hideWindow();
      return;
    }

    if (result.type === "command-preview") {
      if (result.needsArgs) {
        setQuery(result.label.endsWith(" ") ? result.label : result.label + " ");
        setCommandOutput(null);
        return;
      }
    }

    if (result.type === "builtin" || result.type === "command-preview") {
      setExecuting(true);
      const context = {
        onOpenSettings: () => {
          setShowSettings(true);
          setExecuting(false);
        },
        onClear: () => {
          setCommandOutput(null);
          setQuery("");
          setExecuting(false);
        }
      };
      try {
        const outcome = await executeBuiltin(result, context);
        if (!outcome || outcome.autoHide) {
          setQuery("");
          setCommandOutput(null);
          window.talkedDesktop?.hideWindow();
        } else if (outcome.label !== undefined) {
          setCommandOutput({
            label: outcome.label,
            copy: outcome.copy
          });
          setQuery("");
        }
      } finally {
        setExecuting(false);
      }
    }
  }, []);

  const handleActionGridTrigger = useCallback(async (actionType, item) => {
    if (actionType === "snap-left") {
      await window.talkedDesktop?.manageWindow("snap-left");
      return;
    }
    if (actionType === "snap-right") {
      await window.talkedDesktop?.manageWindow("snap-right");
      return;
    }
    if (actionType === "maximize") {
      await window.talkedDesktop?.manageWindow("maximize");
      return;
    }
    if (actionType === "minimize") {
      await window.talkedDesktop?.manageWindow("minimize");
      return;
    }
    if (actionType === "show-desktop") {
      await window.talkedDesktop?.manageWindow("show-desktop");
      return;
    }
    if (actionType === "pick-color") {
      const res = await window.talkedDesktop?.pickScreenColor();
      if (res?.success) {
        setCommandOutput({
          label: `Color: ${res.hex} (${res.rgb}) copied to clipboard`,
          copy: res.hex
        });
      } else {
        setCommandOutput({
          label: res?.error ? `Color pick failed: ${res.error}` : "Failed to sample screen pixel"
        });
      }
      return;
    }
    if (actionType === "screenshot") {
      await window.talkedDesktop?.takeScreenshot();
      return;
    }
    if (actionType === "open-clips") {
      setActiveMode("search");
      setQuery("/clips");
      fetchClipboard();
      return;
    }
    if (actionType === "empty-trash") {
      await window.talkedDesktop?.emptyRecycleBin();
      setCommandOutput({ label: "Recycle bin emptied." });
      return;
    }
    if (actionType === "clear-output") {
      setCommandOutput(null);
      setQuery("");
      return;
    }
    if (actionType === "vol-up") {
      await window.talkedDesktop?.executeTool("volumeUp", {});
      return;
    }
    if (actionType === "vol-down") {
      await window.talkedDesktop?.executeTool("volumeDown", {});
      return;
    }
    if (actionType === "vol-mute") {
      await window.talkedDesktop?.executeTool("volumeMute", {});
      return;
    }
    if (actionType === "lock") {
      await window.talkedDesktop?.executeTool("lockScreen", {});
      window.talkedDesktop?.hideWindow();
      return;
    }
    if (actionType === "sleep") {
      await window.talkedDesktop?.executeTool("sleepSystem", {});
      window.talkedDesktop?.hideWindow();
      return;
    }
    if (actionType === "folder-downloads") {
      await window.talkedDesktop?.openSystemFolder("downloads");
      window.talkedDesktop?.hideWindow();
      return;
    }
    if (actionType === "folder-documents") {
      await window.talkedDesktop?.openSystemFolder("documents");
      window.talkedDesktop?.hideWindow();
      return;
    }
    if (actionType === "folder-desktop") {
      await window.talkedDesktop?.openSystemFolder("desktop");
      window.talkedDesktop?.hideWindow();
      return;
    }
    if (actionType === "folder-pictures") {
      await window.talkedDesktop?.openSystemFolder("pictures");
      window.talkedDesktop?.hideWindow();
      return;
    }
  }, [fetchClipboard]);

  const handleSubmit = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    if (results.length === 0) return;
    const idx = Math.max(0, Math.min(selectedIndex, results.length - 1));
    await handleActivate(results[idx]);
  }, [query, results, selectedIndex, handleActivate]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (showSettings) {
        setShowSettings(false);
        return;
      }
      if (commandOutput) {
        setCommandOutput(null);
        return;
      }
      setQuery("");
      if (window.talkedDesktop?.hideWindow) window.talkedDesktop.hideWindow();
    }
  }, [results, showSettings, commandOutput]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleSaveSettings = ({ apiKey: newKey, position: newPos, defaultMode: newDefaultMode }) => {
    localStorage.setItem(STORAGE_API_KEY, newKey);
    localStorage.setItem(STORAGE_POSITION, newPos);
    localStorage.setItem(STORAGE_DEFAULT_MODE, newDefaultMode);
    setApiKey(newKey);
    setPosition(newPos);
    setDefaultMode(newDefaultMode);
    window.talkedDesktop?.setLauncherPosition(newPos);
    setSettingsFeedback({ type: "success", message: "Saved." });
    setTimeout(() => {
      setShowSettings(false);
      setSettingsFeedback(null);
    }, 400);
  };

  const handleCopyOutput = useCallback(() => {
    const text = commandOutput?.copy || commandOutput?.label || "";
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId("output");
    setTimeout(() => setCopiedId(null), 1500);
  }, [commandOutput]);

  const toggleMode = (target) => {
    if (target) {
      setActiveMode(target);
    } else {
      setActiveMode((prev) => (prev === "search" ? "grid" : "search"));
    }
  };

  const hasPanel = results.length > 0 || commandOutput;

  return (
    <div className="launcher-root" ref={appRootRef}>
      <LauncherBar
        query={query}
        onQueryChange={handleQueryChange}
        onSubmit={handleSubmit}
        onDismiss={() => window.talkedDesktop?.hideWindow()}
        onOpenSettings={() => setShowSettings(true)}
        executing={executing}
        activeMode={activeMode}
        onToggleMode={toggleMode}
      />

      {commandOutput && activeMode === "grid" && (
        <div className="grid-output-strip">
          <span className="grid-output-text">{commandOutput.label}</span>
          <button
            type="button"
            className="grid-output-copy-btn"
            onClick={handleCopyOutput}
          >
            {copiedId === "output" ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {activeMode === "search" && hasPanel && (
        <ResultsPanel
          results={results}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          onActivate={handleActivate}
          commandOutput={commandOutput}
          copiedId={copiedId}
          onCopyOutput={handleCopyOutput}
        />
      )}

      {activeMode === "grid" && (
        <ActionGrid
          onTriggerAction={handleActionGridTrigger}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {activeMode === "ai" && (
        <>          <SpotlightBar
            state={aiState}
            query={aiQuery}
            setQuery={setAiQuery}
            onSubmit={handleAiSubmit}
            isListening={aiIsListening}
            onToggleMic={handleAiToggleMic}
            isMuted={aiIsMuted}
            micLevel={aiMicLevel}
            isUserSpeaking={aiIsUserSpeaking}
            isTransmitting={aiIsTransmitting}
            model={aiModel}
            onSelectModel={setAiModel}
            modelMenuOpen={aiModelMenuOpen}
            setModelMenuOpen={setAiModelMenuOpen}
            onDismiss={() => window.talkedDesktop?.hideWindow()}
            hasApiKey={!!apiKey}
            errorMessage={aiErrorMessage}
            onOpenSettings={() => setShowSettings(true)}
            onToggleScreenShare={handleAiToggleScreenShare}
            screenShareActive={aiScreenShareActive}
            isCapturingScreen={aiIsCapturingScreen}
            attachedImage={aiAttachedImage}
            onAttachImage={setAiAttachedImage}
            onClearAttachment={() => setAiAttachedImage(null)}
            windowPosition="center-top"
          />
          <DialogueFeed
            turns={aiTurns}
            currentTurn={aiCurrentTurn}
            state={aiState}
            micLevel={aiMicLevel}
            onInterrupt={handleAiInterrupt}
            getFrequencyData={aiGetFrequencyData}
          />
        </>
      )}

      {showSettings && (
        <SettingsModal
          apiKey={apiKey}
          position={position}
          defaultMode={defaultMode}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
          feedback={settingsFeedback}
        />
      )}

      {commandConfirmPending && (
        <CommandConfirmModal
          command={commandConfirmPending.cmd}
          onAllow={() => {
            window.talkedDesktop?.respondCommandConfirm(commandConfirmPending.id, true);
            setCommandConfirmPending(null);
          }}
          onDeny={() => {
            window.talkedDesktop?.respondCommandConfirm(commandConfirmPending.id, false);
            setCommandConfirmPending(null);
          }}
        />
      )}
    </div>
  );
}
