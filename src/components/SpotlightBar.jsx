import React, { useRef, useEffect, useState } from "react";
import { Plus, ChevronDown, Mic, MicOff, Square, AlertCircle, Loader2, Camera, Settings, ImageIcon, Clipboard, X, FileImage } from "lucide-react";

const SLASH_COMMANDS = [
  { cmd: "/reminder", desc: "Set a reminder", usage: "/reminder in 5 minutes take a break" },
  { cmd: "/search", desc: "Search the web", usage: "/search latest AI news" },
  { cmd: "/type", desc: "Type text into active app", usage: "/type hello world" },
  { cmd: "/screenshot", desc: "Attach current screenshot", usage: "/screenshot" },
  { cmd: "/clipboard", desc: "Read clipboard contents", usage: "/clipboard" },
  { cmd: "/open", desc: "Open an application", usage: "/open spotify" },
  { cmd: "/url", desc: "Open a URL in browser", usage: "/url https://..." },
  { cmd: "/clear", desc: "Clear conversation history", usage: "/clear" },
  { cmd: "/mute", desc: "Toggle microphone mute", usage: "/mute" },
  { cmd: "/settings", desc: "Open settings", usage: "/settings" },
  { cmd: "/help", desc: "Show all commands", usage: "/help" },
];

export function SpotlightBar({
  state,
  query,
  setQuery,
  onSubmit,
  isListening,
  onToggleMic,
  isMuted,
  micLevel,
  isUserSpeaking,
  isTransmitting,
  model,
  onSelectModel,
  modelMenuOpen,
  setModelMenuOpen,
  onDismiss,
  hasApiKey,
  errorMessage,
  onOpenSettings,
  onToggleScreenShare,
  screenShareActive,
  isCapturingScreen,
  attachedImage,
  onAttachImage,
  onClearAttachment,
  windowPosition
}) {
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const plusRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!plusOpen) return;
    const handler = (e) => {
      if (plusRef.current && !plusRef.current.contains(e.target)) {
        setPlusOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [plusOpen]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    } else if (e.key === "Escape" || (e.altKey && (e.code === "Space" || e.key === " "))) {
      e.preventDefault();
      onDismiss();
    }
  };

  const getModelLabel = () => {
    if (model.includes("3.8")) return "3.8 Live";
    return "Flash";
  };

  const getPlaceholder = () => {
    if (!hasApiKey) return "Paste your Gemini API key here";
    if (errorMessage) return "API error (see below)";
    if (state === "connecting") return "Connecting...";
    if (state === "thinking") return "Thinking...";
    if (state === "speaking") return "Talking...";
    if (isListening && !isMuted) return "Listening...";
    return "Ask anything or type / for commands";
  };

  const slashSuggestions = query.startsWith("/")
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(query.split(" ")[0].toLowerCase())).slice(0, 6)
    : [];

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result.split(",")[1];
      onAttachImage({ base64, mimeType: file.type, name: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
    setPlusOpen(false);
  };

  const handlePasteImage = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = (ev) => {
            const base64 = ev.target.result.split(",")[1];
            onAttachImage({ base64, mimeType: imageType, name: "pasted-image" });
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    } catch (e) {}
    setPlusOpen(false);
  };

  const handleAttachScreenshot = async () => {
    if (window.talkedDesktop && window.talkedDesktop.captureScreen) {
      const base64 = await window.talkedDesktop.captureScreen();
      if (base64) {
        onAttachImage({ base64, mimeType: "image/jpeg", name: "screenshot" });
      }
    }
    setPlusOpen(false);
  };

  const isCornerMode = windowPosition && windowPosition !== "center-top";

  if (isCornerMode) {
    return (
      <div className="corner-pill-container">
        <div className={"corner-pill" + (isListening ? " listening" : "") + (state === "speaking" ? " speaking" : "") + (errorMessage ? " has-error" : "")}>
          <button
            type="button"
            className={"corner-mic-btn" + (isListening ? " active" : "") + (isTransmitting ? " transmitting" : "")}
            onClick={onToggleMic}
            title={!hasApiKey ? "Set API key" : isListening ? "Mute" : "Speak"}
          >
            <div className="mic-wrapper">
              {state === "connecting" || state === "thinking" ? (
                <Loader2 className="icon-mic-glyph spin thinking" />
              ) : state === "speaking" ? (
                <Square className="icon-mic-glyph" style={{ color: "var(--gemini-accent-red)" }} />
              ) : isMuted ? (
                <MicOff className="icon-mic-glyph muted" />
              ) : (
                <Mic className="icon-mic-glyph" />
              )}
              {isListening && isUserSpeaking && micLevel > 0.08 && (
                <span
                  className="mic-pulse-ring"
                  style={{
                    transform: `scale(${1 + micLevel * 0.9})`,
                    opacity: Math.min(1, micLevel * 1.6)
                  }}
                />
              )}
            </div>
          </button>

          <div className="corner-divider" />

          <button
            type="button"
            className={"corner-icon-btn" + (screenShareActive ? " active" : "")}
            onClick={onToggleScreenShare}
            title={screenShareActive ? "Screen capture on" : "Screen capture off"}
          >
            <Camera width={16} height={16} />
            {screenShareActive && <span className="camera-active-dot" />}
          </button>

          <button
            type="button"
            className="corner-icon-btn"
            onClick={onOpenSettings}
            title="Settings"
          >
            <Settings width={16} height={16} />
          </button>
        </div>

        {errorMessage && (
          <div className="gemini-error-banner">
            <div className="error-banner-content">
              <AlertCircle className="icon-xs error-icon" />
              <span className="error-banner-text">{errorMessage}</span>
            </div>
            <button type="button" className="error-banner-action" onClick={onOpenSettings}>
              Update Key
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="gemini-pill-container">
      {attachedImage && (
        <div className="attachment-chip-row">
          <div className="attachment-chip">
            <img
              className="attachment-chip-thumb"
              src={`data:${attachedImage.mimeType};base64,${attachedImage.base64}`}
              alt={attachedImage.name}
            />
            <span className="attachment-chip-name">{attachedImage.name}</span>
            <button type="button" className="attachment-chip-remove" onClick={onClearAttachment}>
              <X width={12} height={12} />
            </button>
          </div>
        </div>
      )}

      <div className={"gemini-pill-bar " + (isListening ? "listening " : "") + (state === "speaking" ? "speaking " : "") + (state === "thinking" ? "thinking " : "") + (errorMessage ? "has-error " : "")}>
        <div className="plus-anchor" ref={plusRef}>
          <button
            type="button"
            className={"pill-plus-btn" + (plusOpen ? " active" : "")}
            onClick={() => setPlusOpen((o) => !o)}
            title="Attach"
          >
            <Plus className="icon-plus" />
          </button>

          {plusOpen && (
            <div className="plus-popover">
              <button type="button" className="plus-popover-item" onClick={() => { fileInputRef.current && fileInputRef.current.click(); }}>
                <ImageIcon width={15} height={15} />
                <span>Upload image</span>
              </button>
              <button type="button" className="plus-popover-item" onClick={handlePasteImage}>
                <Clipboard width={15} height={15} />
                <span>Paste image</span>
              </button>
              <button type="button" className="plus-popover-item" onClick={handleAttachScreenshot}>
                <FileImage width={15} height={15} />
                <span>Attach screenshot</span>
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>

        <div className="pill-input-area">
          <input
            ref={inputRef}
            type="text"
            className="pill-text-input"
            placeholder={getPlaceholder()}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck="false"
          />
        </div>

        <div className="pill-actions-right">
          <div className="model-dropdown-anchor">
            <button
              type="button"
              className="model-pill-trigger"
              onClick={() => setModelMenuOpen(!modelMenuOpen)}
              title="Select model"
            >
              <span className="model-pill-text">{getModelLabel()}</span>
              <ChevronDown className="icon-chevron" />
            </button>

            {modelMenuOpen && (
              <div className="model-dropdown-menu">
                <button
                  type="button"
                  className={"model-menu-item " + (model.includes("3.8") ? "active" : "")}
                  onClick={() => { onSelectModel("models/gemini-3.8-live"); setModelMenuOpen(false); }}
                >
                  <span className="item-title">3.8 Live</span>
                  <span className="item-desc">Ultra-low latency audio</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className={"pill-camera-btn " + (screenShareActive ? "active " : "") + (isCapturingScreen ? "capturing " : "")}
            onClick={onToggleScreenShare}
            title={screenShareActive ? "Screen capture on (click to turn off)" : "Turn on screen capture"}
          >
            <Camera className="icon-camera" />
            {screenShareActive && <span className="camera-active-dot"></span>}
          </button>

          <button
            type="button"
            className="pill-settings-btn"
            onClick={onOpenSettings}
            title="Settings"
          >
            <Settings className="icon-settings" />
          </button>

          {state === "thinking" && (
            <div className="pill-thinking-chip">
              <Loader2 className="icon-thinking-spinner spin" />
              <span className="thinking-chip-text">Thinking</span>
            </div>
          )}

          {state === "speaking" ? (
            <button
              type="button"
              className="pill-mic-btn speaking"
              onClick={onToggleMic}
              title="Stop"
            >
              <Square className="icon-mic-speaking" />
            </button>
          ) : (
            <button
              type="button"
              className={"pill-mic-btn " + (isListening ? "active " : "") + (isTransmitting ? "transmitting " : "")}
              onClick={onToggleMic}
              title={!hasApiKey ? "Set API key" : isListening ? "Mute" : "Speak"}
            >
              <div className="mic-wrapper">
                {state === "connecting" || state === "thinking" ? (
                  <Loader2 className="icon-mic-glyph spin thinking" />
                ) : isMuted ? (
                  <MicOff className="icon-mic-glyph muted" />
                ) : (
                  <Mic className="icon-mic-glyph" />
                )}
                {isListening && isUserSpeaking && micLevel > 0.08 && (
                  <span
                    className="mic-pulse-ring"
                    style={{
                      transform: `scale(${1 + micLevel * 0.9})`,
                      opacity: Math.min(1, micLevel * 1.6)
                    }}
                  ></span>
                )}
              </div>
            </button>
          )}
        </div>
      </div>

      {slashSuggestions.length > 0 && (
        <div className="slash-palette">
          {slashSuggestions.map((c) => (
            <button
              key={c.cmd}
              type="button"
              className="slash-palette-item"
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery(c.cmd + " ");
                if (inputRef.current) inputRef.current.focus();
              }}
            >
              <span className="slash-cmd">{c.cmd}</span>
              <span className="slash-desc">{c.desc}</span>
              <span className="slash-usage">{c.usage}</span>
            </button>
          ))}
        </div>
      )}

      {errorMessage && (
        <div className="gemini-error-banner">
          <div className="error-banner-content">
            <AlertCircle className="icon-xs error-icon" />
            <span className="error-banner-text">
              {errorMessage.includes("quota") || (errorMessage.includes("1011") && errorMessage.toLowerCase().includes("quota"))
                ? "Google API rate limit or quota exceeded (Click Update Key)"
                : errorMessage}
            </span>
          </div>
          <button type="button" className="error-banner-action" onClick={onOpenSettings}>
            Update Key
          </button>
        </div>
      )}
    </div>
  );
}
