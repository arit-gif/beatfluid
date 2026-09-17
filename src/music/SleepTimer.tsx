import { useEffect, useRef, useState } from "react";
import { setPetSleepHint } from "../shared/pet";

interface SleepTimerProps {
  volume: number;
  applyVolume: (v: number) => void;
  pause: () => void;
  notify: (msg: string) => void;
}

const OPTIONS = [10, 20, 30, 45, 60];
const FADE_SECONDS = 30;

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function SleepTimer({ volume, applyVolume, pause, notify }: SleepTimerProps) {
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const origVol = useRef(80);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const live = useRef({ applyVolume, pause, notify });
  live.current = { applyVolume, pause, notify };

  useEffect(() => {
    if (total <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          window.clearInterval(timer);
          live.current.pause();
          live.current.applyVolume(origVol.current);
          setTotal(0);
          live.current.notify("😴 Good night! Player paused.");
          return 0;
        }
        // Gentle fade over the last N seconds.
        if (next <= FADE_SECONDS) {
          live.current.applyVolume(
            Math.max(0, Math.round((origVol.current * next) / FADE_SECONDS))
          );
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [total]);

  const start = (minutes: number) => {
    origVol.current = volumeRef.current;
    setTotal(minutes * 60);
    setRemaining(minutes * 60);
    setOpen(false);
    notify(`😴 Sleep in ${minutes} min — sweet dreams!`);
  };

  const cancel = () => {
    setTotal(0);
    setRemaining(0);
    live.current.applyVolume(origVol.current);
  };

  const active = total > 0 && remaining > 0;
  const dim = active ? Math.min(0.5, (1 - remaining / total) * 0.5) : 0;

  // 🐾 Pet gets drowsy while the sleep timer runs.
  useEffect(() => {
    setPetSleepHint(active);
    return () => setPetSleepHint(false);
  }, [active]);

  return (
    <>
      {/* Fullscreen dim that deepens as bedtime approaches. Below the UI. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 5,
          background: "#000",
          opacity: dim,
          pointerEvents: "none",
          transition: "opacity 3s ease",
        }}
      />
      {active ? (
        <button
          className="beat-pill beat-pill-btn is-active"
          onClick={cancel}
          title="Cancel sleep timer"
        >
          😴 {formatCountdown(remaining)} ✕
        </button>
      ) : (
        <div style={{ position: "relative" }}>
          <button
            className="beat-pill beat-pill-btn"
            onClick={() => setOpen((v) => !v)}
            title="Stop the music after a while (with fade-out)"
          >
            😴 Sleep
          </button>
          {open && (
            <div className="sleep-pop">
              {OPTIONS.map((m) => (
                <button key={m} onClick={() => start(m)}>
                  {m}m
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default SleepTimer;
