import { useEffect, useMemo, useRef, useState } from "react";
import { fetchLyrics, saveCustomLrc, type LyricLine } from "../shared/lyrics";
import "./karaoke.css";

interface KaraokeProps {
  videoId: string;
  title: string;
  artist: string;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  onClose: () => void;
}

type Status = "loading" | "synced" | "plain" | "none";
type FontSize = "s" | "m" | "l";

const OFFSET_KEY = "fluid-lyrics:offset";

function loadOffset(): number {
  try {
    const v = Number(window.localStorage.getItem(OFFSET_KEY));
    return Number.isFinite(v) ? Math.min(5, Math.max(-5, v)) : 0;
  } catch {
    return 0;
  }
}

export function Karaoke({
  videoId,
  title,
  artist,
  currentTime,
  duration,
  onSeek,
  onClose,
}: KaraokeProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [plain, setPlain] = useState("");
  const [source, setSource] = useState("");
  const [offset, setOffset] = useState(loadOffset);
  const [fontSize, setFontSize] = useState<FontSize>("m");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [retryTick, setRetryTick] = useState(0);
  const activeRef = useRef<HTMLButtonElement>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setStatus("loading");
    setLines([]);
    setPlain("");
    setSource("");
    setPasteOpen(false);
    setPasteText("");
    setPasteError("");
    if (!videoId) {
      setStatus("none");
      return;
    }
    void fetchLyrics({ videoId, title, artist, duration }).then((res) => {
      if (id !== reqId.current) return;
      if (res.kind === "synced") {
        setLines(res.lines);
        setSource(res.source);
        setStatus("synced");
      } else if (res.kind === "plain") {
        setPlain(res.text);
        setSource(res.source);
        setStatus("plain");
      } else {
        setStatus("none");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, title, artist, duration, retryTick]);

  const activeIdx = useMemo(() => {
    const t = currentTime + offset;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.time <= t) idx = i;
      else break;
    }
    return idx;
  }, [lines, currentTime, offset]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIdx, status]);

  const changeOffset = (delta: number) => {
    setOffset((o) => {
      const next = Math.min(5, Math.max(-5, Math.round((o + delta) * 2) / 2));
      try {
        window.localStorage.setItem(OFFSET_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const savePaste = () => {
    const parsed = saveCustomLrc(videoId, pasteText);
    if (!parsed) {
      setPasteError("Couldn't find timestamped lines — paste LRC with [mm:ss] tags.");
      return;
    }
    setLines(parsed);
    setSource("your paste ✍️");
    setStatus("synced");
    setPasteOpen(false);
    setPasteText("");
    setPasteError("");
  };

  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `${title} ${artist} lyrics`
  )}`;

  return (
    <div className="karaoke-overlay" onPointerDown={onClose}>
      <div className="panel karaoke-card" onPointerDown={(e) => e.stopPropagation()}>
        <div className="karaoke-head">
          <span className="karaoke-title" title={title}>
            🎤 {title || "Karaoke"}
          </span>
          <button className="karaoke-x" onClick={onClose} aria-label="Close karaoke">
            ✕
          </button>
        </div>

        <div className="karaoke-tools">
          {source && <span className="badge">{source}</span>}
          <div className="karaoke-sync">
            <span title="Nudge lyrics if they're early/late">Sync</span>
            <button onClick={() => changeOffset(-0.5)} aria-label="Lyrics earlier">
              −
            </button>
            <span className="karaoke-offset">
              {offset > 0 ? "+" : ""}
              {offset}s
            </span>
            <button onClick={() => changeOffset(0.5)} aria-label="Lyrics later">
              +
            </button>
          </div>
          <div className="karaoke-sync">
            {(["s", "m", "l"] as FontSize[]).map((s) => (
              <button
                key={s}
                className={fontSize === s ? "is-on" : ""}
                onClick={() => setFontSize(s)}
                aria-label={`Font size ${s}`}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {status === "loading" && (
          <p className="karaoke-msg">
            <span className="karaoke-spinner" /> Searching free lyrics…
          </p>
        )}

        {status === "synced" && (
          <div className={`karaoke-lines kfs-${fontSize}`}>
            {lines.map((line, i) => (
              <button
                key={`${line.time}-${i}`}
                ref={i === activeIdx ? activeRef : undefined}
                className={`k-line ${i === activeIdx ? "is-active" : ""} ${
                  i < activeIdx ? "is-past" : ""
                }`}
                onClick={() => onSeek(Math.max(0, line.time - 0.2))}
                title="Jump here"
              >
                {line.text}
              </button>
            ))}
          </div>
        )}

        {status === "plain" && (
          <>
            <p className="beat-hint">No timestamps for this one — enjoy the words 📜</p>
            <div className={`karaoke-plain kfs-${fontSize}`}>{plain}</div>
          </>
        )}

        {status === "none" && (
          <div className="karaoke-none">
            {!videoId ? (
              <p className="karaoke-msg">Play something first, then sing along! 🎶</p>
            ) : (
              <>
                <p className="karaoke-msg">
                  No free lyrics found for this track 😕
                  <br />
                  (Jukeboxes & mashups rarely have any — single songs work best!)
                </p>
                <div className="karaoke-none-btns">
                  <button
                    className="playlist-add-confirm"
                    onClick={() => setRetryTick((t) => t + 1)}
                  >
                    🔁 Retry
                  </button>
                  <button
                    className="playlist-add-cancel"
                    onClick={() => setPasteOpen((v) => !v)}
                  >
                    ✍️ Paste LRC
                  </button>
                  <a className="track-error-link" href={googleUrl} target="_blank" rel="noreferrer">
                    Find on Google ↗
                  </a>
                </div>
                {pasteOpen && (
                  <div className="karaoke-paste">
                    <textarea
                      placeholder={"Paste synced lyrics, e.g.\n[00:09.44] मुझको इतना बताए कोई\n[00:19.02] कैसे तुझसे…"}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      rows={5}
                    />
                    {pasteError && <p className="playlist-add-error">{pasteError}</p>}
                    <div className="playlist-add-actions-right">
                      <button className="playlist-add-confirm" onClick={savePaste}>
                        Save for this song
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <p className="beat-hint karaoke-credit">
          Free lyrics via LRCLIB · tap any line to jump there
        </p>
      </div>
    </div>
  );
}

export default Karaoke;
