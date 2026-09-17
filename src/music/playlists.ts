import type { PlaylistTheme } from "../shared/theme";

/**
 * Three kinds of source:
 *  - "playlist": a real YouTube playlist (the `list=` value from a playlist URL)
 *  - "video":    a single video or livestream (the id from youtu.be/ID or /live/ID)
 *  - "videoList": a hand-picked run of individual videos, played back-to-back
 *                 with next/prev between them (no real playlist needed)
 */
export type PlaylistSource =
  | { type: "playlist"; id: string }
  | { type: "video"; id: string }
  | { type: "videoList"; ids: string[] };

export interface PlaylistOption {
  label: string;
  source: PlaylistSource;
  theme: PlaylistTheme;
  /** Default tempo for the beat clock (user can re-tap; remembered per label). */
  bpm?: number;
}

// Cosmetic theme rotation for playlists added later via the "+" button.
export const THEME_PALETTE: PlaylistTheme[] = [
  { accent: "#ff9d4d", dyeA: "#ff9d4d", dyeB: "#ffd166" }, // saffron
  { accent: "#ef5350", dyeA: "#ef5350", dyeB: "#ff8a65" }, // terracotta
  { accent: "#4fd1c5", dyeA: "#29b6f6", dyeB: "#4fd1c5" }, // teal
  { accent: "#b388ff", dyeA: "#b388ff", dyeB: "#7c4dff" }, // violet
  { accent: "#66bb6a", dyeA: "#66bb6a", dyeB: "#c6ff00" }, // green/lime
  { accent: "#f06292", dyeA: "#f06292", dyeB: "#ff8a80" }, // rose
];

export const DEFAULT_PLAYLISTS: PlaylistOption[] = [
  {
    label: "Hindi",
    source: { type: "playlist", id: "PLdVKhIXEk-X1SkFl65C8N7zYXF3RjqL-l" },
    theme: THEME_PALETTE[0]!,
    bpm: 96,
  },
  {
    label: "Bengali",
    source: { type: "video", id: "ekmv-O0UulE" },
    theme: THEME_PALETTE[1]!,
    bpm: 80,
  },
  {
    label: "English",
    source: { type: "playlist", id: "PL1F4wmIFk0_C-MwHYnicCypsMqC4V52jy" },
    theme: THEME_PALETTE[2]!,
    bpm: 120,
  },
  {
    label: "More",
    source: { type: "videoList", ids: ["SuvLrBH8UHk", "DXDxx2AbhZ0"] },
    theme: THEME_PALETTE[3]!,
    bpm: 100,
  },
  {
    label: "Durga Pujo",
    source: { type: "video", id: "kx6OglRN2_o" },
    theme: { accent: "#ffb300", dyeA: "#ff5722", dyeB: "#ffd54f" },
    bpm: 120,
  },
];

export function sourceWatchUrl(source: PlaylistSource): string {
  if (source.type === "playlist") {
    return `https://www.youtube.com/playlist?list=${source.id}`;
  }
  if (source.type === "video") {
    return `https://youtu.be/${source.id}`;
  }
  return `https://youtu.be/${source.ids[0]}`;
}

const STORAGE_KEY = "fluid-music:playlists";

export function loadPlaylists(): PlaylistOption[] {
  if (typeof window === "undefined") return DEFAULT_PLAYLISTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PLAYLISTS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const list = parsed as PlaylistOption[];
      // Merge in new built-in tabs (e.g. seasonal additions like Durga Pujo)
      // for returning users, without touching their custom setup.
      let changed = false;
      for (const def of DEFAULT_PLAYLISTS) {
        if (!list.some((p) => p.label === def.label)) {
          list.push(def);
          changed = true;
        }
      }
      if (changed) savePlaylists(list);
      return list;
    }
    return DEFAULT_PLAYLISTS;
  } catch {
    return DEFAULT_PLAYLISTS;
  }
}

export function savePlaylists(playlists: PlaylistOption[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
  } catch {
    // Private browsing / storage quota — the session still works, it just
    // won't remember custom playlists next time.
  }
}
