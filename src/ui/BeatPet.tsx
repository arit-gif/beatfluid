import { useEffect, useRef, useState } from "react";
import { subscribeBeat, type BeatSnapshot } from "../shared/beat";
import {
  EVO_EMOJI,
  EVO_NAMES,
  HAT_EMOJI,
  consumeMissedYou,
  getPetSnapshot,
  grumblePet,
  playWithPet,
  setPetName,
  setPetPos,
  stageFor,
  startPetEngine,
  subscribePet,
  type PetSnapshot,
  type PetSpecies,
  type PetTrick,
} from "../shared/pet";
import { BlobArt, CatArt, DogArt, type PetMood } from "./PetArt";
import { fireBlast } from "../shared/blast";
import "./beat-pet.css";

const BADGE: Record<PetMood, string> = {
  love: "❤️",
  happy: "",
  sad: "💧",
  angry: "‼️",
  tired: "💤",
  hungry: "🍗",
  sleep: "💤",
};

const DOG_BADGE: Record<PetMood, string> = { ...BADGE, sad: "🥺", angry: "😤" };

/** 💭 What each species dreams about while asleep. */
const DREAMS: Record<PetSpecies, string[]> = {
  blob: ["🎵💭", "infinite beats… 💭", "boop dreams… 🫧💭"],
  cat: ["🐟💭", "chasing mice… 🐭💭", "endless naps… 😴💭"],
  dog: ["🦴💭", "running free… 🏃💭", "belly rubs… 💭"],
};

const ALL_SPECIES: PetSpecies[] = ["blob", "cat", "dog"];

