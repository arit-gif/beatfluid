import type { PlaylistTheme } from "./theme";

export type FestivalId = "off" | "puja" | "diwali" | "holi";

export interface FestivalPack {
  id: Exclude<FestivalId, "off">;
  label: string;
  emoji: string;
  theme: PlaylistTheme;
  bpm: number;
  blurb: string;
}

export const FESTIVALS: Record<Exclude<FestivalId, "off">, FestivalPack> = {
  puja: {
    id: "puja",
    label: "Puja",
    emoji: "🥁",
    // Dhaak-red + shiuli marigold — the sound of Shashthi mornings.
    theme: { accent: "#ffb300", dyeA: "#ff5722", dyeB: "#ffd54f" },
    bpm: 120,
    blurb: "Dhaak-beat mode — fluid dances at 120 BPM",
  },
  diwali: {
    id: "diwali",
    label: "Diwali",
    emoji: "🪔",
    // Diya flame: deep orange core, golden halo.
    theme: { accent: "#ffc400", dyeA: "#ff9100", dyeB: "#ff3d00" },
    bpm: 104,
    blurb: "Diya-glow mode — warm firelight fluid",
  },
  holi: {
    id: "holi",
    label: "Holi",
    emoji: "🎨",
    // Gulal clash: electric magenta vs neon green.
    theme: { accent: "#e040fb", dyeA: "#d500f9", dyeB: "#76ff03" },
    bpm: 128,
    blurb: "Gulal mode — full colour riot",
  },
};

const STORE_KEY = "fluid-beat:festival";

export function loadFestival(): FestivalId {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw === "puja" || raw === "diwali" || raw === "holi" || raw === "off") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "off";
}

export function saveFestival(id: FestivalId): void {
  try {
    window.localStorage.setItem(STORE_KEY, id);
  } catch {
    /* ignore */
  }
}
