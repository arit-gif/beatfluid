import type { PlaylistSource } from "./playlists";

/**
 * Parses a pasted YouTube link into a PlaylistSource. Supports:
 *  - youtube.com/playlist?list=...
 *  - youtube.com/watch?v=...(&list=...)
 *  - youtu.be/VIDEO_ID
 *  - youtube.com/live/VIDEO_ID
 *  - youtube.com/shorts/VIDEO_ID
 *  - a bare playlist id or bare 11-character video id
 * Returns null if the input can't be recognized as any of the above.
 */
export function parseYoutubeUrl(input: string): PlaylistSource | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare id, no URL structure at all.
  if (!trimmed.includes("/") && !trimmed.includes(".")) {
    if (/^(PL|UU|FL|LL|RD|OL)[\w-]+$/.test(trimmed)) {
      return { type: "playlist", id: trimmed };
    }
    if (/^[\w-]{11}$/.test(trimmed)) {
      return { type: "video", id: trimmed };
    }
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!/youtube\.com$|youtu\.be$/.test(url.hostname.replace(/^www\./, ""))) {
    return null;
  }

  const listId = url.searchParams.get("list");
  const videoId = url.searchParams.get("v");

  if (url.hostname.includes("youtu.be")) {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id) return { type: "video", id };
  }

  const liveMatch = url.pathname.match(/\/live\/([\w-]+)/);
  if (liveMatch?.[1]) return { type: "video", id: liveMatch[1] };

  const shortsMatch = url.pathname.match(/\/shorts\/([\w-]+)/);
  if (shortsMatch?.[1]) return { type: "video", id: shortsMatch[1] };

  if (url.pathname.includes("/playlist") && listId) {
    return { type: "playlist", id: listId };
  }

  if (videoId) {
    // A watch link with a list id attached is treated as "open this playlist".
    return listId ? { type: "playlist", id: listId } : { type: "video", id: videoId };
  }

  if (listId) return { type: "playlist", id: listId };

  return null;
}
