import { useEffect, useRef, useState } from "react";
import {
  attachFileElement,
  getBeatSource,
  getBpm,
  getFrequencyData,
  setBpm,
  setPlaying as setBeatPlaying,
  setSensitivity,
  startMicMode,
  stopMicMode,
  subscribeBeat,
  tapTempo,
  type BeatSnapshot,
  type BeatSource,
} from "../shared/beat";
import "./beat-controls.css";

const BPM_STORE_KEY = "fluid-beat:bpm-by-playlist";

export function loadSavedBpm(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(BPM_STORE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, number>;
    const value = map[key];
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

function saveBpm(key: string, bpm: number): void {
  try {
    const raw = window.localStorage.getItem(BPM_STORE_KEY);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, number>;
    map[key] = bpm;
    window.localStorage.setItem(BPM_STORE_KEY, JSON.stringify(map));
  } catch {
    /* private mode — session still works */
  }
}

interface BeatControlsProps {
  /** e.g. active playlist label — BPM is remembered per key. */
  playlistKey: string;
  /** YouTube playing state, so file-mode can hand control back correctly. */
  ytPlaying: boolean;
  /** Playlist default tempo, used until the user taps their own. */
  defaultBpm?: number;
}

export function BeatControls({ playlistKey, ytPlaying, defaultBpm = 96 }: BeatControlsProps) {
  const [snap, setSnap] = useState<BeatSnapshot>({ pulse: 0, bass: 0, source: "bpm", bpm: 96, kicked: false });
  const [bpmUi, setBpmUi] = useState<number>(() => getBpm());
  const [taps, setTaps] = useState(0);
  const [micError, setMicError] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [fileName, setFileName] = useState("");
  const [filePlaying, setFilePlaying] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const barsRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const ytPlayingRef = useRef(ytPlaying);
  ytPlayingRef.current = ytPlaying;

  // Live beat snapshot (~15fps) for the dot + source pill.
  useEffect(() => subscribeBeat(setSnap), []);

  // External tempo changes (festival packs) flow back into the slider.
  useEffect(() => {
    setBpmUi(snap.bpm);
  }, [snap.bpm]);

  // Per-playlist BPM memory.
  useEffect(() => {
    const saved = loadSavedBpm(playlistKey);
    const next = saved ?? defaultBpm;
    setBpm(next);
    setBpmUi(next);
  }, [playlistKey, defaultBpm]);

  // Mini spectrum bars.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = barsRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const freq = getFrequencyData();
      const bars = 24;
      const gap = 2;
      const bw = (W - gap * (bars - 1)) / bars;
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#f3a6b2";
      for (let i = 0; i < bars; i++) {
        let v: number;
        if (freq && (getBeatSource() === "mic" || getBeatSource() === "file")) {
          const idx = 1 + Math.floor((i / bars) * 40);
          v = (freq[Math.min(idx, freq.length - 1)] ?? 0) / 255;
        } else {
          // Fake-but-pretty bars driven by the BPM pulse when no analyser.
          v = snap.pulse * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.7 + performance.now() / 300)));
        }
        const h = Math.max(2, v * H);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.35 + 0.65 * v;
        const x = i * (bw + gap);
        ctx.beginPath();
        ctx.roundRect(x, H - h, bw, h, 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [snap.pulse]);

  // Cleanup file mode on unmount.
  useEffect(() => {
    return () => {
      detachRef.current?.();
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeBpm = (next: number) => {
    setBpm(next);
    setBpmUi(getBpm());
    saveBpm(playlistKey, getBpm());
  };

  const handleTap = () => {
    const next = tapTempo();
    setBpmUi(next);
    saveBpm(playlistKey, next);
    setTaps((t) => t + 1);
    window.setTimeout(() => setTaps((t) => Math.max(0, t - 1)), 2000);
  };

  const toggleMic = async () => {
    setMicError("");
    if (micOn) {
      stopMicMode();
      setMicOn(false);
      return;
    }
    try {
      await startMicMode();
      setMicOn(true);
    } catch {
      setMicError("Mic blocked — allow microphone access, then try again.");
    }
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    detachRef.current?.();
    detachRef.current = null;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    setFileName(file.name.replace(/\.[^.]+$/, ""));
    setFilePlaying(false);
    // Hand beat control to the file as soon as it plays (see toggleFile).
  };

  const toggleFile = async () => {
    const el = audioRef.current;
    if (!el || !fileUrl) return;
    if (filePlaying) {
      el.pause();
      setFilePlaying(false);
      detachRef.current?.();
      detachRef.current = null;
      setBeatPlaying(ytPlayingRef.current); // hand control back to YouTube state
    } else {
      try {
        detachRef.current?.();
        detachRef.current = attachFileElement(el);
        await el.play();
        setFilePlaying(true);
        setBeatPlaying(true);
      } catch {
        setMicError("Couldn't play that file — try an MP3.");
      }
    }
  };

  const source: BeatSource = micOn ? "mic" : filePlaying ? "file" : "bpm";

  return (
    <div className="beat-controls">
      {/* hidden audio element for local-file mode */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={fileUrl ?? undefined}
        onEnded={() => {
          setFilePlaying(false);
          setBeatPlaying(ytPlayingRef.current);
        }}
      />

      <div className="beat-row">
        <span
          className="beat-dot"
          style={{ transform: `scale(${1 + snap.pulse * 0.9})`, opacity: 0.45 + snap.pulse * 0.55 }}
          aria-hidden
        />
        <div className="beat-bpm">
          <span className="beat-bpm-value">{bpmUi}</span>
          <span className="beat-bpm-unit">BPM</span>
        </div>
        <input
          type="range"
          className="beat-slider"
          min={50}
          max={200}
          value={bpmUi}
          onChange={(e) => changeBpm(Number(e.target.value))}
          aria-label="Tempo in beats per minute"
        />
        <button className="beat-tap" onClick={handleTap} title="Tap in time with the song to match its tempo">
          TAP{taps > 0 ? ` ${taps}` : ""}
        </button>
      </div>

      <canvas ref={barsRef} className="beat-bars" width={360} height={40} aria-hidden />

      <div className="beat-row beat-modes">
        <span className={`beat-pill ${source === "bpm" ? "is-active" : ""}`} title="Fluid pulses on the BPM clock — no permission needed">
          🕒 Clock
        </span>
        <button
          className={`beat-pill beat-pill-btn ${micOn ? "is-active" : ""}`}
          onClick={toggleMic}
          title="Listen to your speakers with the mic — the fluid reacts to the REAL beat"
        >
          {micOn ? "🎙 Listening…" : "🎙 Mic beat"}
        </button>
        <label
          className={`beat-pill beat-pill-btn ${filePlaying ? "is-active" : ""}`}
          title="Play a local MP3 for sample-accurate beat tracking (pause YouTube first)"
        >
          📁 {fileName || "Local MP3"}
          <input
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </label>
        {fileUrl && (
          <button className="beat-pill beat-pill-btn" onClick={toggleFile}>
            {filePlaying ? "⏸ File" : "▶ File"}
          </button>
        )}
      </div>

      {(micOn || filePlaying) && (
        <div className="beat-row">
          <span className="beat-sens-label">Sensitivity</span>
          <input
            type="range"
            className="beat-slider"
            min={0.4}
            max={2}
            step={0.1}
            defaultValue={1}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            aria-label="Kick detection sensitivity"
          />
        </div>
      )}

      {micError && <p className="playlist-add-error">{micError}</p>}
      {!micOn && !filePlaying && (
        <p className="beat-hint">
          Tip: match the BPM (or TAP it), then hit <b>🎙 Mic beat</b> for the real kick.
        </p>
      )}
      {filePlaying && (
        <p className="beat-hint">Pause the YouTube track above while the local file plays.</p>
      )}
    </div>
  );
}

export default BeatControls;
