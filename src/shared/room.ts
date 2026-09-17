/**
 * Together Rooms — peer-to-peer via the free PeerJS cloud broker.
 * No accounts, no servers, no cost. Star topology: guests connect to the
 * host, and the host is the authority (DJ). Only tiny state messages sync —
 * every device streams YouTube itself, so rooms cost nothing to run.
 */

import { Peer, type DataConnection } from "peerjs";

export interface RoomMember {
  id: string;
  name: string;
  emoji: string;
  host: boolean;
}

export interface QueueItem {
  videoId: string;
  title: string;
  addedBy: string;
}

export interface RoomCurrent {
  videoId: string;
  title: string;
  playing: boolean;
  position: number;
  stamp: number;
}

export interface RoomReaction {
  id: number;
  emoji: string;
  from: string;
}

export type RoomStatus = "idle" | "creating" | "joining" | "live" | "ended" | "error";

export interface RoomSnapshot {
  status: RoomStatus;
  inRoom: boolean;
  role: "host" | "guest" | null;
  code: string;
  selfId: string;
  hostName: string;
  members: RoomMember[];
  queue: QueueItem[];
  current: RoomCurrent | null;
  votes: string[];
  error: string;
  endedNote: string;
  reactions: RoomReaction[];
}

type Msg =
  | { t: "hello"; name: string; emoji: string }
  | { t: "req-add"; videoId: string; title: string }
  | { t: "vote" }
  | { t: "react"; emoji: string; from: string }
  | { t: "bye" }
  | { t: "welcome"; snap: HostState }
  | { t: "state"; snap: HostState }
  | { t: "ended"; note: string };

interface HostState {
  members: RoomMember[];
  queue: QueueItem[];
  current: RoomCurrent | null;
  votes: string[];
}

interface LocalPlayback {
  videoId: string;
  title: string;
  position: number;
  playing: boolean;
  at: number;
}

const PEER_PREFIX = "beatfluid-v1-";
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const AVATARS = ["🦊", "🐼", "🦁", "🐸", "🐵", "🐯", "🐰", "🐨", "🐷", "🐙"];
const JOIN_TIMEOUT = 12000;

let peer: Peer | null = null;
let hostConn: DataConnection | null = null;
let guestConns = new Map<string, DataConnection>();
let role: "host" | "guest" | null = null;
let status: RoomStatus = "idle";
let code = "";
let self = { id: "", name: "", emoji: "🦊" };
let members: RoomMember[] = [];
let queue: QueueItem[] = [];
let current: RoomCurrent | null = null;
let votes = new Set<string>();
let reactions: RoomReaction[] = [];
let error = "";
let endedNote = "";
let endedQueue: QueueItem[] = [];
let broadcastTimer = 0;
let joinTimer = 0;
let reactionId = 0;
let lastTrackId = "";
let localPlayback: LocalPlayback = { videoId: "", title: "", position: 0, playing: false, at: 0 };

type Listener = (snap: RoomSnapshot) => void;
const listeners = new Set<Listener>();

type PlayRequestHandler = (videoId: string, title: string) => void;
const playHandlers = new Set<PlayRequestHandler>();

function avatarFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length]!;
}

