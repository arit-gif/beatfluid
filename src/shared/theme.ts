export interface PlaylistTheme {
  /** UI accent — borders, badges, buttons, progress bar. */
  accent: string;
  /** Fluid dye tint for the first idle emitter. */
  dyeA: string;
  /** Fluid dye tint for the second idle emitter. */
  dyeB: string;
}

// Matches the fluid's original hardcoded blue/pink so nothing shifts visually
// until a playlist is actually selected.
const DEFAULT_THEME: PlaylistTheme = {
  accent: "#f3a6b2",
  dyeA: "#0d7aff",
  dyeB: "#ff148c",
};

let currentTheme: PlaylistTheme = DEFAULT_THEME;

export function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb01(hex).map((c) => Math.round(c * 255));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function setTheme(theme: PlaylistTheme): void {
  currentTheme = theme;
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.setProperty("--accent", theme.accent);
  root.setProperty("--accent-glow", hexToRgba(theme.accent, 0.4));
  root.setProperty("--line", hexToRgba(theme.accent, 0.22));
}

export function getTheme(): PlaylistTheme {
  return currentTheme;
}
