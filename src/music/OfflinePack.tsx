import { useEffect, useRef, useState, type MouseEvent } from "react";
import { OFFLINE_TRACKS } from "./offlineTracks";
import { attachFileElement, setPlaying as setBeatPlaying } from "../shared/beat";
import "./offline-pack.css";

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

interface OfflinePackProps {
  volume: number;
  ytPlaying: boolean;
  /** Increment to pause from outside (e.g. YouTube started). */
  pauseSignal: number;
  onPlayingChange: (playing: boolean) => void;
}

export function OfflinePack({ volume, ytPlaying, pauseSignal, onPlayingChange }: OfflinePackProps) {
  const [trackIdx, setTrackIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const ytRef = useRef(ytPlaying);
  ytRef.current = ytPlaying;
  const cbRef = useRef(onPlayingChange);
  cbRef.current = onPlayingChange;

  const track = OFFLINE_TRACKS[trackIdx]!;

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, volume / 100));
    }
  }, [volume]);

  useEffect(() => {
    audioRef.current?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pauseSignal]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => {
      if (!detachRef.current) {
        try {
          detachRef.current = attachFileElement(el);
        } catch {
          /* already attached */
        }
      }
      setBeatPlaying(true);
      setPlaying(true);
      cbRef.current(true);
    };
    const onStop = () => {
      setBeatPlaying(ytRef.current);
      setPlaying(false);
      cbRef.current(false);
    };
    const onTime = () => setPos(el.currentTime);
    const onMeta = () => setDur(el.duration || 0);
    const onEnd = () => {
      const next = (Number(el.dataset.idx || 0) + 1) % OFFLINE_TRACKS.length;
      setTrackIdx(next);
      window.setTimeout(() => {
        const a = audioRef.current;
        if (a) {
          a.src = OFFLINE_TRACKS[next]!.src;
          a.dataset.idx = String(next);
          a.play().catch(() => {});
        }
      }, 80);
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onStop);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onStop);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnd);
      detachRef.current?.();
      detachRef.current = null;
    };
  }, []);

  const playIdx = (i: number) => {
    const el = audioRef.current;
    const next = (i + OFFLINE_TRACKS.length) % OFFLINE_TRACKS.length;
    setTrackIdx(next);
    if (!el) return;
    el.src = OFFLINE_TRACKS[next]!.src;
    el.dataset.idx = String(next);
    el.play().catch(() => {});
  };

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  const seek = (event: MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    el.currentTime = ((event.clientX - rect.left) / rect.width) * el.duration;
  };

  return (
    <div className="offline-pack">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={track.src} data-idx={trackIdx} preload="auto" />
      <div className="offline-tracks">
        {OFFLINE_TRACKS.map((t, i) => (
          <button
            key={t.id}
            className={`beat-pill beat-pill-btn ${i === trackIdx ? "is-active" : ""}`}
            onClick={() => playIdx(i)}
          >
            {t.title}
          </button>
        ))}
      </div>
      <div className="progress-wrap">
        <span className="time">{fmt(pos)}</span>
        <div className="bar-bg" onClick={seek}>
          <div className="bar-fill" style={{ width: `${dur ? (pos / dur) * 100 : 0}%` }} />
        </div>
        <span className="time">{fmt(dur)}</span>
      </div>
      <div className="offline-transport">
        <button className="btn" onClick={() => playIdx(trackIdx - 1)} aria-label="Previous offline track">
          ⏮
        </button>
        <button className="btn btn-main btn-offline" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "⏸" : "▶"}
        </button>
        <button className="btn" onClick={() => playIdx(trackIdx + 1)} aria-label="Next offline track">
          ⏭
        </button>
      </div>
      <p className="beat-hint">📦 BeatFluid Originals · plays fully offline · drives the TRUE beat engine</p>
    </div>
  );
}

export default OfflinePack;
