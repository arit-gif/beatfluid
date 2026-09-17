import { useEffect, useRef, useState } from "react";
import { PianoPads } from "../music/PianoPads";
import { FESTIVALS, type FestivalId } from "../shared/festivals";
import { getDayNight } from "../shared/daynight";
import { disableShake, enableShake, isShakeSupported } from "../shared/blast";
import {
  EVO_EMOJI,
  EVO_NAMES,
  EVO_THRESHOLDS,
  FAVORITE_FOOD,
  FOOD_EMOJI,
  FOOD_LIST,
  HAT_EMOJI,
  HAT_LIST,
  doTrick,
  feedPetFood,
  getPetSnapshot,
  petOnFestival,
  playWithPet,
  resetPetPos,
  setPetHat,
  setPetName,
  setPetParty,
  setPetSound,
  setPetSpecies,
  setPetWander,
  subscribePet,
  type PetSnapshot,
  type PetSpecies,
  type PetTrick,
} from "../shared/pet";
import "../music/music-player.css";
import "../music/beat-controls.css";
import "./fun-panel.css";
import "./beat-pet.css";
import { CatArt, DogArt } from "./PetArt";

interface FunPanelProps {
  onClose: () => void;
  petOn: boolean;
  onTogglePet: () => void;
  onOpenBattle: () => void;
  onPhoto: () => void;
  festival: FestivalId;
  onPickFestival: (id: FestivalId) => void;
  dayNightAuto: boolean;
  onToggleDayNight: () => void;
}

const SPECIES_META: Array<{ id: PetSpecies; emoji: string; label: string }> = [
  { id: "blob", emoji: "🫧", label: "Bloop" },
  { id: "cat", emoji: "🐱", label: "Cat" },
  { id: "dog", emoji: "🐶", label: "Dog" },
];

const TRICKS: Array<{ id: PetTrick; emoji: string; label: string }> = [
  { id: "roll", emoji: "🌀", label: "Roll" },
  { id: "spin", emoji: "💫", label: "Spin" },
  { id: "five", emoji: "✋", label: "High-5" },
];

function statRow(emoji: string, value: number) {
  const cls = value < 25 ? "low" : value < 60 ? "mid" : "high";
  return (
    <div className="pet-stat">
      <span className="pet-stat-emoji">{emoji}</span>
      <div className="pet-bar">
        <div className={`pet-fill ${cls}`} style={{ width: `${value}%` }} />
      </div>
      <span className="pet-stat-num">{value}</span>
    </div>
  );
}

