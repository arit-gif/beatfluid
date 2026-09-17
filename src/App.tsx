import { useEffect, useState } from "react";
import FluidBackground from "./fluid/FluidBackground";
import TopMenu, { type MenuAction } from "./ui/TopMenu";
import MusicPlayer from "./music/MusicPlayer";
import { FunPanel } from "./ui/FunPanel";
import { RoomPanel } from "./ui/RoomPanel";
import { BeatPet } from "./ui/BeatPet";
import { TapBattle } from "./ui/TapBattle";
import { FESTIVALS, loadFestival, saveFestival, type FestivalId } from "./shared/festivals";
import { getDayNight, loadDayNightAuto, saveDayNightAuto } from "./shared/daynight";
import { setTheme } from "./shared/theme";
import { setBpm } from "./shared/beat";
import { doTrick, petSay } from "./shared/pet";
import {
  getRoomSnapshot,
  subscribeRoom,
  voteSkip,
  type RoomSnapshot,
} from "./shared/room";
import type { PlaylistSource } from "./music/playlists";
import "./ui/room-panel.css";

const PET_KEY = "fluid-fun:pet";

function loadPet(): boolean {
  try {
    const raw = window.localStorage.getItem(PET_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function App() {
  const [musicOpen, setMusicOpen] = useState(false);
  const [funOpen, setFunOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [petOn, setPetOn] = useState(loadPet);
  const [battleOpen, setBattleOpen] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [festival, setFestival] = useState<FestivalId>(loadFestival);
  const [dayNightAuto, setDayNightAuto] = useState(loadDayNightAuto);
  const [phaseTick, setPhaseTick] = useState(0);
  const [roomSnap, setRoomSnap] = useState<RoomSnapshot>(getRoomSnapshot);

  useEffect(() => subscribeRoom(setRoomSnap), []);

  // Global visual theme lives here so festivals / day-night work even when
  // the music player is closed. Priority: festival > day-night > playlist
  // (the playlist theme is applied by MusicPlayer when nothing overrides it).
  useEffect(() => {
    if (festival !== "off") {
      setTheme(FESTIVALS[festival].theme);
      setBpm(FESTIVALS[festival].bpm);
    } else if (dayNightAuto) {
      setTheme(getDayNight(new Date()).theme);
    }
  }, [festival, dayNightAuto, phaseTick]);

  // Re-check the sun every minute while auto mode is on.
  useEffect(() => {
    if (!dayNightAuto) return;
    const timer = window.setInterval(() => setPhaseTick((x) => x + 1), 60000);
    return () => window.clearInterval(timer);
  }, [dayNightAuto]);

  const togglePet = () => {
    const next = !petOn;
    setPetOn(next);
    try {
      window.localStorage.setItem(PET_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const pickFestival = (id: FestivalId) => {
    setFestival(id);
    saveFestival(id);
  };

  const toggleDayNight = () => {
    const next = !dayNightAuto;
    setDayNightAuto(next);
    saveDayNightAuto(next);
  };

  // 📸 Photo mode: hide every UI panel so the pet + fluid get a clean shot.
  // The pet spins for the camera (if awake)!
  const takePhoto = () => {
    setPhotoMode(true);
    setFunOpen(false);
    petSay("say cheese! 📸");
    doTrick("spin");
  };

  const visualOverride = festival !== "off" || dayNightAuto;

  // Guests follow the host's playback: same video, position, play/pause.
  const roomFollow =
    roomSnap.inRoom && roomSnap.role === "guest" && roomSnap.current
      ? {
          hostName: roomSnap.hostName,
          source: { type: "video", id: roomSnap.current.videoId } as PlaylistSource,
          playing: roomSnap.current.playing,
          position: roomSnap.current.position,
          stamp: roomSnap.current.stamp,
          votes: roomSnap.votes.length,
          total: roomSnap.members.length,
        }
      : null;

  const actions: MenuAction[] = [
    {
      label: "Music",
      active: musicOpen,
      onClick: () => setMusicOpen((open) => !open),
    },
    {
      label: "🎪 Fun",
      active: funOpen,
      onClick: () => setFunOpen((open) => !open),
    },
    {
      label: roomSnap.inRoom ? `👯 ${roomSnap.code}` : "👯 Room",
      active: roomOpen || roomSnap.inRoom,
      onClick: () => setRoomOpen((open) => !open),
    },
    {
      label: "👾 Pet",
      active: petOn,
      onClick: togglePet,
    },
    {
      label: "⚔️ Battle",
      active: battleOpen,
      onClick: () => setBattleOpen(true),
    },
  ];

  return (
    <>
      <FluidBackground hideHint={musicOpen} />
      {!photoMode && <TopMenu actions={actions} />}
      {petOn && <BeatPet />}
      {battleOpen && <TapBattle onClose={() => setBattleOpen(false)} />}
      {funOpen && !photoMode && (
        <FunPanel
          onClose={() => setFunOpen(false)}
          petOn={petOn}
          onTogglePet={togglePet}
          onOpenBattle={() => setBattleOpen(true)}
          onPhoto={takePhoto}
          festival={festival}
          onPickFestival={pickFestival}
          dayNightAuto={dayNightAuto}
          onToggleDayNight={toggleDayNight}
        />
      )}
      {roomOpen && !photoMode && <RoomPanel onClose={() => setRoomOpen(false)} />}
      {roomSnap.inRoom && !roomOpen && !photoMode && (
        <button
          className="room-pill"
          onClick={() => setRoomOpen(true)}
          title="Open your room"
        >
          👯 {roomSnap.code} · {roomSnap.members.length}
        </button>
      )}
      {photoMode && (
        <button className="photo-exit" onClick={() => setPhotoMode(false)} title="Exit photo mode">
          📸 ✕
        </button>
      )}
      {musicOpen && (
        // display:none keeps the YouTube iframe mounted (music plays on!)
        // while hiding the card for a clean photo.
        <div style={{ display: photoMode ? "none" : "contents" }}>
          <MusicPlayer
            onClose={() => setMusicOpen(false)}
            visualOverride={visualOverride}
            roomRole={roomSnap.inRoom ? roomSnap.role : null}
            roomFollow={roomFollow}
            onVoteSkip={() => voteSkip()}
          />
        </div>
      )}
    </>
  );
}

export default App;
