import React from "react";
import { Terminal, ShieldAlert, Check, X } from "lucide-react";

export function CommandConfirmModal({ command, onAllow, onDeny }) {
  return (
    <div className="cmd-confirm-overlay">
      <div className="cmd-confirm-card">
        <div className="cmd-confirm-header">
          <ShieldAlert className="cmd-confirm-icon" />
          <span className="cmd-confirm-title">Shell Command Request</span>
        </div>
        <div className="cmd-confirm-body">
          <div className="cmd-confirm-label">Talked wants to run:</div>
          <div className="cmd-confirm-code">
            <Terminal width={13} height={13} className="cmd-terminal-icon" />
            <code className="cmd-confirm-text">{command}</code>
          </div>
        </div>
        <div className="cmd-confirm-actions">
          <button type="button" className="cmd-deny-btn" onClick={onDeny}>
            <X width={13} height={13} />
            <span>Deny</span>
          </button>
          <button type="button" className="cmd-allow-btn" onClick={onAllow}>
            <Check width={13} height={13} />
            <span>Allow</span>
          </button>
        </div>
      </div>
    </div>
  );
}
