import React, { useRef, useEffect, useState } from "react";
import { Copy, Check, Square, Loader2 } from "lucide-react";

export function DialogueFeed({
  turns,
  currentTurn,
  state,
  micLevel,
  onInterrupt,
  getFrequencyData
}) {
  const scrollRef = useRef(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const b1Ref = useRef(null);
  const b2Ref = useRef(null);
  const b3Ref = useRef(null);
  const b4Ref = useRef(null);
  const animFrameRef = useRef(null);
  const freqBufferRef = useRef(new Uint8Array(32));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, currentTurn]);

  useEffect(() => {
    const updateFrequencies = () => {
      if (getFrequencyData && freqBufferRef.current) {
        const hasData = getFrequencyData(freqBufferRef.current);
        if (hasData) {
          const buf = freqBufferRef.current;
          const v1 = Math.max(4, Math.min(24, Math.round(((buf[1] + buf[2]) / 2 / 255) * 24)));
          const v2 = Math.max(4, Math.min(24, Math.round(((buf[3] + buf[4] + buf[5]) / 3 / 255) * 24)));
          const v3 = Math.max(4, Math.min(24, Math.round(((buf[6] + buf[7] + buf[8]) / 3 / 255) * 24)));
          const v4 = Math.max(4, Math.min(24, Math.round(((buf[9] + buf[10] + buf[11]) / 3 / 255) * 24)));

          if (b1Ref.current) b1Ref.current.style.height = `${v1}px`;
          if (b2Ref.current) b2Ref.current.style.height = `${v2}px`;
          if (b3Ref.current) b3Ref.current.style.height = `${v3}px`;
          if (b4Ref.current) b4Ref.current.style.height = `${v4}px`;
        } else if (micLevel > 0.02) {
          const v1 = Math.max(4, Math.min(24, Math.round(micLevel * 20 + 4)));
          const v2 = Math.max(4, Math.min(24, Math.round(micLevel * 24 + 4)));
          const v3 = Math.max(4, Math.min(24, Math.round(micLevel * 18 + 4)));
          const v4 = Math.max(4, Math.min(24, Math.round(micLevel * 22 + 4)));
          if (b1Ref.current) b1Ref.current.style.height = `${v1}px`;
          if (b2Ref.current) b2Ref.current.style.height = `${v2}px`;
          if (b3Ref.current) b3Ref.current.style.height = `${v3}px`;
          if (b4Ref.current) b4Ref.current.style.height = `${v4}px`;
        } else {
          if (b1Ref.current) b1Ref.current.style.height = "4px";
          if (b2Ref.current) b2Ref.current.style.height = "4px";
          if (b3Ref.current) b3Ref.current.style.height = "4px";
          if (b4Ref.current) b4Ref.current.style.height = "4px";
        }
      }
      animFrameRef.current = requestAnimationFrame(updateFrequencies);
    };

    animFrameRef.current = requestAnimationFrame(updateFrequencies);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [getFrequencyData, micLevel]);

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => {
      setCopiedIndex(null);
    }, 1500);
  };

  const hasContent = (turns && turns.length > 0) || (currentTurn && (currentTurn.user || currentTurn.model || currentTurn.toolAction)) || state === "thinking";
  if (!hasContent) {
    return null;
  }

  return (
    <div className="gemini-response-card">
      <div className="gemini-feed-scroll" ref={scrollRef}>
        {turns.map((turn) => (
          <div key={turn.id} className="gemini-turn-group">
            {turn.toolAction && (
              <div className="turn-tool-row">
                <span className="turn-tool-chip">{turn.toolAction}</span>
              </div>
            )}

            {turn.user && (
              <div className="gemini-turn-row user">
                <div className="user-query-bubble">
                  <span className="query-text">{turn.user}</span>
                </div>
              </div>
            )}

            {turn.model && (
              <div className="gemini-turn-row model">
                <div className="model-response-block">
                  <div className="model-text-content">{turn.model}</div>
                  <div className="turn-action-strip">
                    <button
                      type="button"
                      className="gemini-action-btn"
                      onClick={() => handleCopy(turn.model, turn.id)}
                      title="Copy text"
                    >
                      {copiedIndex === turn.id ? (
                        <Check className="icon-xs success" />
                      ) : (
                        <Copy className="icon-xs" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {currentTurn && (currentTurn.user || currentTurn.model || currentTurn.toolAction) && (
          <div className="gemini-turn-group live">
            {currentTurn.toolAction && (
              <div className="turn-tool-row">
                <span className="turn-tool-chip">{currentTurn.toolAction}</span>
              </div>
            )}

            {currentTurn.user && (
              <div className="gemini-turn-row user">
                <div className={"user-query-bubble " + (currentTurn.isUserSpeaking ? "active-live" : "")}>
                  {currentTurn.isUserSpeaking && <span className="live-mic-dot"></span>}
                  <span className="query-text">{currentTurn.user}</span>
                </div>
              </div>
            )}

            {currentTurn.model && (
              <div className="gemini-turn-row model">
                <div className="model-response-block">
                  <div className="model-text-content streaming">
                    {currentTurn.model}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {state === "thinking" && !currentTurn.model && (
          <div className="gemini-turn-row model thinking">
            <div className="thinking-bubble">
              <Loader2 className="icon-thinking-spinner spin" />
              <span className="thinking-text">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      <div className="gemini-card-bottom-bar">
        <div className="gemini-voice-wave-strip">
          <span ref={b1Ref} className={"wave-bar w1 " + (state === "speaking" || state === "thinking" || micLevel > 0.04 ? "active" : "")}></span>
          <span ref={b2Ref} className={"wave-bar w2 " + (state === "speaking" || state === "thinking" || micLevel > 0.04 ? "active" : "")}></span>
          <span ref={b3Ref} className={"wave-bar w3 " + (state === "speaking" || state === "thinking" || micLevel > 0.04 ? "active" : "")}></span>
          <span ref={b4Ref} className={"wave-bar w4 " + (state === "speaking" || state === "thinking" || micLevel > 0.04 ? "active" : "")}></span>
        </div>

        {state === "speaking" && (
          <button
            type="button"
            className="gemini-stop-btn"
            onClick={onInterrupt}
            title="Stop playback"
          >
            <Square className="icon-xs" />
            <span>Stop</span>
          </button>
        )}
      </div>
    </div>
  );
}
