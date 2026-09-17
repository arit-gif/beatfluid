export interface HistoryItem {
  videoId: string;
  title: string;
  author: string;
  at: number;
}

const STORE_KEY = "fluid-music:history";
const MAX_ITEMS = 20;

export function loadHistory(): HistoryItem[] {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

/** Pushes to the front (deduped by videoId). Returns the new list. */
export function pushHistory(item: Omit<HistoryItem, "at">): HistoryItem[] {
  const items = loadHistory().filter((h) => h.videoId !== item.videoId);
  const next = [{ ...item, at: Date.now() }, ...items].slice(0, MAX_ITEMS);
  saveHistory(next);
  return next;
}

export function clearHistory(): HistoryItem[] {
  saveHistory([]);
  return [];
}