export function FunPanel({
  onClose,
  petOn,
  onTogglePet,
  onOpenBattle,
  onPhoto,
  festival,
  onPickFestival,
  dayNightAuto,
  onToggleDayNight,
}: FunPanelProps) {
  const [shakeOn, setShakeOn] = useState(false);
  const [toast, setToast] = useState("");
  const [pet, setPet] = useState<PetSnapshot>(getPetSnapshot);
  const toastTimer = useRef(0);

  useEffect(() => subscribePet(setPet), []);

  const notify = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  };

  const toggleShake = async () => {
    if (shakeOn) {
      disableShake();
      setShakeOn(false);
      return;
    }
    const ok = await enableShake();
    setShakeOn(ok);
    notify(ok ? "📳 Shake your phone for a splash!" : "📳 Needs motion permission");
  };

  const pick = (id: FestivalId) => {
    onPickFestival(id);
    if (id !== "off") {
      notify(`${FESTIVALS[id].emoji} ${FESTIVALS[id].label} mode!`);
      petOnFestival(id);
    }
  };

  const toggleDayNight = () => {
    onToggleDayNight();
    if (!dayNightAuto) {
      const info = getDayNight(new Date());
      notify(`${info.phaseEmoji} ${info.phaseName} in Kolkata`);
    }
  };

  const name = pet.names[pet.species];

  const togglePet = () => {
    onTogglePet();
    notify(petOn ? `👾 ${name} napping…` : `👾 ${name} is here!`);
  };

  const renamePet = () => {
    const next = window.prompt(`Name your ${pet.species}:`, name);
    if (next && next.trim()) setPetName(pet.species, next);
  };

  // Bloop evolution progress (cat & dog never evolve).
  const evoNext = pet.stage < 3 ? EVO_THRESHOLDS[pet.stage]! : null;
  const evoPrev = pet.stage === 0 ? 0 : EVO_THRESHOLDS[pet.stage - 1]!;
  const evoPct = evoNext ? Math.min(100, ((pet.minutes - evoPrev) / (evoNext - evoPrev)) * 100) : 100;

  // 💞 Bond hearts for the active species.
  const bond = pet.bond[pet.species];
  const bondFull = Math.round(bond / 20);
  const bondHearts = "❤️".repeat(bondFull) + "🤍".repeat(5 - bondFull);

  const dayInfo = dayNightAuto ? getDayNight(new Date()) : null;

  return (
    <div className="panel fun-panel">
      <button className="fun-close" onClick={onClose} aria-label="Close fun panel">
        ✕
      </button>
      <h2 className="fun-title">🎪 Fun Zone</h2>

      <div className="fun-section">
        <div className="beat-row beat-modes">
          <button
            className={`beat-pill beat-pill-btn ${petOn ? "is-active" : ""}`}
            onClick={togglePet}
            title="A cute pet that dances to your beat"
          >
            👾 Pet
          </button>
          <button
            className="beat-pill beat-pill-btn"
            onClick={onOpenBattle}
            title="2-player tap battle — 15 seconds, fastest taps win!"
          >
            ⚔️ Battle
          </button>
          {isShakeSupported() && (
            <button
              className={`beat-pill beat-pill-btn ${shakeOn ? "is-active" : ""}`}
              onClick={() => void toggleShake()}
              title="Shake your phone = dye splash"
            >
              📳 Shake
            </button>
          )}
        </div>
      </div>

      <div className="fun-section">
        <div className="pet-dash-head">
          <span className="beat-sens-label">🐾 {name}</span>
          <button
            className="beat-pill beat-pill-btn"
            onClick={renamePet}
            title="Rename your pet"
          >
            ✏️
          </button>
        </div>
        <div className="beat-row pet-species">
          {SPECIES_META.map((s) => (
            <button
              key={s.id}
              className={`beat-pill beat-pill-btn pet-card ${pet.species === s.id ? "is-active" : ""}`}
              onClick={() => setPetSpecies(s.id)}
              title={s.id === "blob" ? "Bloop evolves as you listen! 🧬" : "No evolutions — perfect already 😎"}
            >
              <span className="pet-card-preview">
                {s.id === "blob" ? (
                  <span className="mini-blob" />
                ) : s.id === "cat" ? (
                  <CatArt
                    mood="happy"
                    blink={false}
                    asleep={false}
                    dancing={false}
                    tempo={0.5}
                    scale={1}
                    look={{ x: 0, y: 0 }}
                  />
                ) : (
                  <DogArt
                    mood="happy"
                    blink={false}
                    asleep={false}
                    dancing={false}
                    tempo={0.5}
                    scale={1}
                    look={{ x: 0, y: 0 }}
                  />
                )}
              </span>{" "}
              {s.label}
            </button>
          ))}
        </div>
        <div className="pet-stats">
          {statRow("🍗", pet.hunger)}
          {statRow("🎾", pet.fun)}
          {statRow("⚡", pet.energy)}
        </div>
        <div className="beat-row beat-modes">
          <span className="beat-sens-label">🍽️ Feed</span>
          {FOOD_LIST.map((f) => {
            const fav = FAVORITE_FOOD[pet.species] === f;
            return (
              <button
                key={f}
                className="beat-pill beat-pill-btn"
                onClick={() => feedPetFood(f)}
                title={fav ? `${name}'s FAVORITE! Extra yummy 💕` : "A tasty snack"}
              >
                {FOOD_EMOJI[f]}{fav ? "⭐" : ""}
              </button>
            );
          })}
          <button className="beat-pill beat-pill-btn" onClick={playWithPet} title="Pet it (+fun)">
            👋 Pet
          </button>
        </div>
        <div className="beat-row beat-modes">
          <span className="beat-sens-label">🎪 Tricks</span>
          {TRICKS.map((t) => (
            <button
              key={t.id}
              className="beat-pill beat-pill-btn"
              onClick={() => doTrick(t.id)}
              title="Costs 4 energy — needs the pet awake!"
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
        <div className="beat-row beat-modes">
          <button
            className={`beat-pill beat-pill-btn ${pet.party ? "is-active" : ""}`}
            onClick={() => setPetParty(!pet.party)}
            title="All 3 pets on screen together!"
          >
            👯 Party
          </button>
          <button
            className="beat-pill beat-pill-btn"
            onClick={onPhoto}
            title="Hide all UI for a clean pet + fluid photo"
          >
            📸 Pose!
          </button>
          <button
            className={`beat-pill beat-pill-btn ${pet.wander ? "is-active" : ""}`}
            onClick={() => setPetWander(!pet.wander)}
            title="Pet roams around on its own"
          >
            🚶 {pet.wander ? "Roaming" : "Wander"}
          </button>
          <button
            className={`beat-pill beat-pill-btn ${pet.sound ? "is-active" : ""}`}
            onClick={() => setPetSound(!pet.sound)}
            title="Cute sounds on/off"
          >
            {pet.sound ? "🔊" : "🔇"}
          </button>
          <button
            className="beat-pill beat-pill-btn"
            onClick={resetPetPos}
            title="Move pet back to its corner"
          >
            📍
          </button>
        </div>
        {pet.species === "blob" && (
          <div className="pet-evo">
            <span className="pet-evo-label">
              {pet.stage < 3 ? (
                <>
                  🧬 {Math.floor(pet.minutes)}/{evoNext} min → {EVO_EMOJI[pet.stage + 1]}{" "}
                  {EVO_NAMES[pet.stage + 1]}
                </>
              ) : (
                <>👑 MAX — Legendary Bloop! ({Math.floor(pet.minutes)} min vibed)</>
              )}
            </span>
            <div className="pet-bar">
              <div className="pet-fill evo" style={{ width: `${evoPct}%` }} />
            </div>
          </div>
        )}
        <div className="beat-row beat-modes">
          <span className="beat-sens-label">🎩 Hat</span>
          {HAT_LIST.map((h) => (
            <button
              key={h}
              className={`beat-pill beat-pill-btn ${pet.hat === h ? "is-active" : ""}`}
              onClick={() => setPetHat(h)}
              title={h === "none" ? "No hat" : `Wear the ${h} hat`}
            >
              {h === "none" ? "🚫" : HAT_EMOJI[h]}
            </button>
          ))}
        </div>
        <p className="beat-hint">
          💞 Bond: {bondHearts} ({bond}%)
          {bond >= 100 ? " — BEST FRIENDS!" : ""}
        </p>
        <p className="beat-hint">🔥 {pet.streak}-day streak with {name}!</p>
        {pet.asleep ? (
          <p className="beat-hint">💤 Shhh… {name} is sleeping (wakes 6:30am)</p>
        ) : (
          <p className="beat-hint">💡 Drag {name} anywhere! Double-click it to rename.</p>
        )}
      </div>

      <div className="fun-section">
        <PianoPads />
      </div>

      <div className="fun-section">
        <div className="beat-row beat-modes">
          <span className="beat-sens-label">Festival</span>
          <button
            className={`beat-pill beat-pill-btn ${festival === "off" ? "is-active" : ""}`}
            onClick={() => pick("off")}
          >
            Off
          </button>
          {(Object.keys(FESTIVALS) as Array<keyof typeof FESTIVALS>).map((id) => (
            <button
              key={id}
              className={`beat-pill beat-pill-btn ${festival === id ? "is-active" : ""}`}
              onClick={() => pick(id)}
              title={FESTIVALS[id].blurb}
            >
              {FESTIVALS[id].emoji} {FESTIVALS[id].label}
            </button>
          ))}
        </div>
        {festival !== "off" && <p className="beat-hint">{FESTIVALS[festival].blurb} 🎉</p>}
      </div>

      <div className="fun-section">
        <div className="beat-row beat-modes">
          <button
            className={`beat-pill beat-pill-btn ${dayNightAuto ? "is-active" : ""}`}
            onClick={toggleDayNight}
            title="Fluid colours follow the Kolkata sun"
          >
            🌗 Auto day/night
          </button>
          {dayInfo && (
            <span className="beat-hint">
              {dayInfo.phaseEmoji} {dayInfo.phaseName}
            </span>
          )}
        </div>
      </div>

      <p className="beat-hint">💡 Double-tap the fluid for a colour blast!</p>

      {toast && <div className="player-toast">{toast}</div>}
    </div>
  );
}

export default FunPanel;