export function BeatPet() {
  const [snap, setSnap] = useState<BeatSnapshot>({
    pulse: 0,
    bass: 0,
    source: "bpm",
    bpm: 96,
    kicked: false,
  });
  const [pet, setPet] = useState<PetSnapshot>(getPetSnapshot);
  const [squash, setSquash] = useState(false);
  const [blink, setBlink] = useState(false);
  const [grumpy, setGrumpy] = useState(false);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [bub, setBub] = useState<{ id: number; text: string } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [trick, setTrick] = useState<PetTrick | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const bubbleTimer = useRef(0);
  const drag = useRef<{
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    moved: boolean;
    live: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    startPetEngine();
    return subscribePet(setPet);
  }, []);
  useEffect(() => subscribeBeat(setSnap), []);

  // Welcome back: "you left me?!" wins, else the streak celebration.
  useEffect(() => {
    const s = getPetSnapshot();
    if (s.missedYou) {
      consumeMissedYou();
      showLocalBubble("you left me?! 😭");
    } else if (s.streak >= 2) {
      showLocalBubble(`Day ${s.streak} with ${s.names[s.species]}! 🔥`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Store-driven speech bubbles.
  useEffect(() => {
    if (!pet.bubble) return;
    const id = pet.bubble.id;
    setBub(pet.bubble);
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => {
      setBub((cur) => (cur && cur.id === id ? null : cur));
    }, 2400);
  }, [pet.bubble]);

  // 🧬 Evolution ceremony: flash + staggered fluid blasts.
  useEffect(() => {
    if (!pet.evolving) return;
    setCelebrating(true);
    blastAtPet(1.2);
    const t1 = window.setTimeout(() => blastAtPet(1), 350);
    const t2 = window.setTimeout(() => blastAtPet(0.9), 700);
    const t3 = window.setTimeout(() => setCelebrating(false), 3400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pet.evolving]);

  // 🎪 Tricks: play the animation, then release back to idle/dance.
  useEffect(() => {
    if (!pet.trick) return;
    setTrick(pet.trick.kind);
    const t = window.setTimeout(() => setTrick(null), 950);
    return () => window.clearTimeout(t);
  }, [pet.trick]);

  // Random blinking.
  useEffect(() => {
    let alive = true;
    let timer = 0;
    let closeTimer = 0;
    const loop = () => {
      timer = window.setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        closeTimer = window.setTimeout(() => {
          if (alive) setBlink(false);
        }, 140);
        loop();
      }, 1800 + Math.random() * 3200);
    };
    loop();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.clearTimeout(closeTimer);
    };
  }, []);

  // Eyes follow the cursor a little.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      setLook({
        x: Math.max(-1, Math.min(1, (event.clientX - cx) / 220)),
        y: Math.max(-1, Math.min(1, (event.clientY - cy) / 220)),
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // 🚶 Wander mode: glide to a random spot every 9–16s.
  useEffect(() => {
    if (!pet.wander || pet.asleep || dragPos) return;
    let dead = false;
    let t = 0;
    const hop = () => {
      t = window.setTimeout(() => {
        if (dead) return;
        setPetPos(0.08 + Math.random() * 0.84, 0.14 + Math.random() * 0.66);
        hop();
      }, 9000 + Math.random() * 7000);
    };
    hop();
    return () => {
      dead = true;
      window.clearTimeout(t);
    };
  }, [pet.wander, pet.asleep, dragPos]);

  // 💭 Dream bubbles while asleep (every 22–42s).
  useEffect(() => {
    if (!pet.asleep) return;
    let dead = false;
    let t = 0;
    const loop = () => {
      t = window.setTimeout(() => {
        if (dead) return;
        const lines = DREAMS[pet.species];
        showLocalBubble(lines[Math.floor(Math.random() * lines.length)]!);
        loop();
      }, 22000 + Math.random() * 20000);
    };
    loop();
    return () => {
      dead = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pet.asleep, pet.species]);

  function showLocalBubble(text: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setBub({ id, text });
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => {
      setBub((cur) => (cur && cur.id === id ? null : cur));
    }, 2400);
  }

  function blastAtPet(power: number) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    fireBlast(
      (r.left + r.width / 2) / window.innerWidth,
      1 - (r.top + r.height / 2) / window.innerHeight,
      power
    );
  }

  function tapPet() {
    if (pet.asleep) {
      grumblePet();
      setGrumpy(true);
      window.setTimeout(() => setGrumpy(false), 2200);
      setSquash(true);
      window.setTimeout(() => setSquash(false), 180);
      return;
    }
    blastAtPet(0.7);
    playWithPet();
    setSquash(true);
    window.setTimeout(() => setSquash(false), 180);
  }

  function rename() {
    const next = window.prompt(`Name your ${pet.species}:`, pet.names[pet.species]);
    if (next && next.trim()) setPetName(pet.species, next);
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    drag.current = {
      sx: e.clientX,
      sy: e.clientY,
      ox: pet.pos.x,
      oy: pet.pos.y,
      moved: false,
      live: { ...pet.pos },
    };
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 7) return;
    d.moved = true;
    d.live = {
      x: Math.min(0.94, Math.max(0.06, d.ox + (e.clientX - d.sx) / window.innerWidth)),
      y: Math.min(0.88, Math.max(0.12, d.oy + (e.clientY - d.sy) / window.innerHeight)),
    };
    setDragPos(d.live);
  }

  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) {
      setDragPos(null);
      return;
    }
    if (d.moved) {
      setPetPos(d.live.x, d.live.y);
    } else {
      tapPet();
    }
    setDragPos(null);
  }

  function onCancel() {
    drag.current = null;
    setDragPos(null);
  }

  const pos = dragPos ?? pet.pos;
  const dancing = pet.musicPlaying && !pet.asleep;
  const tempo = 60 / Math.max(50, snap.bpm);
  const scale = 1 + snap.pulse * 0.18;
  const mood: PetMood = pet.asleep
    ? "sleep"
    : grumpy
      ? "angry"
      : squash
        ? "love"
        : pet.hunger < 25
          ? "hungry"
          : pet.fun < 25
            ? "sad"
            : pet.energy < 20
              ? "tired"
              : "happy";

  const badge =
    pet.species === "blob"
      ? BADGE[mood]
      : pet.species === "dog"
        ? DOG_BADGE[mood]
        : mood === "hungry"
          ? "🍗"
          : mood === "tired" || mood === "sleep"
            ? "💤"
            : "";
  const hat =
    pet.species === "blob" && pet.stage === 3 && pet.hat === "none"
      ? "👑"
      : HAT_EMOJI[pet.hat];
  const name = pet.names[pet.species];
  const artProps = { mood, blink, asleep: pet.asleep, dancing, tempo, scale, look };

  // 👯 Party guests: the other two species, lined up beside the main pet.
  const guests = ALL_SPECIES.filter((s) => s !== pet.species);
  const guestDir = pos.x > 0.5 ? -1 : 1;
  const guestStage = stageFor(pet.minutes);
  const guestProps = {
    mood: (pet.asleep ? "sleep" : "happy") as PetMood,
    blink: false,
    asleep: pet.asleep,
    dancing,
    tempo,
    scale,
    look: { x: 0, y: 0 },
  };

  return (
    <>
      <div
        ref={ref}
        className={
          `beat-pet species-${pet.species}` +
          (dragPos ? " dragging" : "") +
          (squash ? " squash" : "") +
          (pet.asleep ? " asleep" : "") +
          (celebrating ? " celebrating" : "") +
          (grumpy ? " grumpy" : "") +
          (trick ? ` trick-${trick}` : "")
        }
        style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onDoubleClick={rename}
        title={`${name} — drag me anywhere! (double-click to rename)`}
      >
        {bub && (
          <div className="pet-bubble" key={bub.id}>
            {bub.text}
          </div>
        )}
        {hat && <div className="pet-hat">{hat}</div>}
        {badge && <div className="pet-badge">{badge}</div>}
        {celebrating && <div className="pet-flash" />}
        {pet.species === "blob" ? (
          <BlobArt stage={pet.stage} {...artProps} />
        ) : pet.species === "cat" ? (
          <CatArt {...artProps} />
        ) : (
          <DogArt {...artProps} />
        )}
        <div className="pet-name">{name}</div>
        {pet.species === "blob" && (
          <div className="pet-stage">
            {EVO_EMOJI[pet.stage]} {EVO_NAMES[pet.stage]}
          </div>
        )}
      </div>
      {pet.party &&
        guests.map((g, i) => (
          <div
            key={g}
            className="pet-guest"
            style={{
              left: `calc(${pos.x * 100}% + ${guestDir * (92 + i * 92)}px)`,
              top: `calc(${pos.y * 100}% + ${i === 0 ? -14 : 10}px)`,
            }}
          >
            {g === "blob" ? (
              <BlobArt stage={guestStage} {...guestProps} />
            ) : g === "cat" ? (
              <CatArt {...guestProps} />
            ) : (
              <DogArt {...guestProps} />
            )}
            <div className="pet-name">{pet.names[g]}</div>
          </div>
        ))}
    </>
  );
}

export default BeatPet;
