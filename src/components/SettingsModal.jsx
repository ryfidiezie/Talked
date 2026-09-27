import React, { useState, useEffect } from "react";
import { X, Key, Eye, EyeOff, Save, Sliders, Layout, Monitor } from "lucide-react";

const POSITION_OPTIONS = [
  { id: "upper-center", label: "Upper Center", desc: "Elevated standard position" },
  { id: "center", label: "True Center", desc: "Center of screen" },
  { id: "top", label: "Top Bar", desc: "Top edge placement" },
  { id: "bottom", label: "Bottom Dock", desc: "Bottom screen placement" },
  { id: "top-right", label: "Top Right", desc: "Upper right corner" }
];

const MODE_OPTIONS = [
  { id: "search", label: "Search Bar", desc: "Keyboard command launcher" },
  { id: "grid", label: "Action Grid", desc: "One-click action deck" }
];

export function SettingsModal({ apiKey, position = "upper-center", defaultMode = "search", onSave, onClose, feedback }) {
  const [keyInput, setKeyInput] = useState(apiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [posChoice, setPosChoice] = useState(position);
  const [modeChoice, setModeChoice] = useState(defaultMode);

  useEffect(() => {
    setKeyInput(apiKey || "");
  }, [apiKey]);

  useEffect(() => {
    setPosChoice(position);
  }, [position]);

  useEffect(() => {
    setModeChoice(defaultMode);
  }, [defaultMode]);

  const handlePositionChange = (newPos) => {
    setPosChoice(newPos);
    window.talkedDesktop?.setLauncherPosition(newPos);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      apiKey: keyInput.trim(),
      position: posChoice,
      defaultMode: modeChoice
    });
  };

  return (
    <div className="settings-overlay-panel">
      <div className="settings-modal-header">
        <div className="modal-title-box">
          <Sliders className="icon-sm" />
          <span>CONFIGURATION</span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} title="Close">
          <X className="icon-sm" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="settings-modal-body">
        <div className="setting-field-group">
          <label className="field-label">
            <Monitor className="icon-xs" />
            <span>SCREEN POSITION</span>
          </label>
          <div className="position-options-grid">
            {POSITION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`position-pill ${posChoice === opt.id ? "active" : ""}`}
                onClick={() => handlePositionChange(opt.id)}
              >
                <span className="pill-title">{opt.label}</span>
                <span className="pill-desc">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setting-field-group">
          <label className="field-label">
            <Layout className="icon-xs" />
            <span>DEFAULT LAUNCH MODE</span>
          </label>
          <div className="mode-options-grid">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`mode-pill ${modeChoice === opt.id ? "active" : ""}`}
                onClick={() => setModeChoice(opt.id)}
              >
                <span className="pill-title">{opt.label}</span>
                <span className="pill-desc">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setting-field-group">
          <label className="field-label" htmlFor="api-key-field">
            <Key className="icon-xs" />
            <span>GEMINI API KEY</span>
          </label>
          <div className="field-input-wrapper">
            <input
              id="api-key-field"
              type={showKey ? "text" : "password"}
              className="field-text-input"
              placeholder="Paste Google AI Studio API key"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoComplete="off"
            />
            <button type="button" className="visibility-toggle-btn" onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff className="icon-xs" /> : <Eye className="icon-xs" />}
            </button>
          </div>
          <span className="field-description">Used for text and model tools. Optional.</span>
        </div>

        <div className="shortcut-guide-card">
          <span className="guide-title">SHORTCUTS AND HOTKEYS</span>
          <div className="guide-row">
            <span className="guide-label">Toggle Launcher:</span>
            <span className="guide-keys"><kbd className="key-cap">Alt</kbd>+<kbd className="key-cap">Space</kbd></span>
          </div>
          <div className="guide-row">
            <span className="guide-label">Switch Search / Grid:</span>
            <span className="guide-keys"><kbd className="key-cap">Tab</kbd></span>
          </div>
          <div className="guide-row">
            <span className="guide-label">Color Picker:</span>
            <span className="guide-keys"><kbd className="key-cap">/color</kbd></span>
          </div>
          <div className="guide-row">
            <span className="guide-label">Snap Active Window:</span>
            <span className="guide-keys"><kbd className="key-cap">/snap left</kbd> / <kbd className="key-cap">/snap right</kbd></span>
          </div>
          <div className="guide-row">
            <span className="guide-label">Navigate / Run:</span>
            <span className="guide-keys"><kbd className="key-cap">Up</kbd> / <kbd className="key-cap">Down</kbd> / <kbd className="key-cap">Enter</kbd></span>
          </div>
          <div className="guide-row">
            <span className="guide-label">Dismiss:</span>
            <span className="guide-keys"><kbd className="key-cap">Esc</kbd></span>
          </div>
        </div>

        {feedback && (
          <div className={"settings-feedback-line " + feedback.type}>{feedback.message}</div>
        )}

        <div className="settings-submit-row">
          <button type="submit" className="save-config-btn">
            <Save className="icon-xs" />
            <span>Save Preferences</span>
          </button>
        </div>
      </form>
    </div>
  );
}
