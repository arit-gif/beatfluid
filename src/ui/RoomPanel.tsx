import { useEffect, useState } from "react";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  rehostRoom,
  requestAdd,
  hostPlayNow,
  hostRemove,
  hostSkipNow,
  voteSkip,
  react,
  subscribeRoom,
  getRoomSnapshot,
  type RoomSnapshot,
} from "../shared/room";
import { SearchPanel } from "../music/SearchPanel";
import "../music/music-player.css";
import "../music/beat-controls.css";
import "./room-panel.css";

const NAME_KEY = "fluid-room:name";
const REACTS = ["🔥", "❤️", "😭", "🎉", "👏"];

function loadName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function RoomPanel({ onClose }: { onClose: () => void }) {
  const [snap, setSnap] = useState<RoomSnapshot>(getRoomSnapshot);
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeRoom(setSnap), []);

  const saveName = (n: string) => {
    try {
      window.localStorage.setItem(NAME_KEY, n);
    } catch {
      /* ignore */
    }
  };

  const doCreate = async () => {
    if (busy) return;
    setBusy(true);
    saveName(name.trim());
    await createRoom(name.trim());
    setBusy(false);
  };

  const doJoin = async () => {
    if (busy || code.trim().length !== 4) return;
    setBusy(true);
    saveName(name.trim());
    await joinRoom(code, name.trim());
    setBusy(false);
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(
        `Join my BeatFluid room! Code: ${snap.code} — open the app, tap 👯 Room, Join!`
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const waLink = `https://wa.me/?text=${encodeURIComponent(
    `🎶 Join my BeatFluid listening room! Code: ${snap.code}\nOpen the app → 👯 Room → Join → enter the code. Let's vibe together!`
  )}`;

  const voted = snap.votes.includes(snap.selfId);

  return (
    <>
      <div className="room-floats" aria-hidden>
        {snap.reactions.map((r) => (
          <span
            key={r.id}
            className="room-float"
            style={{ left: `${8 + ((r.id * 37) % 84)}%` }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      <div className="panel room-panel">
        <button className="fun-close" onClick={onClose} aria-label="Close room panel">
          ✕
        </button>
        <h2 className="fun-title">👯 Together Room</h2>

        {(snap.status === "idle" || snap.status === "error") && (
          <>
            <input
              className="room-input"
              placeholder="Your name (e.g. Riya)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
            />
            <button
              className="playlist-add-confirm room-big-btn"
              disabled={busy}
              onClick={() => void doCreate()}
            >
              {busy ? "…" : "🎉 Create room"}
            </button>
            <div className="room-or">
              <span>or join with code</span>
            </div>
            <div className="search-row">
              <input
                className="room-code-input"
                placeholder="CODE"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))
                }
                maxLength={4}
              />
              <button
                className="playlist-add-confirm"
                disabled={busy}
                onClick={() => void doJoin()}
              >
                Join
              </button>
            </div>
            {snap.error && <p className="playlist-add-error">{snap.error}</p>}
            <p className="beat-hint">No login needed — just a name + code. The host is the DJ 🎧</p>
          </>
        )}

        {(snap.status === "creating" || snap.status === "joining") && (
          <p className="room-msg">
            <span className="room-spinner" />
            {snap.status === "creating" ? "Creating your room…" : `Joining ${snap.code}…`}
          </p>
        )}

        {snap.status === "live" && (
          <>
            <div className="room-code-row">
              <span className="room-code" title="Share this code">
                {snap.code}
              </span>
              <button className="beat-pill beat-pill-btn" onClick={() => void copyInvite()}>
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
              <a className="beat-pill beat-pill-btn room-wa" href={waLink} target="_blank" rel="noreferrer">
                💬 WhatsApp
              </a>
            </div>

            <div className="room-now">
              <span className="beat-sens-label">
                {snap.role === "host" ? "👑 You are the DJ" : `👑 DJ: ${snap.hostName}`}
              </span>
              <span className="room-now-title">
                {snap.current ? snap.current.title : "Nothing playing yet — add a song! 🎶"}
              </span>
              {snap.role === "host" ? (
                <p className="beat-hint">
                  Control playback from the Music player 🎛️ (keep it open!). Guests auto-follow you.
                </p>
              ) : (
                <button
                  className="beat-pill beat-pill-btn"
                  onClick={() => voteSkip()}
                  disabled={voted}
                  title="If most listeners vote, the song skips!"
                >
                  {voted
                    ? `✓ Voted (${snap.votes.length}/${snap.members.length})`
                    : `⏭ Vote skip (${snap.votes.length}/${snap.members.length})`}
                </button>
              )}
            </div>

            <div className="room-members">
              {snap.members.map((m) => (
                <span key={m.id} className="room-chip" title={m.host ? "Host DJ" : "Listener"}>
                  {m.emoji} {m.name}
                  {m.host ? " 👑" : ""}
                  {m.id === snap.selfId ? " (you)" : ""}
                </span>
              ))}
            </div>

            <div className="beat-row beat-modes">
              <span className="beat-sens-label">Queue ({snap.queue.length})</span>
              <button
                className={`beat-pill beat-pill-btn ${addOpen ? "is-active" : ""}`}
                onClick={() => setAddOpen((v) => !v)}
              >
                ➕ Add song
              </button>
              {snap.role === "host" && snap.queue.length > 0 && (
                <button
                  className="beat-pill beat-pill-btn"
                  onClick={() => hostSkipNow()}
                  title="Play the next queued song now"
                >
                  ⏭ Skip to next
                </button>
              )}
            </div>

            {addOpen && (
              <SearchPanel
                onPlay={(vid, t) => {
                  requestAdd(vid, t);
                  setAddOpen(false);
                }}
              />
            )}

            {snap.queue.length > 0 && (
              <div className="history-list">
                {snap.queue.map((q) => (
                  <div key={q.videoId} className="room-qitem">
                    <button
                      className="history-item room-qmain"
                      onClick={() => {
                        if (snap.role === "host") hostPlayNow(q);
                      }}
                      title={snap.role === "host" ? "Play now" : q.title}
                    >
                      <span className="history-title">{snap.role === "host" ? "▶ " : ""}{q.title}</span>
                      <span className="history-author">added by {q.addedBy}</span>
                    </button>
                    {snap.role === "host" && (
                      <button
                        className="room-qx"
                        onClick={() => hostRemove(q.videoId)}
                        aria-label="Remove from queue"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="beat-row beat-modes">
              {REACTS.map((e) => (
                <button
                  key={e}
                  className="room-react"
                  onClick={() => react(e)}
                  aria-label={`React ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>

            <button className="playlist-add-cancel room-leave" onClick={() => leaveRoom()}>
              {snap.role === "host" ? "End room for all" : "Leave room"}
            </button>
          </>
        )}

        {snap.status === "ended" && (
          <>
            <p className="room-msg">{snap.endedNote || "Room ended."}</p>
            <button
              className="playlist-add-confirm room-big-btn"
              onClick={() => void rehostRoom(name.trim())}
            >
              🎧 Start new room with same queue
            </button>
            <button className="playlist-add-cancel room-leave" onClick={onClose}>
              Close
            </button>
          </>
        )}
      </div>
    </>
  );
}

export default RoomPanel;
