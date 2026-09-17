import { useEffect, useState } from "react";
import { KEY_CODES, KEY_CSS, KEY_LABELS, playPianoKey } from "../shared/piano";
import "./piano-pads.css";

export function PianoPads() {
  const [enabled, setEnabled] = useState(true);
  const [flash, setFlash] = useState(-1);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return; // don't steal typing in search / add-form fields
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const idx = KEY_CODES.indexOf(event.key.toLowerCase());
      if (idx === -1) return;
      playPianoKey(idx);
      setFlash(idx);
      window.setTimeout(() => setFlash((f) => (f === idx ? -1 : f)), 160);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  const tap = (i: number) => {
    if (!enabled) return;
    playPianoKey(i);
    setFlash(i);
    window.setTimeout(() => setFlash((f) => (f === i ? -1 : f)), 160);
  };

  return (
    <div className="piano-wrap">
      <div className="beat-row beat-modes">
        <span className="beat-sens-label">🎹 Piano</span>
        <button
          className={`beat-pill beat-pill-btn ${enabled ? "is-active" : ""}`}
          onClick={() => setEnabled((v) => !v)}
          title="Turn keyboard keys A–K on/off"
        >
          {enabled ? "Keys A–K on" : "Keys off"}
        </button>
      </div>
      <div className="piano-pads">
        {KEY_LABELS.map((note, i) => (
          <button
            key={`${note}-${i}`}
            className={`piano-pad ${flash === i ? "hit" : ""}`}
            style={{
              background: `linear-gradient(135deg, ${KEY_CSS[i]}66, ${KEY_CSS[i]}22)`,
              borderColor: KEY_CSS[i],
            }}
            onPointerDown={() => tap(i)}
            aria-label={`Piano note ${note}`}
          >
            <span className="piano-note">{note}</span>
            <span className="piano-key">{KEY_CODES[i]!.toUpperCase()}</span>
          </button>
        ))}
      </div>
      <p className="beat-hint">Tap the pads or press A–K — every key splashes its colour.</p>
    </div>
  );
}

export default PianoPads;
