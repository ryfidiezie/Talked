import React, { useEffect, useRef } from "react";
import {
  Monitor, Globe, Keyboard, Clipboard, Camera, Terminal,
  Bell, Settings, Trash2, HelpCircle, Calculator, Zap,
  ChevronRight, Copy, Check, Clock, Calendar, Wifi,
  Cpu, Code, Lock, Moon, Volume2, Power, RefreshCw,
  XCircle, Folder, FileText, Pipette, Layout, Maximize2, Minimize2
} from "lucide-react";

const ICON_MAP = {
  monitor: Monitor, globe: Globe, keyboard: Keyboard, clipboard: Clipboard,
  camera: Camera, terminal: Terminal, bell: Bell, settings: Settings,
  trash: Trash2, help: HelpCircle, calculator: Calculator, zap: Zap,
  clock: Clock, calendar: Calendar, network: Wifi, cpu: Cpu,
  code: Code, lock: Lock, moon: Moon, volume: Volume2, power: Power,
  refresh: RefreshCw, "x-circle": XCircle, folder: Folder, file: FileText,
  pipette: Pipette, layout: Layout, maximize: Maximize2, minimize: Minimize2
};

const GROUP_COLORS = {
  SYSTEM: "#f07070",
  WINDOW: "#5dade2",
  TOOLS: "#7ca3f5",
  INFO: "#6ec97c",
  UTILITY: "#f5c842",
  QUICK: "#c47cf5",
  CLIPBOARD: "#f5a623",
  FILES: "#4ecdc4",
  APPS: "#7ca3f5",
  WEB: "#a0a3a1"
};

function ResultIcon({ icon, group }) {
  const Icon = ICON_MAP[icon] || ChevronRight;
  const color = GROUP_COLORS[group] || "var(--text-dim)";
  return <Icon style={{ width: 14, height: 14, color }} />;
}

function groupResults(results) {
  const order = ["QUICK", "CLIPBOARD", "FILES", "WINDOW", "SYSTEM", "TOOLS", "INFO", "UTILITY", "APPS", "WEB", "ACTIONS"];
  const groups = new Map();
  for (const r of results) {
    const cat = r.category || "OTHER";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(r);
  }
  const sorted = new Map();
  for (const key of order) {
    if (groups.has(key)) sorted.set(key, groups.get(key));
  }
  for (const [k, v] of groups) {
    if (!sorted.has(k)) sorted.set(k, v);
  }
  return sorted;
}

export function ResultsPanel({
  results, selectedIndex, setSelectedIndex, onActivate,
  commandOutput, copiedId, onCopyOutput
}) {
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (commandOutput) {
    return (
      <div className="results-panel">
        <div className="output-block">
          <div className="output-label">{commandOutput.label}</div>
          {commandOutput.copy !== undefined && (
            <button type="button" className="output-copy-btn" onClick={onCopyOutput}>
              {copiedId === "output" ? (
                <><Check className="icon-xs success" /><span>Copied</span></>
              ) : (
                <><Copy className="icon-xs" /><span>Copy</span></>
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!results || results.length === 0) return null;

  const groups = groupResults(results);
  let flatIndex = 0;

  return (
    <div className="results-panel">
      {Array.from(groups.entries()).map(([category, items]) => (
        <div key={category} className="results-group">
          <div className="results-category-header">
            <span style={{ color: GROUP_COLORS[category] || "var(--text-dim)" }}>{category}</span>
          </div>
          {items.map((result) => {
            const idx = flatIndex++;
            const isActive = idx === selectedIndex;
            const isPreview = result.type === "command-preview";
            return (
              <button
                key={result.id || idx}
                ref={isActive ? activeRef : null}
                type="button"
                className={`result-item${isActive ? " active" : ""}${isPreview ? " preview" : ""}`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => onActivate(result)}
                id={`result-item-${idx}`}
              >
                <div className="result-item-icon" style={{ background: `${GROUP_COLORS[result.group || category]}12` }}>
                  <ResultIcon icon={result.icon} group={result.group || category} />
                </div>
                <div className="result-item-body">
                  <span className={`result-item-label${result.type === "calc" ? " mono" : ""}`}>
                    {result.label}
                  </span>
                  {result.sublabel && (
                    <span className="result-item-sublabel">{result.sublabel}</span>
                  )}
                </div>
                {result.type === "clipboard-item" && (
                  <span className="result-item-tag" style={{ color: "#f5a623" }}>Clip</span>
                )}
                {result.type === "dir-item" && (
                  <span className="result-item-tag" style={{ color: "#4ecdc4" }}>Folder</span>
                )}
                {result.type === "file-item" && (
                  <span className="result-item-tag" style={{ color: "var(--text-secondary)" }}>File</span>
                )}
                {result.type === "web" && (
                  <span className="result-item-tag">Web</span>
                )}
                {result.type === "app" && (
                  <span className="result-item-tag">App</span>
                )}
                {result.type === "calc" && (
                  <Copy className="result-copy-hint" />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
