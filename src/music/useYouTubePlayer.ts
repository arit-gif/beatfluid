import { useCallback, useEffect, useRef, useState } from "react";
import { loadYouTubeApi, type YTPlayerInstance } from "./youtube-api";
import type { PlaylistSource } from "./playlists";
import { setPlaybackEnergy } from "../shared/energy";

interface UseYouTubePlayerOptions {
  source: PlaylistSource;
  /** id of the (hidden) container element the player mounts into. */
  elementId: string;
  initialVolume?: number;
}

function sourceKey(source: PlaylistSource): string {
  return source.type === "videoList"
    ? `videoList:${source.ids.join(",")}`
    : `${source.type}:${source.id}`;
}

function toPlayerConfig(source: PlaylistSource): {
  videoId?: string;
  playerVars: Record<string, unknown>;
} {
  if (source.type === "playlist") {
    return { playerVars: { listType: "playlist", list: source.id } };
  }
  if (source.type === "video") {
    return { videoId: source.id, playerVars: {} };
  }
  const [first, ...rest] = source.ids;
  return {
    videoId: first,
    playerVars: rest.length > 0 ? { playlist: rest.join(",") } : {},
  };
}

function errorMessage(code: number): string {
  switch (code) {
    case 2:
      return "That link doesn't point to a valid video.";
    case 5:
      return "This video can't play in an embedded player.";
    case 100:
      return "This video is private or has been removed.";
    case 101:
    case 150:
      return "The channel has disabled playback on other sites.";
    default:
      return "This track can't be played right now.";
  }
}

