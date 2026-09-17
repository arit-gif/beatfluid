import { useState } from "react";
import "./search-panel.css";

const KEY_STORE = "fluid-yt:key";

function loadApiKey(): string {
  try {
    return window.localStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
}

interface SearchResult {
  id: string;
  title: string;
  channel: string;
  thumb: string;
}

interface SearchPanelProps {
  onPlay: (videoId: string, title: string) => void;
}

export function SearchPanel({ onPlay }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);

  const saveKey = () => {
    const key = keyDraft.trim();
    if (!key) return;
    try {
      window.localStorage.setItem(KEY_STORE, key);
    } catch {
      /* ignore */
    }
    setApiKey(key);
    setKeyDraft("");
    setShowKey(false);
    setError("");
  };

  const removeKey = () => {
    try {
      window.localStorage.removeItem(KEY_STORE);
    } catch {
      /* ignore */
    }
    setApiKey("");
    setResults([]);
  };

  const search = async () => {
    const q = query.trim();
    if (!q || loading) return;
    if (!apiKey) {
      setShowKey(true);
      setError("Add your free YouTube API key first — one-time setup below. 👇");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const url =
        `https://www.googleapis.com/youtube/v3/search?part=snippet` +
        `&maxResults=8&type=video&videoEmbeddable=true` +
        `&q=${encodeURIComponent(q)}&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        const msg =
          typeof data?.error?.message === "string"
            ? data.error.message
            : `Search failed (${res.status})`;
        throw new Error(msg);
      }
      const items: SearchResult[] = ((data.items ?? []) as Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          thumbnails?: { default?: { url?: string } };
        };
      }>)
        .map((it) => ({
          id: it.id?.videoId ?? "",
          title: it.snippet?.title ?? "Untitled",
          channel: it.snippet?.channelTitle ?? "",
          thumb: it.snippet?.thumbnails?.default?.url ?? "",
        }))
        .filter((r) => r.id !== "");
      setResults(items);
      if (items.length === 0) setError("No results — try another spelling.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed — try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-panel">
      <div className="search-row">
        <input
          type="text"
          placeholder="Search any song… (e.g. kesariya)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
        />
        <button className="playlist-add-confirm" onClick={() => void search()}>
          {loading ? "…" : "🔍"}
        </button>
      </div>

      {error && <p className="playlist-add-error">{error}</p>}

      {results.length > 0 && (
        <div className="search-results">
          {results.map((r) => (
            <div key={r.id} className="search-item">
              {r.thumb && <img src={r.thumb} alt="" loading="lazy" />}
              <div className="search-item-meta">
                <span className="search-item-title">{r.title}</span>
                <span className="search-item-channel">{r.channel}</span>
              </div>
              <button
                className="search-play"
                onClick={() => onPlay(r.id, r.title)}
                aria-label={`Play ${r.title}`}
              >
                ▶
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="search-foot">
        <button className="playlist-add-reset" onClick={() => setShowKey((v) => !v)}>
          {apiKey ? "🔑 API key saved ✓ (change)" : "🔑 Setup API key (free, 2 min)"}
        </button>
        <a
          className="track-error-link"
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
            query.trim() || "hindi songs"
          )}`}
          target="_blank"
          rel="noreferrer"
        >
          No key? Search on YouTube ↗
        </a>
      </div>

      {showKey && (
        <div className="search-keybox">
          <ol>
            <li>
              Open{" "}
              <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer">
                console.cloud.google.com
              </a>{" "}
              → new project → enable <b>YouTube Data API v3</b>
            </li>
            <li>Credentials → Create → API key → copy it</li>
            <li>Paste below — free quota ≈ 100 searches/day</li>
          </ol>
          <div className="search-row">
            <input
              type="text"
              placeholder="Paste API key (AIza…)"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
            />
            <button className="playlist-add-confirm" onClick={saveKey}>
              Save
            </button>
          </div>
          {apiKey && (
            <button className="playlist-add-reset" onClick={removeKey}>
              Remove saved key
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default SearchPanel;
