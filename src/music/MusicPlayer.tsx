import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { useYouTubePlayer } from "./useYouTubePlayer";
import {
  DEFAULT_PLAYLISTS,
  loadPlaylists,
  savePlaylists,
  sourceWatchUrl,
  THEME_PALETTE,
  type PlaylistOption,
  type PlaylistSource,
} from "./playlists";
import { parseYoutubeUrl } from "./parseYoutubeUrl";
import { getTheme, setTheme } from "../shared/theme";
import { setBpm } from "../shared/beat";
import { BeatControls, loadSavedBpm } from "./BeatControls";
import { SearchPanel } from "./SearchPanel";
import { SleepTimer } from "./SleepTimer";
import { Karaoke } from "./Karaoke";
import { OfflinePack } from "./OfflinePack";
import { onLocalPlayRequest, setLocalPlayback } from "../shared/room";
import { petOnTrack, setPetMusicPlaying } from "../shared/pet";
import { LIKED_LABEL, isLiked, loadLikes, toggleLikeTrack, type LikedTrack } from "../shared/likes";
import { clearHistory, loadHistory, pushHistory } from "../shared/history";
import { useVoiceControl } from "../shared/voice";
import { isPipSupported, openMiniPip } from "../shared/pip";
import "./music-player.css";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

const VOL_KEY = "fluid-music:volume";

function loadVolume(): number {
  try {
    const v = Number(window.localStorage.getItem(VOL_KEY));
    return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 80;
  } catch {
    return 80;
  }
}

interface MusicPlayerProps {
  onClose: () => void;
  /** True while a festival pack or day/night auto owns the theme (from Fun Zone). */
  visualOverride: boolean;
  /** Together-room role (null = not in a room). */
  roomRole: "host" | "guest" | null;
  /** Guests follow this; null for hosts and solo listeners. */
  roomFollow: {
    hostName: string;
    source: PlaylistSource;
    playing: boolean;
    position: number;
    stamp: number;
    votes: number;
    total: number;
  } | null;
  onVoteSkip: () => void;
}

