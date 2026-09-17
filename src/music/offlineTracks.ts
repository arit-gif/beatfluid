export interface OfflineTrack {
  id: string;
  title: string;
  src: string;
}

/** BeatFluid Originals — synthesized in-code, royalty-free, work offline. */
export const OFFLINE_TRACKS: OfflineTrack[] = [
  { id: "monsoon", title: "Monsoon Dreams 🌧️", src: "/audio/monsoon-dreams.mp3" },
  { id: "night", title: "Night Drive 🌃", src: "/audio/night-drive.mp3" },
  { id: "temple", title: "Temple Morning 🛕", src: "/audio/temple-morning.mp3" },
];
