import type { PlaylistTheme } from "./theme";

/**
 * Auto day/night fluid for Kolkata (22.57°N, 88.36°E).
 * Computes real sunrise/sunset with the standard solar equations, then
 * blends the fluid theme across the day so the app "knows" it's monsoon
 * dusk or a bright winter morning.
 */

const LAT = 22.5726;
const LON = 88.3639;
const TZ_HOURS = 5.5; // IST

const STORE_KEY = "fluid-beat:daynight";

export function loadDayNightAuto(): boolean {
  try {
    return window.localStorage.getItem(STORE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveDayNightAuto(on: boolean): void {
  try {
    window.localStorage.setItem(STORE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

/** Approx sunrise/sunset hours (local) via the sunrise equation. */
export function kolkataSun(date: Date): { sunrise: number; sunset: number } {
  try {
    const n = dayOfYear(date);
    const lngHour = LON / 15;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;
    const calc = (isSunrise: boolean) => {
      const t = n + (isSunrise ? 6 - lngHour : 18 - lngHour) / 24;
      const m = 0.9856 * t - 3.289;
      let l = m + 1.916 * Math.sin(toRad(m)) + 0.02 * Math.sin(toRad(2 * m)) + 282.634;
      l = ((l % 360) + 360) % 360;
      let ra = toDeg(Math.atan(0.91764 * Math.tan(toRad(l))));
      ra = ((ra % 360) + 360) % 360;
      ra += Math.floor(l / 90) * 90 - Math.floor(ra / 90) * 90;
      ra /= 15;
      const sinDec = 0.39782 * Math.sin(toRad(l));
      const cosDec = Math.cos(Math.asin(sinDec));
      const cosH =
        (Math.cos(toRad(90.833)) - sinDec * Math.sin(toRad(LAT))) /
        (cosDec * Math.cos(toRad(LAT)));
      const clamped = Math.min(1, Math.max(-1, cosH));
      const h = isSunrise
        ? 360 - toDeg(Math.acos(clamped))
        : toDeg(Math.acos(clamped));
      const hHours = h / 15;
      const t2 = hHours + ra - 0.06571 * t - 6.622;
      let ut = ((t2 - lngHour) % 24 + 24) % 24;
      return ut + TZ_HOURS > 24 ? ut + TZ_HOURS - 24 : ut + TZ_HOURS;
    };
    return { sunrise: calc(true), sunset: calc(false) };
  } catch {
    return { sunrise: 5.6, sunset: 17.7 };
  }
}

interface Stop {
  at: number; // hour of day
  theme: PlaylistTheme;
  name: string;
  emoji: string;
}

function stopsFor(sunrise: number, sunset: number): Stop[] {
  const night: PlaylistTheme = { accent: "#7986cb", dyeA: "#1a237e", dyeB: "#4a148c" };
  const dawn: PlaylistTheme = { accent: "#ff8a65", dyeA: "#ff7043", dyeB: "#ffd54f" };
  const day: PlaylistTheme = { accent: "#4dd0e1", dyeA: "#29b6f6", dyeB: "#4fd1c5" };
  const dusk: PlaylistTheme = { accent: "#ff7043", dyeA: "#ff5722", dyeB: "#7b1fa2" };
  return [
    { at: 0, theme: night, name: "Night", emoji: "🌙" },
    { at: Math.max(0, sunrise - 0.7), theme: night, name: "Night", emoji: "🌙" },
    { at: sunrise + 0.4, theme: dawn, name: "Sunrise", emoji: "🌅" },
    { at: sunrise + 2, theme: day, name: "Morning", emoji: "🌤️" },
    { at: Math.max(sunrise + 2.5, sunset - 2.5), theme: day, name: "Day", emoji: "☀️" },
    { at: sunset + 0.2, theme: dusk, name: "Sunset", emoji: "🌇" },
    { at: sunset + 1.5, theme: night, name: "Evening", emoji: "🌃" },
    { at: 24, theme: night, name: "Night", emoji: "🌙" },
  ];
}

function hexLerp(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const mix = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t));
  return "#" + mix.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function themeLerp(a: PlaylistTheme, b: PlaylistTheme, t: number): PlaylistTheme {
  return {
    accent: hexLerp(a.accent, b.accent, t),
    dyeA: hexLerp(a.dyeA, b.dyeA, t),
    dyeB: hexLerp(a.dyeB, b.dyeB, t),
  };
}

export interface DayNightInfo {
  theme: PlaylistTheme;
  phaseName: string;
  phaseEmoji: string;
}

/** Blended theme + phase label for "now" (or any date). */
export function getDayNight(date: Date): DayNightInfo {
  const { sunrise, sunset } = kolkataSun(date);
  const hour = date.getHours() + date.getMinutes() / 60;
  const stops = stopsFor(sunrise, sunset).sort((x, y) => x.at - y.at);
  let prev = stops[0]!;
  for (const stop of stops) {
    if (hour <= stop.at) {
      const span = Math.max(0.001, stop.at - prev.at);
      const t = Math.min(1, Math.max(0, (hour - prev.at) / span));
      const nearer = t < 0.5 ? prev : stop;
      return {
        theme: themeLerp(prev.theme, stop.theme, t),
        phaseName: nearer.name,
        phaseEmoji: nearer.emoji,
      };
    }
    prev = stop;
  }
  const last = stops[stops.length - 1]!;
  return { theme: last.theme, phaseName: last.name, phaseEmoji: last.emoji };
}