export function useYouTubePlayer({
  source,
  elementId,
  initialVolume = 80,
}: UseYouTubePlayerOptions) {
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const isPlayingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [title, setTitle] = useState("Loading…");
  const [artist, setArtist] = useState("");
  const [trackLabel, setTrackLabel] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState("");

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    setPlaybackEnergy({ playing: isPlaying });
  }, [isPlaying]);

  // Safety net: the YouTube widget API sometimes throws inside its own
  // internal promises (as with the "Invalid video id" bug this hook used to
  // trigger). If anything similar slips through in the future, surface it
  // instead of leaving the UI stuck silently.
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const message =
        event.reason instanceof Error ? event.reason.message : String(event.reason);
      if (/widgetapi|video id/i.test(message)) {
        setError("Something went wrong loading this — try Skip, or switch tabs and back.");
      }
    };
    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  const refreshTrackInfo = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const data = player.getVideoData?.();
    if (data?.title) {
      setTitle(data.title);
      setArtist(data.author || "Playing");
    }
    if (data?.video_id) {
      setVideoId(data.video_id);
    }
    const list = player.getPlaylist?.();
    if (list && list.length > 0) {
      setTrackLabel(`${player.getPlaylistIndex() + 1} / ${list.length}`);
    } else {
      setTrackLabel("");
    }
  }, []);

  const key = sourceKey(source);

  useEffect(() => {
    let cancelled = false;
    let player: YTPlayerInstance | null = null;
    let stuckTimer: ReturnType<typeof setTimeout> | undefined;
    const wantsAutoplay = isPlayingRef.current;

    setReady(false);
    setIsPlaying(false);
    setTitle("Loading…");
    setArtist("");
    setTrackLabel("");
    setCurrentTime(0);
    setDuration(0);
    setError(null);
    setVideoId("");

    const { videoId, playerVars } = toPlayerConfig(source);

    // If YouTube's iframe_api script never calls back at all, that's not a
    // per-video problem — it usually means something in the browser (an ad
    // blocker or privacy extension) is blocking requests to youtube.com
    // outright. Surface that distinctly from "this one video won't play".
    const apiTimer = setTimeout(() => {
      if (!cancelled) {
        setError(
          "Couldn't reach YouTube's player script. This is almost always an ad blocker, privacy extension, or network filter blocking youtube.com — try an incognito window (extensions are off by default there) or disable the extension for this site, then reload."
        );
      }
    }, 8000);

    loadYouTubeApi().then((YT) => {
      clearTimeout(apiTimer);
      if (cancelled) return;
      player = new YT.Player(elementId, {
        height: "0",
        width: "0",
        // Only include videoId when we actually have one. Passing
        // `videoId: undefined` explicitly (rather than omitting the key)
        // makes the widget API throw "Invalid video id" for pure-playlist
        // sources, which never reach onReady/onError — the exact stuck
        // "Loading…" state this was causing.
        ...(videoId ? { videoId } : {}),
        playerVars: {
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          ...playerVars,
        },
        events: {
          onReady: () => {
            clearTimeout(stuckTimer);
            player?.setVolume(initialVolume);
            playerRef.current = player;
            setReady(true);
            refreshTrackInfo();
            if (wantsAutoplay) player?.playVideo();
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              refreshTrackInfo();
            } else if (event.data === YT.PlayerState.ENDED) {
              player?.nextVideo();
            } else {
              setIsPlaying(false);
            }
          },
          onError: (event) => {
            clearTimeout(stuckTimer);
            setError(errorMessage(event.data));
            setIsPlaying(false);
          },
        },
      });

      // Belt-and-braces: the API loaded, but if this particular player never
      // reaches ready/error (seen with some restrictive embeds), don't leave
      // the UI stuck on "Loading…" forever.
      stuckTimer = setTimeout(() => {
        if (!cancelled) {
          setError((current) => current ?? "This link isn't loading — it may not allow embedding. Try Skip, or open it directly on YouTube.");
        }
      }, 8000);
    });

    return () => {
      cancelled = true;
      clearTimeout(apiTimer);
      clearTimeout(stuckTimer);
      player?.destroy();
      playerRef.current = null;
      setPlaybackEnergy({ playing: false });
    };
    // `key` (a stable string derived from `source`) is the real dependency —
    // it's what should trigger tearing down and rebuilding the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, elementId, initialVolume]);

  // Lock-screen / Bluetooth / notification controls (Media Session API).
  // Phones, laptops and car stereos pick these up automatically.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler("play", () =>
        playerRef.current?.playVideo()
      );
      navigator.mediaSession.setActionHandler("pause", () =>
        playerRef.current?.pauseVideo()
      );
      navigator.mediaSession.setActionHandler("previoustrack", () =>
        playerRef.current?.previousVideo()
      );
      navigator.mediaSession.setActionHandler("nexttrack", () =>
        playerRef.current?.nextVideo()
      );
    } catch {
      /* this browser doesn't support a handler — the rest still works */
    }
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
      if (title && title !== "Loading…") {
        navigator.mediaSession.metadata = new MediaMetadata({
          title,
          artist: artist || "BeatFluid",
          album: "BeatFluid",
          artwork: videoId
            ? [
                {
                  src: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                  sizes: "480x360",
                  type: "image/jpeg",
                },
              ]
            : [],
        });
      }
    } catch {
      /* ignore */
    }
  }, [title, artist, videoId, isPlaying]);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !isPlaying) return;
      setCurrentTime(player.getCurrentTime());
      setDuration(player.getDuration() || 0);
      refreshTrackInfo();
    }, 500);
    return () => clearInterval(interval);
  }, [ready, isPlaying, refreshTrackInfo]);

  const play = useCallback(() => playerRef.current?.playVideo(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo(), []);
  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);
  const next = useCallback(() => {
    playerRef.current?.nextVideo();
    setTimeout(refreshTrackInfo, 1000);
  }, [refreshTrackInfo]);
  const previous = useCallback(() => {
    playerRef.current?.previousVideo();
    setTimeout(refreshTrackInfo, 1000);
  }, [refreshTrackInfo]);
  const shuffle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.setShuffle(true);
    player.nextVideo();
    setTimeout(refreshTrackInfo, 1000);
  }, [refreshTrackInfo]);
  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
  }, []);
  const setVolume = useCallback((volume: number) => {
    playerRef.current?.setVolume(volume);
    setPlaybackEnergy({ volume });
  }, []);

  return {
    ready,
    isPlaying,
    title,
    artist,
    trackLabel,
    currentTime,
    duration,
    error,
    videoId,
    play,
    pause,
    toggle,
    next,
    previous,
    shuffle,
    seekTo,
    setVolume,
  };
}
