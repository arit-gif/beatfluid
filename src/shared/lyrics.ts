/**
 * Lyrics engine — 100% free, zero API keys.
 * Cascade: bundled files → local cache → LRCLIB → lyrics.ovh → none.
 */

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export type LyricsResult =
  | { kind: "synced"; lines: LyricLine[]; source: string }
  | { kind: "plain"; text: string; source: string }
  | { kind: "none" };

// ---------------------------------------------------------------------------
// LRC parsing + title cleaning
// ---------------------------------------------------------------------------

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const tag = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of lrc.split("\n")) {
    tag.lastIndex = 0;
    const text = raw.replace(tag, "").trim();
    if (!text) continue;
    tag.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = tag.exec(raw)) !== null) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(m[3].padEnd(3, "0").slice(0, 3)) : 0;
      lines.push({ time: min * 60 + sec + frac / 1000, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** "Kesariya (Official Video) | Brahmastra" → "Kesariya" */
export function cleanTitle(raw: string): string {
  let t = raw.split("|")[0] ?? raw;
  t = t.replace(/\(.*?\)/g, " ").replace(/\[.*?\]/g, " ");
  t = t.replace(
    /\b(official|video|audio|lyrics?|lyrical|visualiser|visualizer|vevo|4k|hd|1080p|720p|m\/v|\bmv\b|ost|theme|song|slowed|reverb|lofi|lofii|8d|bass\s*boosted)\b/gi,
    " "
  );
  return t.replace(/[-–—:|#]+\s*$/, "").replace(/\s{2,}/g, " ").trim();
}

/** "Arijit Singh - Topic" → "Arijit Singh" (YouTube auto-channels). */
export function cleanArtist(raw: string): string {
  const t = (raw.split("|")[0] ?? raw).replace(/\s*-\s*topic$/i, "").trim();
  return t;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-");
}

// ---------------------------------------------------------------------------
// Local cache (per videoId, capped)
// ---------------------------------------------------------------------------

const CACHE_KEY = "fluid-lyrics:cache";
const MAX_CACHE = 40;

interface CacheEntry {
  synced: string | null;
  plain: string | null;
  source: string;
  at: number;
}

function loadCache(): Record<string, CacheEntry> {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, CacheEntry>)
      : {};
  } catch {
    return {};
  }
}

function saveCacheEntry(videoId: string, entry: CacheEntry): void {
  try {
    const cache = loadCache();
    cache[videoId] = entry;
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHE) {
      keys
        .sort((a, b) => (cache[a]?.at ?? 0) - (cache[b]?.at ?? 0))
        .slice(0, keys.length - MAX_CACHE)
        .forEach((k) => delete cache[k]);
    }
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

/** User-pasted LRC for the current track. Returns parsed lines or null. */
export function saveCustomLrc(videoId: string, lrc: string): LyricLine[] | null {
  const lines = parseLrc(lrc);
  if (lines.length === 0 || !videoId) return null;
  saveCacheEntry(videoId, {
    synced: lrc,
    plain: null,
    source: "your paste ✍️",
    at: Date.now(),
  });
  return lines;
}

// ---------------------------------------------------------------------------
// Fetch cascade
// ---------------------------------------------------------------------------

async function tryFetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

export async function fetchLyrics(options: {
  videoId: string;
  title: string;
  artist: string;
  duration: number;
}): Promise<LyricsResult> {
  const { videoId, duration } = options;
  const title = cleanTitle(options.title);
  const artist = cleanArtist(options.artist);

  // 1. Bundled sample files (instant, work offline once deployed).
  const slugs: string[] = [];
  const st = slugify(title);
  const sa = slugify(artist);
  if (sa && st) slugs.push(`${sa}-${st}`);
  if (st) slugs.push(st);
  const candidates: string[] = [];
  for (const s of slugs) candidates.push(`/lyrics/by-title/${s}.lrc`);
  for (const s of slugs) candidates.push(`/lyrics/by-title/${s}.txt`);
  if (videoId) candidates.push(`/lyrics/${videoId}.lrc`, `/lyrics/${videoId}.txt`);
  for (const url of candidates) {
    const text = await tryFetchText(url);
    if (!text) continue;
    if (url.endsWith(".lrc")) {
      const lines = parseLrc(text);
      if (lines.length > 0) {
        return { kind: "synced", lines, source: "bundled sample 📦" };
      }
    } else {
      return { kind: "plain", text: text.trim(), source: "bundled sample 📦" };
    }
  }

  // 2. Local cache (previous lookups + user pastes).
  if (videoId) {
    const hit = loadCache()[videoId];
    if (hit?.synced) {
      const lines = parseLrc(hit.synced);
      if (lines.length > 0) return { kind: "synced", lines, source: hit.source };
    }
    if (hit?.plain) return { kind: "plain", text: hit.plain, source: hit.source };
  }

  // 3. LRCLIB — free, no key, synced when lucky.
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (duration > 0) params.set("duration", String(Math.round(duration)));
    let rec = await (
      await fetch(`https://lrclib.net/api/get?${params.toString()}`)
    )
      .json()
      .catch(() => null);
    if (!rec?.syncedLyrics && !rec?.plainLyrics) {
      const list = await (
        await fetch(
          `https://lrclib.net/api/search?q=${encodeURIComponent(`${artist} ${title}`)}`
        )
      )
        .json()
        .catch(() => []);
      const first = Array.isArray(list) ? list[0] : null;
      if (first?.id) {
        rec = await (await fetch(`https://lrclib.net/api/get/${first.id}`))
          .json()
          .catch(() => null);
      }
    }
    if (rec?.syncedLyrics || rec?.plainLyrics) {
      if (videoId) {
        saveCacheEntry(videoId, {
          synced: rec.syncedLyrics ?? null,
          plain: rec.plainLyrics ?? null,
          source: "LRCLIB 🌐",
          at: Date.now(),
        });
      }
      if (rec.syncedLyrics) {
        const lines = parseLrc(rec.syncedLyrics);
        if (lines.length > 0) return { kind: "synced", lines, source: "LRCLIB 🌐" };
      }
      if (rec.plainLyrics) {
        return { kind: "plain", text: rec.plainLyrics, source: "LRCLIB 🌐" };
      }
    }
  } catch {
    /* fall through */
  }

  // 4. lyrics.ovh — free, no key, plain text only.
  try {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
    );
    const data = await res.json().catch(() => null);
    if (data?.lyrics) {
      if (videoId) {
        saveCacheEntry(videoId, {
          synced: null,
          plain: data.lyrics,
          source: "lyrics.ovh 🌐",
          at: Date.now(),
        });
      }
      return { kind: "plain", text: data.lyrics, source: "lyrics.ovh 🌐" };
    }
  } catch {
    /* fall through */
  }

  return { kind: "none" };
}
