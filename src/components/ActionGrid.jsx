import React, { useState } from "react";
import {
  Layout, Maximize2, Minimize2, Monitor, Pipette,
  Camera, Clipboard, Trash2, RotateCcw, Volume2,
  VolumeX, Lock, Moon, Folder, FileText, ArrowLeft,
  Settings, Power, Sparkles, Check
} from "lucide-react";

const ACTION_SECTIONS = [
  {
    id: "window",
    title: "WINDOW MANAGEMENT",
    color: "#5dade2",
    items: [
      { id: "snap-left", label: "Snap Left", desc: "Left half of screen", icon: Layout, action: "snap-left" },
      { id: "snap-right", label: "Snap Right", desc: "Right half of screen", icon: Layout, action: "snap-right" },
      { id: "maximize", label: "Maximize", desc: "Full screen toggle", icon: Maximize2, action: "maximize" },
      { id: "minimize", label: "Minimize", desc: "Minimize active window", icon: Minimize2, action: "minimize" },
      { id: "show-desktop", label: "Show Desktop", desc: "Hide all windows", icon: Monitor, action: "show-desktop" }
    ]
  },
  {
    id: "tools",
    title: "QUICK TOOLS",
    color: "#7ca3f5",
    items: [
      { id: "color-picker", label: "Color Picker", desc: "Copy screen pixel HEX", icon: Pipette, action: "pick-color" },
      { id: "screenshot", label: "Screenshot", desc: "Capture to clipboard", icon: Camera, action: "screenshot" },
      { id: "clips", label: "Clipboard", desc: "Browse recent clips", icon: Clipboard, action: "open-clips" },
      { id: "trash", label: "Empty Trash", desc: "Purge Recycle Bin", icon: Trash2, action: "empty-trash" },
      { id: "clear", label: "Clear Output", desc: "Reset launcher state", icon: RotateCcw, action: "clear-output" }
    ]
  },
  {
    id: "system",
    title: "SYSTEM AND AUDIO",
    color: "#f07070",
    items: [
      { id: "vol-up", label: "Volume Up", desc: "Increase audio level", icon: Volume2, action: "vol-up" },
      { id: "vol-down", label: "Volume Down", desc: "Decrease audio level", icon: Volume2, action: "vol-down" },
      { id: "vol-mute", label: "Toggle Mute", desc: "Mute or unmute sound", icon: VolumeX, action: "vol-mute" },
      { id: "lock", label: "Lock PC", desc: "Lock current workstation", icon: Lock, action: "lock" },
      { id: "sleep", label: "Sleep PC", desc: "Put system to sleep", icon: Moon, action: "sleep" }
    ]
  },
  {
    id: "folders",
    title: "QUICK FOLDERS",
    color: "#4ecdc4",
    items: [
      { id: "downloads", label: "Downloads", desc: "Open Downloads folder", icon: Folder, action: "folder-downloads" },
      { id: "documents", label: "Documents", desc: "Open Documents folder", icon: Folder, action: "folder-documents" },
      { id: "desktop-folder", label: "Desktop", desc: "Open Desktop folder", icon: Monitor, action: "folder-desktop" },
      { id: "pictures", label: "Pictures", desc: "Open Pictures folder", icon: Camera, action: "folder-pictures" }
    ]
  }
];

export function ActionGrid({ onTriggerAction, onOpenSettings }) {
  const [activeTab, setActiveTab] = useState("all");
  const [recentActionId, setRecentActionId] = useState(null);

  const handleCardClick = (item) => {
    setRecentActionId(item.id);
    setTimeout(() => {
      setRecentActionId(null);
    }, 600);
    onTriggerAction?.(item.action, item);
  };

  const sectionsToDisplay = activeTab === "all"
    ? ACTION_SECTIONS
    : ACTION_SECTIONS.filter((s) => s.id === activeTab);

  return (
    <div className="action-grid-wrapper">
      <div className="action-grid-tabs">
        <button
          type="button"
          className={`grid-tab-btn ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All
        </button>
        {ACTION_SECTIONS.map((sec) => (
          <button
            key={sec.id}
            type="button"
            className={`grid-tab-btn ${activeTab === sec.id ? "active" : ""}`}
            onClick={() => setActiveTab(sec.id)}
          >
            {sec.title}
          </button>
        ))}
      </div>

      <div className="action-grid-scroll">
        {sectionsToDisplay.map((sec) => (
          <div key={sec.id} className="action-section">
            <div className="action-section-header">
              <span className="action-section-indicator" style={{ backgroundColor: sec.color }} />
              <span className="action-section-title">{sec.title}</span>
            </div>
            <div className="action-cards-grid">
              {sec.items.map((item) => {
                const IconComponent = item.icon;
                const isClicked = recentActionId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`action-card ${isClicked ? "action-card-clicked" : ""}`}
                    onClick={() => handleCardClick(item)}
                    title={item.desc}
                  >
                    <div className="action-card-icon-box" style={{ color: sec.color }}>
                      {isClicked ? <Check style={{ width: 18, height: 18, color: "#6ec97c" }} /> : <IconComponent style={{ width: 18, height: 18 }} />}
                    </div>
                    <div className="action-card-info">
                      <div className="action-card-label">{item.label}</div>
                      <div className="action-card-desc">{item.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="action-grid-footer">
        <span className="action-grid-hint">
          Click an action to execute immediately
        </span>
        <button
          type="button"
          className="action-grid-settings-btn"
          onClick={onOpenSettings}
        >
          <Settings style={{ width: 13, height: 13 }} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
