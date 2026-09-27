import React, { useRef, useEffect } from "react";
import { Settings, Search, Loader2, LayoutGrid } from "lucide-react";

export function LauncherBar({
  query,
  onQueryChange,
  onSubmit,
  onDismiss,
  onOpenSettings,
  executing,
  activeMode = "search",
  onToggleMode
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, [activeMode]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onDismiss();
    } else if (e.key === "Tab" && (!query || query.length === 0)) {
      e.preventDefault();
      onToggleMode?.();
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    if (activeMode === "grid" && val.length > 0) {
      onToggleMode?.("search");
    }
    onQueryChange(val);
  };

  return (
    <div className={`launcher-bar${executing ? " busy" : ""}`}>
      <div className="launcher-bar-icon">
        {executing ? (
          <Loader2 className="launcher-spinner spin" />
        ) : (
          <Search className="launcher-search-icon" />
        )}
      </div>
      <input
        ref={inputRef}
        id="launcher-input"
        type="text"
        className="launcher-input"
        placeholder={activeMode === "grid" ? "Action Grid active. Type or press Tab for Search..." : 'Type to search, "/" for commands, Tab for grid...'}
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck="false"
      />
      <div className="launcher-mode-group">
        <button
          type="button"
          className={`launcher-mode-btn ${activeMode === "search" ? "active" : ""}`}
          onClick={() => onToggleMode?.("search")}
          title="Search Mode (Tab)"
        >
          <Search style={{ width: 14, height: 14 }} />
        </button>
        <button
          type="button"
          className={`launcher-mode-btn ${activeMode === "grid" ? "active" : ""}`}
          onClick={() => onToggleMode?.("grid")}
          title="Action Grid (Tab)"
        >
          <LayoutGrid style={{ width: 14, height: 14 }} />
        </button>
      </div>
      <button
        type="button"
        id="launcher-settings-btn"
        className="launcher-settings-btn"
        onClick={onOpenSettings}
        title="Settings"
      >
        <Settings className="launcher-settings-icon" />
      </button>
    </div>
  );
}
