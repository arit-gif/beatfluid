export interface LikedTrack {
  videoId: string;
  title: string;
  author: string;
  at: number;
}

export const LIKED_LABEL = "❤️ Liked";

const STORE_KEY = "fluid-music:likes";

export function loadLikes(): LikedTrack[] {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LikedTrack[]) : [];
  } catch {
    return [];
  }
}

function saveLikes(likes: LikedTrack[]): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(likes));
  } catch {
    /* ignore */
  }
}

/** Toggles a like. Returns the new list (also persisted). */
export function toggleLikeTrack(
  videoId: string,
  title: string,
  author: string
): LikedTrack[] {
  const likes = loadLikes();
  const idx = likes.findIndex((t) => t.videoId === videoId);
  let next: LikedTrack[];
  if (idx === -1) {
    next = [{ videoId, title, author, at: Date.now() }, ...likes].slice(0, 100);
  } else {
    next = likes.filter((t) => t.videoId !== videoId);
  }
  saveLikes(next);
  return next;
}

export function isLiked(likes: LikedTrack[], videoId: string): boolean {
  return likes.some((t) => t.videoId === videoId);
}