export function MusicPlayer({ onClose, visualOverride, roomRole, roomFollow, onVoteSkip }: MusicPlayerProps) {
  const [playlists, setPlaylists] = useState<PlaylistOption[]>(() => loadPlaylists());
  const [activeIndex, setActiveIndex] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [addError, setAddError] = useState("");

  const [volume, setVolume] = useState(loadVolume);
  const [liked, setLiked] = useState<LikedTrack[]>(loadLikes);
  const [, setHistoryTick] = useState(0);
  const [extrasOpen, setExtrasOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [pipOpen, setPipOpen] = useState(false);
  const [karaokeOpen, setKaraokeOpen] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [offlinePlaying, setOfflinePlaying] = useState(false);
  const [offlinePauseSignal, setOfflinePauseSignal] = useState(0);

  const progressRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const toastTimer = useRef(0);
  const lastHistVideo = useRef("");
  const pipCloseRef = useRef<(() => void) | null>(null);

  const active = playlists[activeIndex] ?? playlists[0]!;

  const player = useYouTubePlayer({
    // Room guests don't play their own tabs — they mirror the host.
    source: roomFollow ? roomFollow.source : active.source,
    elementId: "yt-player",
  });

  const notify = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  };

  const applyVolume = (v: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(v)));
    setVolume(clamped);
    try {
      window.localStorage.setItem(VOL_KEY, String(clamped));
    } catch {
      /* ignore */
    }
    player.setVolume(clamped);
  };

  // Re-apply stored volume whenever a fresh YouTube player spins up.
  useEffect(() => {
    if (player.ready) player.setVolume(volume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.ready]);

  // Playlist theme — unless the Fun Zone (festival / day-night) owns visuals.
  useEffect(() => {
    if (!visualOverride) {
      setTheme(active.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, playlists, visualOverride]);

  // When a festival override turns off, hand the tempo back to this tab.
  useEffect(() => {
    if (!visualOverride) {
      setBpm(loadSavedBpm(active.label) ?? active.bpm ?? 96);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualOverride]);

  // Keep the auto "❤️ Liked" tab in sync with the liked list.
  useEffect(() => {
    const ids = liked.map((t) => t.videoId);
    const idx = playlists.findIndex((p) => p.label === LIKED_LABEL);
    if (ids.length === 0) {
      if (idx === -1) return;
      const next = playlists.filter((_, i) => i !== idx);
      setPlaylists(next);
      savePlaylists(next);
      setActiveIndex((cur) => {
        if (idx === cur) return 0;
        if (idx < cur) return cur - 1;
        return cur;
      });
      return;
    }
    const entry: PlaylistOption = {
      label: LIKED_LABEL,
      source: { type: "videoList", ids },
      theme: THEME_PALETTE[5]!,
      bpm: 100,
    };
    if (idx === -1) {
      const next = [...playlists, entry];
      setPlaylists(next);
      savePlaylists(next);
      return;
    }
    const prev = playlists[idx]!;
    const prevIds = prev.source.type === "videoList" ? prev.source.ids : [];
    if (JSON.stringify(prevIds) === JSON.stringify(ids)) return;
    const next = playlists.map((p, i) => (i === idx ? entry : p));
    setPlaylists(next);
    savePlaylists(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liked]);

  // Recently-played history (updates as the real track changes).
  useEffect(() => {
    if (
      player.videoId &&
      player.title !== "Loading…" &&
      player.videoId !== lastHistVideo.current
    ) {
      lastHistVideo.current = player.videoId;
      pushHistory({
        videoId: player.videoId,
        title: player.title,
        author: player.artist,
      });
      setHistoryTick((t) => t + 1);
      petOnTrack(); // 🐾 the pet reacts to new songs!
    }
  }, [player.videoId, player.title, player.artist]);

  // Close the pop-out window if the player unmounts.
  useEffect(
    () => () => {
      pipCloseRef.current?.();
      pipCloseRef.current = null;
    },
    []
  );

  const handleSeek = (event: MouseEvent<HTMLDivElement>) => {
    const el = progressRef.current;
    if (!el || !player.duration || roomFollow) return;
    const rect = el.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    player.seekTo(percent * player.duration);
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragOffset.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDrag = (event: PointerEvent<HTMLDivElement>) => {
    const offset = dragOffset.current;
    const card = cardRef.current;
    if (!offset || !card) return;
    const maxX = Math.max(0, window.innerWidth - card.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - card.offsetHeight);
    setPosition({
      x: Math.min(Math.max(0, event.clientX - offset.x), maxX),
      y: Math.min(Math.max(0, event.clientY - offset.y), maxY),
    });
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragOffset.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleAdd = () => {
    const source = parseYoutubeUrl(newUrl);
    if (!source) {
      setAddError("Couldn't read that link — paste a playlist, video, or live URL.");
      return;
    }
    const label = newLabel.trim() || `Playlist ${playlists.length + 1}`;
    const theme = THEME_PALETTE[playlists.length % THEME_PALETTE.length]!;
    const next = [...playlists, { label, source, theme }];
    setPlaylists(next);
    savePlaylists(next);
    setActiveIndex(next.length - 1);
    setNewLabel("");
    setNewUrl("");
    setAddError("");
    setAddOpen(false);
  };

  const handleRemove = (index: number, event: MouseEvent) => {
    event.stopPropagation();
    if (playlists.length <= 1) return;
    const next = playlists.filter((_, i) => i !== index);
    setPlaylists(next);
    savePlaylists(next);
    setActiveIndex((current) => {
      if (index === current) return 0;
      if (index < current) return current - 1;
      return current;
    });
  };

  const handleResetDefaults = () => {
    setPlaylists(DEFAULT_PLAYLISTS);
    savePlaylists(DEFAULT_PLAYLISTS);
    setActiveIndex(0);
  };

  /** Play one video (from search / history) in a reusable "▶" tab. */
  const playSingleVideo = (videoId: string, title: string) => {
    const entry: PlaylistOption = {
      label: `▶ ${title}`.slice(0, 24),
      source: { type: "video", id: videoId },
      theme: THEME_PALETTE[playlists.length % THEME_PALETTE.length]!,
      bpm: 100,
    };
    const idx = playlists.findIndex((p) => p.label.startsWith("▶ "));
    if (idx === -1) {
      const next = [...playlists, entry];
      setPlaylists(next);
      savePlaylists(next);
      setActiveIndex(next.length - 1);
    } else {
      if (idx === activeIndex) {
        player.play();
      }
      const next = playlists.map((p, i) => (i === idx ? entry : p));
      setPlaylists(next);
      savePlaylists(next);
      setActiveIndex(idx);
    }
    setSearchOpen(false);
    notify("▶ Playing now!");
  };

  const toggleLike = () => {
    if (!player.videoId || player.title === "Loading…") {
      notify("Play something first, then ❤️ it!");
      return;
    }
    const next = toggleLikeTrack(player.videoId, player.title, player.artist);
    setLiked(next);
    notify(isLiked(next, player.videoId) ? "❤️ Liked! (see ❤️ tab)" : "🤍 Unliked");
  };

  const shareTrack = async () => {
    const theme = getTheme();
    const url = player.videoId
      ? `https://youtu.be/${player.videoId}`
      : sourceWatchUrl(active.source);
    const text =
      `🎵 ${player.title} — ${player.artist}\n▶ ${url}\n` +
      `🎨 My fluid theme: ${theme.accent} ${theme.dyeA} ${theme.dyeB}`;
    try {
      await navigator.clipboard.writeText(text);
      notify("🔗 Copied! Paste it in WhatsApp 💬");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        notify("🔗 Copied!");
      } catch {
        notify("Copy failed on this browser 😕");
      }
      document.body.removeChild(ta);
    }
  };

  const voice = useVoiceControl({
    toggle: player.toggle,
    next: player.next,
    previous: player.previous,
    shuffle: player.shuffle,
    like: toggleLike,
    minimize: () => setMinimized(true),
    expand: () => setMinimized(false),
  });

  // Stable refs so the pop-out window always reads fresh values.
  const pipState = useRef({ title: "", artist: "", isPlaying: false, progress: 0 });
  const pipActions = useRef({ toggle: player.toggle, next: player.next, previous: player.previous });
  pipActions.current = { toggle: player.toggle, next: player.next, previous: player.previous };

  const togglePip = async () => {
    if (pipCloseRef.current) {
      pipCloseRef.current();
      pipCloseRef.current = null;
      setPipOpen(false);
      return;
    }
    try {
      pipCloseRef.current = await openMiniPip({
        getState: () => ({
          ...pipState.current,
          accent:
            getComputedStyle(document.documentElement)
              .getPropertyValue("--accent")
              .trim() || "#f3a6b2",
        }),
        onToggle: () => pipActions.current.toggle(),
        onNext: () => pipActions.current.next(),
        onPrev: () => pipActions.current.previous(),
        onClose: () => {
          pipCloseRef.current = null;
          setPipOpen(false);
        },
      });
      setPipOpen(true);
    } catch {
      notify("Pop-out blocked on this browser 😕");
    }
  };

  // ---- 📦 Offline originals vs YouTube: only one plays at a time ----
  const handleOfflinePlaying = (playing: boolean) => {
    setOfflinePlaying(playing);
    if (playing) player.pause();
  };

  useEffect(() => {
    if (player.isPlaying && offlinePlaying) {
      setOfflinePauseSignal((s) => s + 1);
    }
  }, [player.isPlaying, offlinePlaying]);

  // ---- 👯 Room: guests mirror the host (position + transport) ----
  useEffect(() => {
    if (!roomFollow || !player.ready || offlinePlaying) return;
    const target = roomFollow.playing
      ? roomFollow.position + (Date.now() - roomFollow.stamp) / 1000
      : roomFollow.position;
    if (player.duration && Math.abs(player.currentTime - target) > 2.5) {
      player.seekTo(Math.max(0, target));
    }
    if (roomFollow.playing && !player.isPlaying) player.play();
    if (!roomFollow.playing && player.isPlaying) player.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomFollow, player.ready, player.isPlaying, player.currentTime, player.duration, offlinePlaying]);

  // ---- 👯 Room: host reports local playback for broadcast ----
  useEffect(() => {
    if (roomRole === "host") {
      setLocalPlayback({
        videoId: player.videoId,
        title: player.title,
        position: player.currentTime,
        playing: player.isPlaying,
      });
    }
  });

  // ---- 👯 Room: host plays queued tracks on request ----
  const playSingleRef = useRef(playSingleVideo);
  playSingleRef.current = playSingleVideo;
  useEffect(() => onLocalPlayRequest((vid, t) => playSingleRef.current(vid, t)), []);

  // ---- 🐾 Pet: counts listening minutes, dances while music plays ----
  useEffect(() => {
    setPetMusicPlaying(player.isPlaying || offlinePlaying);
  }, [player.isPlaying, offlinePlaying]);

  useEffect(() => () => setPetMusicPlaying(false), []);

  // ---- 🐾 Pet: counts listening minutes, dances while music plays ----
  useEffect(() => {
    setPetMusicPlaying(player.isPlaying || offlinePlaying);
  }, [player.isPlaying, offlinePlaying]);

  useEffect(() => () => setPetMusicPlaying(false), []);

  const progressPercent = player.duration
    ? (player.currentTime / player.duration) * 100
    : 0;

  pipState.current = {
    title: player.error ? "Can't play this" : player.title,
    artist: player.artist,
    isPlaying: player.isPlaying,
    progress: progressPercent,
  };

  const historyList = loadHistory();
  const likedNow = isLiked(liked, player.videoId);

  const cardStyle = position
    ? { left: position.x, top: position.y, bottom: "auto", right: "auto", transform: "none" }
    : undefined;

  // Minimized mini-bar: music keeps playing (same component stays mounted,
  // so the hidden YouTube iframe is untouched) — just the UI collapses.
  if (minimized) {
    return (
      <>
        <div id="yt-player-wrap">
          <div id="yt-player" />
        </div>

        <div className="panel music-mini">
          <button
            className="btn btn-mini-main"
            onClick={player.toggle}
            aria-label={player.isPlaying ? "Pause" : "Play"}
          >
            {player.isPlaying ? "⏸" : "▶"}
          </button>
          <div className="music-mini-meta" onClick={() => setMinimized(false)} title={player.title}>
            <span className="music-mini-title">
              {player.error ? "Can't play this" : player.title}
            </span>
            <div className="music-mini-progress">
              <div className="bar-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <button className="btn" onClick={player.next} aria-label="Next track">
            ⏭
          </button>
          <button className="btn" onClick={() => setMinimized(false)} aria-label="Expand player">
            ⤢
          </button>
          <button className="btn" onClick={onClose} aria-label="Close player">
            ✕
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* YouTube mounts an (invisible) iframe here — it's the actual audio engine. */}
      <div id="yt-player-wrap">
        <div id="yt-player" />
      </div>

      <div className="panel music-player-card" ref={cardRef} style={cardStyle}>
        <div
          className="drag-handle"
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="drag-dots" />
        </div>

        <button className="music-min" onClick={() => setMinimized(true)} aria-label="Minimize player">
          —
        </button>
        <button className="music-close" onClick={onClose} aria-label="Close player">
          ✕
        </button>

        <div className="playlist-tabs">
          {playlists.map((option, index) => (
            <div
              key={option.label}
              className={`playlist-tab-group ${index === activeIndex ? "is-active" : ""}`}
            >
              <button className="playlist-tab" onClick={() => setActiveIndex(index)}>
                {option.label}
              </button>
              {playlists.length > 1 && option.label !== LIKED_LABEL && (
                <button
                  className="playlist-tab-remove"
                  onClick={(e) => handleRemove(index, e)}
                  aria-label={`Remove ${option.label}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            className="playlist-tab playlist-tab-add"
            onClick={() => setAddOpen((v) => !v)}
            aria-label="Add playlist"
          >
            +
          </button>
        </div>

        {addOpen && (
          <div className="playlist-add-form">
            <input
              type="text"
              placeholder="Label (e.g. Punjabi)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <input
              type="text"
              placeholder="Paste a YouTube playlist / video / live link"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
            {addError && <p className="playlist-add-error">{addError}</p>}
            <div className="playlist-add-actions">
              <button
                className="playlist-add-reset"
                onClick={handleResetDefaults}
                title="Restore the original four playlists"
              >
                Reset to defaults
              </button>
              <div className="playlist-add-actions-right">
                <button
                  className="playlist-add-cancel"
                  onClick={() => {
                    setAddOpen(false);
                    setAddError("");
                  }}
                >
                  Cancel
                </button>
                <button className="playlist-add-confirm" onClick={handleAdd}>
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {player.error ? (
          <div className="track-info track-info-error">
            <div className="track-meta">
              <h2>Can't play this</h2>
              <p>{player.error}</p>
              <a
                className="track-error-link"
                href={sourceWatchUrl(active.source)}
                target="_blank"
                rel="noreferrer"
              >
                Open on YouTube instead ↗
              </a>
            </div>
            <button className="btn" onClick={player.next} aria-label="Skip to next">
              ⏭
            </button>
          </div>
        ) : (
          <div className="track-info">
            <div className="track-meta">
              <h2>{player.title}</h2>
              <p>{player.artist}</p>
            </div>
            {player.trackLabel && <div className="badge">{player.trackLabel}</div>}
          </div>
        )}

        <div className="progress-wrap">
          <span className="time">{formatTime(player.currentTime)}</span>
          <div className="bar-bg" ref={progressRef} onClick={handleSeek}>
            <div className="bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <span className="time">{formatTime(player.duration)}</span>
        </div>

        <BeatControls playlistKey={active.label} ytPlaying={player.isPlaying} defaultBpm={active.bpm} />

        {roomFollow ? (
          <div className="follow-bar">
            <span className="follow-label">👑 Following {roomFollow.hostName}</span>
            <button
              className="beat-pill beat-pill-btn"
              onClick={onVoteSkip}
              title="If most listeners vote, the song skips!"
            >
              ⏭ Skip ({roomFollow.votes}/{roomFollow.total})
            </button>
          </div>
        ) : (
          <div className="controls">
            <div className="vol-wrap">
              <input
                type="range"
                className="vol-slider"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => applyVolume(Number(e.target.value))}
                aria-label="Volume"
              />
            </div>
            <button className="btn" onClick={player.previous} aria-label="Previous track">
              ⏮
            </button>
            <button
              className="btn btn-main"
              onClick={player.toggle}
              aria-label={player.isPlaying ? "Pause" : "Play"}
            >
              {player.isPlaying ? "⏸" : "▶"}
            </button>
            <button className="btn" onClick={player.next} aria-label="Next track">
              ⏭
            </button>
            <button className="btn" onClick={player.shuffle} aria-label="Shuffle playlist">
              🔀
            </button>
          </div>
        )}

        {/* ✨ Extras — everything music-related that isn't transport */}
        <div className="extras">
          <button className="extras-toggle" onClick={() => setExtrasOpen((v) => !v)}>
            ✨ Extras {extrasOpen ? "▾" : "▸"}
          </button>

          {extrasOpen && (
            <>
              <div className="beat-row beat-modes">
                <button
                  className={`beat-pill beat-pill-btn ${likedNow ? "is-active" : ""}`}
                  onClick={toggleLike}
                  title="Like this track — builds your ❤️ Liked tab"
                >
                  {likedNow ? "❤️ Liked" : "🤍 Like"}
                </button>
                <button
                  className="beat-pill beat-pill-btn"
                  onClick={() => void shareTrack()}
                  title="Copy track link + your fluid theme"
                >
                  🔗 Share
                </button>
                <SleepTimer
                  volume={volume}
                  applyVolume={applyVolume}
                  pause={player.pause}
                  notify={notify}
                />
                <button
                  className="beat-pill beat-pill-btn"
                  onClick={() => setKaraokeOpen(true)}
                  title="Sing along — free synced lyrics"
                >
                  🎤 Karaoke
                </button>
                {voice.supported && (
                  <button
                    className={`beat-pill beat-pill-btn ${voice.listening ? "is-active" : ""}`}
                    onClick={voice.toggle}
                    title='Voice commands: "play", "next", "pause", "like"…'
                  >
                    {voice.listening ? "🎙️ Listening…" : "🎙️ Voice"}
                  </button>
                )}
                {isPipSupported() && (
                  <button
                    className={`beat-pill beat-pill-btn ${pipOpen ? "is-active" : ""}`}
                    onClick={() => void togglePip()}
                    title="Float the mini player above other tabs"
                  >
                    🪟 Pop-out
                  </button>
                )}
              </div>
              {voice.transcript && (
                <p className="beat-hint">Heard: “{voice.transcript}”</p>
              )}

              <div className="beat-row beat-modes">
                <button
                  className={`beat-pill beat-pill-btn ${searchOpen ? "is-active" : ""}`}
                  onClick={() => setSearchOpen((v) => !v)}
                >
                  🔍 Search
                </button>
                <button
                  className={`beat-pill beat-pill-btn ${recentOpen ? "is-active" : ""}`}
                  onClick={() => setRecentOpen((v) => !v)}
                >
                  🕘 Recent{historyList.length > 0 ? ` (${historyList.length})` : ""}
                </button>
                <button
                  className={`beat-pill beat-pill-btn ${offlineOpen ? "is-active" : ""}`}
                  onClick={() => setOfflineOpen((v) => !v)}
                  title="BeatFluid Originals — plays fully offline"
                >
                  📦 Offline
                </button>
              </div>

              {offlineOpen && (
                <OfflinePack
                  volume={volume}
                  ytPlaying={player.isPlaying}
                  pauseSignal={offlinePauseSignal}
                  onPlayingChange={handleOfflinePlaying}
                />
              )}

              {searchOpen && <SearchPanel onPlay={playSingleVideo} />}

              {recentOpen && (
                <div className="history-list">
                  {historyList.length === 0 && (
                    <p className="beat-hint">Nothing yet — play something! 🎶</p>
                  )}
                  {historyList.map((h) => (
                    <button
                      key={`${h.videoId}-${h.at}`}
                      className="history-item"
                      onClick={() => playSingleVideo(h.videoId, h.title)}
                    >
                      <span className="history-title">{h.title}</span>
                      <span className="history-author">{h.author}</span>
                    </button>
                  ))}
                  {historyList.length > 0 && (
                    <button
                      className="playlist-add-reset"
                      onClick={() => {
                        clearHistory();
                        setHistoryTick((t) => t + 1);
                      }}
                    >
                      Clear history
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {toast && <div className="player-toast">{toast}</div>}
      </div>

      {karaokeOpen && (
        <Karaoke
          videoId={player.videoId}
          title={player.title}
          artist={player.artist}
          currentTime={player.currentTime}
          duration={player.duration}
          onSeek={player.seekTo}
          onClose={() => setKaraokeOpen(false)}
        />
      )}
    </>
  );
}

export default MusicPlayer;
