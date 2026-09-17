import { setPlaying as setBeatPlaying } from "./beat";

export interface PlaybackEnergy {
  playing: boolean;
  /** 0–100, mirrors the player's volume slider. */
  volume: number;
}

let current: PlaybackEnergy = { playing: false, volume: 80 };

export function setPlaybackEnergy(patch: Partial<PlaybackEnergy>): void {
  current = { ...current, ...patch };
  // Keep the beat engine's clock in sync with YouTube play/pause.
  if (patch.playing !== undefined) {
    setBeatPlaying(patch.playing);
  }
}

export function getPlaybackEnergy(): PlaybackEnergy {
  return current;
}
