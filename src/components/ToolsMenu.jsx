import React from "react";
import { Settings, Mic, Trash2, X, Volume2, Key, Sliders } from "lucide-react";

export function ToolsMenu({
  isOpen,
  onClose,
  onOpenSettings,
  devices,
  selectedDeviceId,
  onSelectDevice,
  sensitivity,
  onSelectSensitivity,
  isSpeaking,
  isMuted,
  onToggleMute,
  onClear,
  micLevel
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="tools-popover-menu">
      <div className="tools-menu-header">
        <span className="tools-menu-title">TALKED OPTIONS</span>
        <button type="button" className="tools-close-btn" onClick={onClose}>
          <X className="icon-xs" />
        </button>
      </div>

      <div className="tools-menu-body">
        <button
          type="button"
          className="tools-item-btn"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
        >
          <div className="tools-item-icon">
            <Key className="icon-sm" />
          </div>
          <div className="tools-item-content">
            <span className="tools-item-title">API Key & Voice</span>
            <span className="tools-item-subtitle">Configure Gemini API key and voice model</span>
          </div>
        </button>

        <div className="tools-section-divider"></div>

        <div className="tools-device-picker">
          <div className="tools-picker-label">
            <Mic className="icon-xs" />
            <span>MICROPHONE INPUT</span>
            <span className="tools-level-tag">
              {isMuted ? "MUTED" : isSpeaking ? "SPEAKING" : "READY"}
            </span>
          </div>
          <select
            className="tools-select-input"
            value={selectedDeviceId}
            onChange={(e) => onSelectDevice(e.target.value)}
          >
            {devices.length === 0 ? (
              <option value="default">Default System Microphone</option>
            ) : (
              devices.map((device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>
                  {device.label || `Microphone ${index + 1}`}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="tools-device-picker">
          <div className="tools-picker-label">
            <Sliders className="icon-xs" />
            <span>NOISE SUPPRESSION</span>
          </div>
          <select
            className="tools-select-input"
            value={sensitivity || "medium"}
            onChange={(e) => onSelectSensitivity && onSelectSensitivity(e.target.value)}
          >
            <option value="low">Aggressive (Noisy Room / Fan)</option>
            <option value="medium">Balanced (Standard Default)</option>
            <option value="high">Sensitive (Quiet Room / Soft Voice)</option>
          </select>
        </div>

        <div className="tools-action-row">
          <button
            type="button"
            className={"tools-pill-btn " + (isMuted ? "muted" : "active")}
            onClick={onToggleMute}
          >
            <Volume2 className="icon-xs" />
            <span>{isMuted ? "Unmute Mic" : "Mute Mic"}</span>
          </button>

          <button
            type="button"
            className="tools-pill-btn"
            onClick={() => {
              onClear();
              onClose();
            }}
          >
            <Trash2 className="icon-xs" />
            <span>Clear Chat</span>
          </button>
        </div>
      </div>
    </div>
  );
}