function genCode(): string {
  let c = "";
  for (let i = 0; i < 4; i++) {
    c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return c;
}

function cleanName(raw: string): string {
  const n = raw.trim().slice(0, 16);
  return n || `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function getRoomSnapshot(): RoomSnapshot {
  const host = members.find((m) => m.host);
  return {
    status,
    inRoom: status === "live",
    role,
    code,
    selfId: self.id,
    hostName: host ? host.name : "",
    members: [...members],
    queue: [...queue],
    current,
    votes: [...votes],
    error,
    endedNote,
    reactions: [...reactions],
  };
}

function notify(): void {
  const snap = getRoomSnapshot();
  for (const fn of listeners) fn(snap);
}

export function subscribeRoom(fn: Listener): () => void {
  listeners.add(fn);
  fn(getRoomSnapshot());
  return () => {
    listeners.delete(fn);
  };
}

export function onLocalPlayRequest(fn: PlayRequestHandler): () => void {
  playHandlers.add(fn);
  return () => {
    playHandlers.delete(fn);
  };
}

function emitPlayRequest(videoId: string, title: string): void {
  for (const fn of playHandlers) fn(videoId, title);
}

/** Host's MusicPlayer reports here every render (cheap). */
export function setLocalPlayback(pb: Omit<LocalPlayback, "at">): void {
  localPlayback = { ...pb, at: Date.now() };
}

export function getLocalPlayback(): LocalPlayback {
  return localPlayback;
}

// ---------------------------------------------------------------- host ----

function hostState(): HostState {
  return { members: [...members], queue: [...queue], current, votes: [...votes] };
}

function broadcast(): void {
  if (role !== "host") return;
  if (current?.videoId !== lastTrackId) {
    lastTrackId = current?.videoId ?? "";
    votes.clear();
  }
  const msg: Msg = { t: "state", snap: hostState() };
  for (const conn of guestConns.values()) {
    try {
      if (conn.open) conn.send(msg);
    } catch {
      /* ignore */
    }
  }
  notify();
}

function refreshCurrentFromLocal(): void {
  const fresh = Date.now() - localPlayback.at < 6000 && localPlayback.videoId !== "";
  if (fresh) {
    current = {
      videoId: localPlayback.videoId,
      title: localPlayback.title,
      playing: localPlayback.playing,
      position: localPlayback.position,
      stamp: Date.now(),
    };
  } else if (current) {
    current = { ...current, playing: false, stamp: Date.now() };
  }
}

function pushReaction(emoji: string, from: string): void {
  const id = ++reactionId;
  reactions = [...reactions.slice(-19), { id, emoji, from }];
  notify();
  window.setTimeout(() => {
    reactions = reactions.filter((r) => r.id !== id);
    notify();
  }, 3500);
}

function handleGuestData(conn: DataConnection, data: unknown): void {
  const m = data as Msg;
  if (!m || typeof m !== "object" || typeof m.t !== "string") return;
  const fromId = conn.peer;
  const member = members.find((x) => x.id === fromId);
  switch (m.t) {
    case "hello": {
      if (!members.some((x) => x.id === fromId)) {
        members = [
          ...members,
          {
            id: fromId,
            name: cleanName(m.name),
            emoji: m.emoji || avatarFor(fromId),
            host: false,
          },
        ];
      }
      try {
        if (conn.open) conn.send({ t: "welcome", snap: hostState() } satisfies Msg);
      } catch {
        /* ignore */
      }
      broadcast();
      break;
    }
    case "req-add": {
      if (m.videoId && queue.length < 50 && !queue.some((q) => q.videoId === m.videoId)) {
        queue = [
          ...queue,
          {
            videoId: m.videoId.slice(0, 32),
            title: (m.title || "Song").slice(0, 80),
            addedBy: member?.name ?? "guest",
          },
        ];
      }
      broadcast();
      break;
    }
    case "vote": {
      if (fromId) votes.add(fromId);
      if (votes.size > members.length / 2) hostSkipNow();
      else broadcast();
      break;
    }
    case "react": {
      const from = member?.name ?? "guest";
      const emoji = String(m.emoji).slice(0, 4);
      pushReaction(emoji, from);
      const out: Msg = { t: "react", emoji, from };
      for (const c of guestConns.values()) {
        try {
          if (c.open) c.send(out);
        } catch {
          /* ignore */
        }
      }
      break;
    }
    case "bye": {
      removeGuest(fromId);
      break;
    }
    default:
      break;
  }
}

function removeGuest(id: string): void {
  members = members.filter((m) => m.id !== id);
  votes.delete(id);
  const conn = guestConns.get(id);
  guestConns.delete(id);
  try {
    conn?.close();
  } catch {
    /* ignore */
  }
  broadcast();
}

export async function createRoom(name: string, seeds: QueueItem[] = []): Promise<void> {
  cleanupPeer();
  resetState();
  status = "creating";
  role = "host";
  self = { id: "", name: cleanName(name), emoji: "🦊" };
  notify();
  for (let attempt = 0; attempt < 3; attempt++) {
    code = genCode();
    try {
      await openHostPeer(code);
      break;
    } catch {
      code = "";
    }
  }
  if (!code || !peer) {
    status = "error";
    role = null;
    error = "Couldn't start a room — check your connection and retry.";
    notify();
    return;
  }
  self = { id: peer.id, name: self.name, emoji: avatarFor(peer.id) };
  members = [{ ...self, host: true }];
  const lp = localPlayback;
  const fresh = Date.now() - lp.at < 10000 && lp.videoId !== "" && lp.title !== "Loading…";
  queue = [...seeds];
  if (fresh && !queue.some((q) => q.videoId === lp.videoId)) {
    queue = [{ videoId: lp.videoId, title: lp.title, addedBy: self.name }, ...queue];
  }
  votes = new Set();
  status = "live";
  error = "";
  refreshCurrentFromLocal();
  broadcast();
  window.clearInterval(broadcastTimer);
  broadcastTimer = window.setInterval(() => {
    refreshCurrentFromLocal();
    broadcast();
  }, 2500);
}

function openHostPeer(roomCode: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = new Peer(`${PEER_PREFIX}${roomCode}`);
    const timer = window.setTimeout(() => {
      try {
        p.destroy();
      } catch {
        /* ignore */
      }
      reject(new Error("timeout"));
    }, 15000);
    p.on("open", () => {
      window.clearTimeout(timer);
      peer = p;
      p.on("connection", (conn) => wireHostConn(conn));
      resolve();
    });
    p.on("error", () => {
      window.clearTimeout(timer);
      try {
        p.destroy();
      } catch {
        /* ignore */
      }
      reject(new Error("peer-error"));
    });
  });
}

function wireHostConn(conn: DataConnection): void {
  guestConns.set(conn.peer, conn);
  conn.on("data", (data) => handleGuestData(conn, data));
  conn.on("close", () => removeGuest(conn.peer));
  conn.on("error", () => removeGuest(conn.peer));
}

// ---------------------------------------------------------------- guest ---

export async function joinRoom(roomCode: string, name: string): Promise<void> {
  cleanupPeer();
  resetState();
  const clean = roomCode.trim().toUpperCase();
  if (!/^[A-Z2-9]{4}$/.test(clean)) {
    status = "error";
    error = "Codes are 4 letters — e.g. KOLK.";
    notify();
    return;
  }
  status = "joining";
  role = "guest";
  code = clean;
  self = { id: "", name: cleanName(name), emoji: "🦊" };
  notify();
  const p = new Peer();
  peer = p;
  joinTimer = window.setTimeout(() => {
    if (status === "joining") {
      status = "error";
      error = "Room not found — check the code with your host.";
      cleanupPeer();
      notify();
    }
  }, JOIN_TIMEOUT);
  p.on("open", (id) => {
    self = { id, name: self.name, emoji: avatarFor(id) };
    const conn = p.connect(`${PEER_PREFIX}${clean}`, { reliable: true });
    hostConn = conn;
    conn.on("open", () => {
      window.clearTimeout(joinTimer);
      try {
        conn.send({ t: "hello", name: self.name, emoji: self.emoji } satisfies Msg);
      } catch {
        /* ignore */
      }
    });
    conn.on("data", (data) => handleHostData(data));
    conn.on("close", () => endGuest("Host left the room 💨"));
    conn.on("error", () => endGuest("Lost connection to host 📡"));
  });
  p.on("error", (e) => {
    if (status !== "joining") return;
    if (e?.type === "peer-unavailable") {
      window.clearTimeout(joinTimer);
      status = "error";
      error = "Room not found — check the code with your host.";
      cleanupPeer();
      notify();
    }
  });
}

function handleHostData(data: unknown): void {
  const m = data as Msg;
  if (!m || typeof m !== "object" || typeof m.t !== "string") return;
  switch (m.t) {
    case "welcome":
    case "state": {
      members = m.snap.members;
      queue = m.snap.queue;
      current = m.snap.current;
      votes = new Set(m.snap.votes);
      if (status !== "live") status = "live";
      error = "";
      notify();
      break;
    }
    case "react": {
      pushReaction(m.emoji, m.from);
      break;
    }
    case "ended": {
      endGuest(m.note || "Room ended.");
      break;
    }
    default:
      break;
  }
}

function endGuest(note: string): void {
  endedQueue = [...queue];
  endedNote = note;
  const keepCode = code;
  cleanupPeer();
  resetState();
  code = keepCode;
  status = "ended";
  notify();
}

// ---------------------------------------------------------------- actions -

function sendToHost(msg: Msg): boolean {
  if (role !== "guest" || !hostConn?.open) return false;
  try {
    hostConn.send(msg);
    return true;
  } catch {
    return false;
  }
}

/** Guests request, host adds directly. Adding never interrupts playback. */
export function requestAdd(videoId: string, title: string): void {
  if (role === "host") {
    if (videoId && queue.length < 50 && !queue.some((q) => q.videoId === videoId)) {
      queue = [
        ...queue,
        { videoId: videoId.slice(0, 32), title: title.slice(0, 80), addedBy: self.name },
      ];
    }
    broadcast();
    return;
  }
  sendToHost({ t: "req-add", videoId, title });
}

export function voteSkip(): void {
  if (role === "host") {
    votes.add(self.id);
    if (votes.size > members.length / 2) hostSkipNow();
    else broadcast();
    return;
  }
  sendToHost({ t: "vote" });
}

export function react(emoji: string): void {
  const clean = emoji.slice(0, 4);
  if (role === "host") {
    pushReaction(clean, self.name);
    const out: Msg = { t: "react", emoji: clean, from: self.name };
    for (const c of guestConns.values()) {
      try {
        if (c.open) c.send(out);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  sendToHost({ t: "react", emoji: clean, from: "" });
}

export function hostPlayNow(item: QueueItem): void {
  if (role !== "host") return;
  queue = queue.filter((q) => q.videoId !== item.videoId);
  votes.clear();
  emitPlayRequest(item.videoId, item.title);
  broadcast();
}

export function hostRemove(videoId: string): void {
  if (role !== "host") return;
  queue = queue.filter((q) => q.videoId !== videoId);
  broadcast();
}

export function hostSkipNow(): void {
  if (role !== "host") return;
  const next = queue[0];
  if (!next) {
    votes.clear();
    broadcast();
    return;
  }
  queue = queue.slice(1);
  votes.clear();
  emitPlayRequest(next.videoId, next.title);
  broadcast();
}

export function rehostRoom(name: string): Promise<void> {
  const seeds = [...endedQueue];
  endedQueue = [];
  return createRoom(name, seeds);
}

export function leaveRoom(): void {
  if (role === "host") {
    const out: Msg = { t: "ended", note: "Host left the room 💨" };
    for (const c of guestConns.values()) {
      try {
        if (c.open) c.send(out);
      } catch {
        /* ignore */
      }
    }
  } else if (role === "guest") {
    sendToHost({ t: "bye" });
  }
  endedQueue = [...queue];
  cleanupPeer();
  resetState();
  status = "idle";
  notify();
}

function cleanupPeer(): void {
  window.clearTimeout(joinTimer);
  window.clearInterval(broadcastTimer);
  try {
    hostConn?.close();
  } catch {
    /* ignore */
  }
  hostConn = null;
  for (const c of guestConns.values()) {
    try {
      c.close();
    } catch {
      /* ignore */
    }
  }
  guestConns.clear();
  try {
    peer?.destroy();
  } catch {
    /* ignore */
  }
  peer = null;
}

function resetState(): void {
  role = null;
  code = "";
  members = [];
  queue = [];
  current = null;
  votes = new Set();
  reactions = [];
  error = "";
  endedNote = "";
  lastTrackId = "";
  self = { id: "", name: "", emoji: "🦊" };
}
