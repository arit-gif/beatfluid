/**
 * Pet 2.0 — species, Tamagotchi care, Bloop evolution, foods, tricks,
 * bond hearts, streaks, party mode + synth sounds.
 *
 * Design notes:
 * - Tiny pub/sub store (same pattern as room.ts), persisted to localStorage.
 * - Blob (Bloop) evolves with YOUR total listening minutes: 30m / 1h / 2h.
 *   Cat & dog never evolve (user's orders 🫡) — they earn bond hearts instead.
 * - Care stats decay in real time — even while you're away (offline decay).
 * - All sounds are synthesized WebAudio blips. Zero assets, mutable.
 */

export type PetSpecies = "blob" | "cat" | "dog";
export type PetHat = "none" | "party" | "cap" | "tophat" | "grad" | "flower";
export type PetFood = "fish" | "bone" | "candy";
export type PetTrick = "roll" | "spin" | "five";

/** Listening-minutes at which Baby Bloop evolves: stage 0→1→2→3 (Legendary). */
export const EVO_THRESHOLDS = [30, 60, 120];
export const EVO_NAMES = ["Baby Bloop", "Bloop", "Super Bloop", "Legendary Bloop"];
export const EVO_EMOJI = ["🫧", "✨", "🌟", "👑"];

export const HAT_EMOJI: Record<PetHat, string> = {
  none: "",
  party: "🎉",
  cap: "🧢",
  tophat: "🎩",
  grad: "🎓",
  flower: "🌸",
};
export const HAT_LIST: PetHat[] = ["none", "party", "cap", "tophat", "grad", "flower"];

export const FOOD_EMOJI: Record<PetFood, string> = {
  fish: "🐟",
  bone: "🦴",
  candy: "🍬",
};
export const FOOD_LIST: PetFood[] = ["fish", "bone", "candy"];
/** Each species' favorite food (+50% hunger, extra love). */
export const FAVORITE_FOOD: Record<PetSpecies, PetFood> = {
  blob: "candy",
  cat: "fish",
  dog: "bone",
};

export interface PetSnapshot {
  species: PetSpecies;
  names: Record<PetSpecies, string>;
  hunger: number;
  fun: number;
  energy: number;
  /** Position as fractions of the viewport (0..1). */
  pos: { x: number; y: number };
  wander: boolean;
  sound: boolean;
  hat: PetHat;
  party: boolean;
  /** Total music-listening minutes (float). Feeds Bloop's evolution. */
  minutes: number;
  /** Blob evolution stage, derived from minutes. */
  stage: 0 | 1 | 2 | 3;
  /** Permanent love per species (0..100) — NOT evolution, just bond. 💞 */
  bond: Record<PetSpecies, number>;
  /** Consecutive days opening the app. */
  streak: number;
  asleep: boolean;
  musicPlaying: boolean;
  bubble: { id: number; text: string } | null;
  evolving: { stage: number; id: number } | null;
  trick: { kind: PetTrick; id: number } | null;
  missedYou: boolean;
}

const STORE_KEY = "fluid-fun:pet2";
const LEGACY_NAME_KEY = "fluid-fun:petname";

interface Persist {
  species: PetSpecies;
  names: Record<PetSpecies, string>;
  hunger: number;
  fun: number;
  energy: number;
  pos: { x: number; y: number };
  wander: boolean;
  sound: boolean;
  hat: PetHat;
  party: boolean;
  minutes: number;
  /** Highest evolution stage the ceremony has played for. */
  evoShown: number;
  bond: Record<PetSpecies, number>;
  bondMax: Record<PetSpecies, boolean>;
  streak: number;
  lastDay: string;
  lastSeen: number;
}

const DEFAULT_POS = { x: 0.1, y: 0.8 };

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function clamp100(v: number): number {
  return Math.min(100, Math.max(0, v));
}

type Listener = (snap: PetSnapshot) => void;
const listeners = new Set<Listener>();

let bubble: PetSnapshot["bubble"] = null;
let evolving: PetSnapshot["evolving"] = null;
let trick: PetSnapshot["trick"] = null;
let missedYou = false;
let bubbleId = 0;
let evoId = 0;
let trickId = 0;
let musicPlaying = false;
let sleepHint = false;
let lastHungrySay = 0;
let lastBondGain = 0;
let engineOn = false;

function load(): Persist {
  const base: Persist = {
    species: "blob",
    names: { blob: "Bloop", cat: "Mishti", dog: "Bhulu" },
    hunger: 80,
    fun: 80,
    energy: 90,
    pos: { ...DEFAULT_POS },
    wander: false,
    sound: true,
    hat: "none",
    party: false,
    minutes: 0,
    evoShown: 0,
    bond: { blob: 0, cat: 0, dog: 0 },
    bondMax: { blob: false, cat: false, dog: false },
    streak: 0,
    lastDay: "",
    lastSeen: Date.now(),
  };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persist>;
      if (p.species === "blob" || p.species === "cat" || p.species === "dog") {
        base.species = p.species;
      }
      if (p.names) {
        for (const k of ["blob", "cat", "dog"] as PetSpecies[]) {
          if (typeof p.names[k] === "string" && p.names[k].trim()) {
            base.names[k] = p.names[k].trim().slice(0, 12);
          }
        }
      }
      for (const k of ["hunger", "fun", "energy"] as const) {
        if (typeof p[k] === "number" && Number.isFinite(p[k])) {
          base[k] = clamp100(p[k]);
        }
      }
      if (p.pos && Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y)) {
        base.pos = { x: clamp01(p.pos.x), y: clamp01(p.pos.y) };
      }
      if (typeof p.wander === "boolean") base.wander = p.wander;
      if (typeof p.sound === "boolean") base.sound = p.sound;
      if (typeof p.hat === "string" && p.hat in HAT_EMOJI) base.hat = p.hat as PetHat;
      if (typeof p.party === "boolean") base.party = p.party;
      if (typeof p.minutes === "number" && p.minutes >= 0) {
        base.minutes = Math.min(9999, p.minutes);
      }
      if (typeof p.evoShown === "number") {
        base.evoShown = Math.min(3, Math.max(0, Math.floor(p.evoShown)));
      }
      if (p.bond) {
        for (const k of ["blob", "cat", "dog"] as PetSpecies[]) {
          if (typeof p.bond[k] === "number") base.bond[k] = clamp100(p.bond[k]);
        }
      }
      if (p.bondMax) {
        for (const k of ["blob", "cat", "dog"] as PetSpecies[]) {
          if (typeof p.bondMax[k] === "boolean") base.bondMax[k] = p.bondMax[k];
        }
      }
      if (typeof p.streak === "number" && p.streak >= 0) {
        base.streak = Math.min(9999, Math.floor(p.streak));
      }
      if (typeof p.lastDay === "string") base.lastDay = p.lastDay;
      if (typeof p.lastSeen === "number") base.lastSeen = p.lastSeen;
      // Offline decay: stats drift while you were away (capped at 24h).
      const awayHrs = Math.min(24, Math.max(0, (Date.now() - base.lastSeen) / 3600000));
      if (awayHrs > 0.05) {
        base.hunger = clamp100(base.hunger - awayHrs * 5);
        base.fun = clamp100(base.fun - awayHrs * 4);
        base.energy = clamp100(base.energy + awayHrs * 8); // rest counts for something!
        if (awayHrs > 6) missedYou = true;
      }
    } else {
      // Migrate the classic Bloop name from Pet 1.0.
      const legacy = window.localStorage.getItem(LEGACY_NAME_KEY);
      if (legacy && legacy.trim()) base.names.blob = legacy.trim().slice(0, 12);
    }
  } catch {
    /* corrupted storage → defaults */
  }
  // 🔥 Daily streak: consecutive calendar days opening the app.
  const today = new Date().toDateString();
  if (base.lastDay !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    base.streak = base.lastDay === yesterday ? base.streak + 1 : 1;
    base.lastDay = today;
  }
  base.lastSeen = Date.now();
  return base;
}

const state: Persist = load();

function save(): void {
  state.lastSeen = Date.now();
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function stageFor(minutes: number): 0 | 1 | 2 | 3 {
  if (minutes >= EVO_THRESHOLDS[2]!) return 3;
  if (minutes >= EVO_THRESHOLDS[1]!) return 2;
  if (minutes >= EVO_THRESHOLDS[0]!) return 1;
  return 0;
}

/** Bloop & friends sleep 11pm–6:30am local time. */
export function isNightHours(date = new Date()): boolean {
  const h = date.getHours() + date.getMinutes() / 60;
  return h >= 23 || h < 6.5;
}

function isAsleep(): boolean {
  return isNightHours() || sleepHint;
}

export function getPetSnapshot(): PetSnapshot {
  return {
    species: state.species,
    names: { ...state.names },
    hunger: Math.round(state.hunger),
    fun: Math.round(state.fun),
    energy: Math.round(state.energy),
    pos: { ...state.pos },
    wander: state.wander,
    sound: state.sound,
    hat: state.hat,
    party: state.party,
    minutes: state.minutes,
    stage: stageFor(state.minutes),
    bond: { ...state.bond },
    streak: state.streak,
    asleep: isAsleep(),
    musicPlaying,
    bubble,
    evolving,
    trick,
    missedYou,
  };
}

function notify(): void {
  const snap = getPetSnapshot();
  for (const fn of listeners) fn(snap);
}

export function subscribePet(fn: Listener): () => void {
  listeners.add(fn);
  fn(getPetSnapshot());
  return () => {
    listeners.delete(fn);
  };
}

// ---------------------------------------------------------------------------
// Speech
// ---------------------------------------------------------------------------

const PET_LINES: Record<PetSpecies, string[]> = {
  blob: ["boop!", "bloop~", "that tickles!", "🥁 encore!", "wheee!", "feed me beats!", "💜💜💜"],
  cat: ["meow~", "purrrr…", "*slow blink* 😻", "mrrp!", "not bad, human", "😻"],
  dog: ["woof!", "bork bork!", "🐾🐾🐾", "*tail wag*", "you're the best!", "wooo!"],
};
const FOOD_LINES: Record<PetFood, string[]> = {
  fish: ["nom nom 🐟", "fishy!! 😻", "*happy crunch*"],
  bone: ["CRONCH 🦴", "bone!! 🤤", "*tail wagging*"],
  candy: ["sweet!! 🍬", "sugar rush!! ✨", "*bouncy bouncy*"],
};
const TRACK_LINES = [
  "banger! 🔥",
  "ooh this one! 🎶",
  "turn it up! 🔊",
  "my jam!! 💃",
  "vibe check: passed ✅",
];
const TRICK_LINES: Record<PetTrick, string> = {
  roll: "wheee! 🌀",
  spin: "ta-da! 💫",
  five: "up top! ✋",
};
const EVO_LINES = ["", "I EVOLVED! ✨", "SUPER BLOOP! 🌟", "👑 LEGENDARY!! 👑"];
const HELLO_LINES: Record<PetSpecies, string> = {
  blob: "bloop's back! 🫧",
  cat: "the queen arrives 😻",
  dog: "DID SOMEBODY SAY WALK?! 🐶",
};

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function petSay(text: string): void {
  bubble = { id: ++bubbleId, text };
  notify();
}

/** Called by the music player whenever the real track changes. */
export function petOnTrack(): void {
  if (isAsleep()) return; // shhh… sleeping
  petSay(pick(TRACK_LINES));
}

export function petOnFestival(id: "puja" | "diwali" | "holi"): void {
  const map = {
    puja: "শুভ শারদীয়া! 🥁",
    diwali: "Happy Diwali! 🪔",
    holi: "Happy Holi! 🎨",
  } as const;
  petSay(map[id]);
}

export function consumeMissedYou(): void {
  missedYou = false;
}

/**
 * Bond hearts (per species, throttled to 1 gain / 20s so it can't be farmed).
 * Returns true if this gain triggered the BEST FRIENDS celebration.
 */
function gainBond(n: number): boolean {
  const now = Date.now();
  if (now - lastBondGain < 20000) return false;
  lastBondGain = now;
  const s = state.species;
  state.bond[s] = Math.min(100, state.bond[s] + n);
  if (state.bond[s] >= 100 && !state.bondMax[s]) {
    state.bondMax[s] = true;
    save();
    petSay("BEST FRIENDS!! 💞");
    fanfareSound();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function setPetSpecies(s: PetSpecies): void {
  if (state.species === s) return;
  state.species = s;
  save();
  petSay(HELLO_LINES[s]);
  tapSound(s);
}

export function setPetName(s: PetSpecies, name: string): void {
  const clean = name.trim().slice(0, 12);
  if (!clean) return;
  state.names[s] = clean;
  save();
  petSay(`call me ${clean}! 💕`);
}

/** Feed a specific snack — favorites give +50% hunger and extra love. */
export function feedPetFood(food: PetFood): void {
  const fav = FAVORITE_FOOD[state.species] === food;
  state.hunger = clamp100(state.hunger + (fav ? 34 : 22));
  state.fun = clamp100(state.fun + (fav ? 8 : 4));
  save();
  if (isAsleep()) {
    petSay("…5 more mins… 😾");
  } else if (!gainBond(fav ? 4 : 2)) {
    petSay(fav ? `${pick(FOOD_LINES[food])} MY FAVE!! 💕` : pick(FOOD_LINES[food]));
  }
  nomSound();
}

/** Classic feed = serves the current pet's favorite. */
export function feedPet(): void {
  feedPetFood(FAVORITE_FOOD[state.species]);
}

export function playWithPet(): void {
  state.fun = clamp100(state.fun + 12);
  state.energy = clamp100(state.energy - 1);
  save();
  if (!gainBond(2)) petSay(pick(PET_LINES[state.species]));
  tapSound(state.species);
}

export function grumblePet(): void {
  petSay(pick(["5 more mins… 😾", "do you MIND?! 😤", "zzz… rude.", "*grumbles*"]));
  grumbleSound();
}

/** 🎪 Tricks cost 4 energy and need the pet awake. */
export function doTrick(kind: PetTrick): void {
  if (isAsleep()) {
    petSay(pick(["not now… zzz 😴", "*snores louder*"]));
    return;
  }
  if (state.energy < 10) {
    petSay("too tired… 🥱");
    grumbleSound();
    return;
  }
  state.energy = clamp100(state.energy - 4);
  trick = { kind, id: ++trickId };
  save();
  if (!gainBond(2)) petSay(TRICK_LINES[kind]);
  trickSound(kind);
}

export function setPetPos(x: number, y: number): void {
  state.pos = { x: clamp01(x), y: clamp01(y) };
  save();
  notify();
}

export function resetPetPos(): void {
  setPetPos(DEFAULT_POS.x, DEFAULT_POS.y);
}

export function setPetWander(v: boolean): void {
  state.wander = v;
  save();
  notify();
}

export function setPetSound(v: boolean): void {
  state.sound = v;
  save();
  notify();
  if (v) popSound();
}

export function setPetHat(h: PetHat): void {
  state.hat = h;
  save();
  if (h !== "none") petSay(pick(["lookin' sharp! ✨", "how do I look? 😎", "hat day!! 🎩"]));
  else notify();
}

export function setPetParty(v: boolean): void {
  state.party = v;
  save();
  if (v) petSay(pick(["PARTY TIME!! 🎉", "squad up!! 👯", "everyone's here!! 🥳"]));
  else notify();
}

/** Called by the music player (YouTube + offline + room follow all count). */
export function setPetMusicPlaying(v: boolean): void {
  if (musicPlaying === v) return;
  musicPlaying = v;
  notify();
}

/** Called by the sleep timer — pet gets drowsy as bedtime approaches. */
export function setPetSleepHint(v: boolean): void {
  if (sleepHint === v) return;
  sleepHint = v;
  notify();
}

// ---------------------------------------------------------------------------
// Engine — 5s tick: listening minutes, decay, evolution, hunger complaints
// ---------------------------------------------------------------------------

export function startPetEngine(): void {
  if (engineOn) return;
  engineOn = true;
  // Multi-tab sync: if another tab changes the pet, adopt its state instead
  // of letting this tab's 5s tick overwrite it with stale data.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORE_KEY || !e.newValue) return;
    try {
      adoptPet(JSON.parse(e.newValue) as Persist);
    } catch {
      /* ignore */
    }
  });
  window.setInterval(() => {
    const asleep = isAsleep();
    const dtMin = 5 / 60;
    if (musicPlaying && !asleep) {
      state.minutes = Math.min(9999, state.minutes + dtMin);
      state.fun = clamp100(state.fun + dtMin * 2.5); // music feeds the soul
    }
    state.hunger = clamp100(state.hunger - dtMin * 1.1);
    if (!asleep) {
      state.fun = clamp100(state.fun - dtMin * 0.9);
      state.energy = clamp100(state.energy - dtMin * 0.7);
    } else {
      state.energy = clamp100(state.energy + dtMin * 6);
    }
    // 🧬 Evolution!
    const stage = stageFor(state.minutes);
    if (stage > state.evoShown) {
      state.evoShown = stage;
      evolving = { stage, id: ++evoId };
      petSay(EVO_LINES[stage]!);
      fanfareSound();
    }
    // Hungry complaints (throttled so it can't spam).
    if (!asleep && state.hunger < 25 && Date.now() - lastHungrySay > 5 * 60 * 1000) {
      lastHungrySay = Date.now();
      petSay(pick(["feed me 🍗", "tummy says empty 😿", "snack time?? 🍖"]));
    }
    save();
    notify();
  }, 5000);
}

/** Adopt another tab's pet state (multi-tab sync — no decay, just copy). */
function adoptPet(p: Persist): void {
  if (p.species === "blob" || p.species === "cat" || p.species === "dog") {
    state.species = p.species;
  }
  if (p.names) {
    for (const k of ["blob", "cat", "dog"] as PetSpecies[]) {
      if (typeof p.names[k] === "string" && p.names[k].trim()) {
        state.names[k] = p.names[k].trim().slice(0, 12);
      }
    }
  }
  for (const k of ["hunger", "fun", "energy"] as const) {
    if (typeof p[k] === "number" && Number.isFinite(p[k])) state[k] = clamp100(p[k]);
  }
  if (p.pos && Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y)) {
    state.pos = { x: clamp01(p.pos.x), y: clamp01(p.pos.y) };
  }
  if (typeof p.wander === "boolean") state.wander = p.wander;
  if (typeof p.sound === "boolean") state.sound = p.sound;
  if (typeof p.hat === "string" && p.hat in HAT_EMOJI) state.hat = p.hat as PetHat;
  if (typeof p.party === "boolean") state.party = p.party;
  if (typeof p.minutes === "number" && p.minutes >= 0) {
    state.minutes = Math.min(9999, p.minutes);
  }
  if (typeof p.evoShown === "number") {
    state.evoShown = Math.min(3, Math.max(0, Math.floor(p.evoShown)));
  }
  if (p.bond) {
    for (const k of ["blob", "cat", "dog"] as PetSpecies[]) {
      if (typeof p.bond[k] === "number") state.bond[k] = clamp100(p.bond[k]);
    }
  }
  if (p.bondMax) {
    for (const k of ["blob", "cat", "dog"] as PetSpecies[]) {
      if (typeof p.bondMax[k] === "boolean") state.bondMax[k] = p.bondMax[k];
    }
  }
  if (typeof p.streak === "number" && p.streak >= 0) {
    state.streak = Math.min(9999, Math.floor(p.streak));
  }
  if (typeof p.lastDay === "string") state.lastDay = p.lastDay;
  notify();
}

// ---------------------------------------------------------------------------
// Synth sounds — zero assets, all WebAudio
// ---------------------------------------------------------------------------

let actx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (!state.sound) return null;
  try {
    if (!actx) actx = new AudioContext();
    if (actx.state === "suspended") void actx.resume();
    return actx;
  } catch {
    return null;
  }
}

interface Blip {
  type: OscillatorType;
  f0: number;
  f1?: number;
  dur: number;
  vol?: number;
  delay?: number;
}

function blip({ type, f0, f1, dur, vol = 0.25, delay = 0 }: Blip): void {
  const ctx = ac();
  if (!ctx) return;
  try {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, f0), t);
    if (f1) osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  } catch {
    /* ignore */
  }
}

function popSound(): void {
  blip({ type: "sine", f0: 500, f1: 880, dur: 0.16 });
}

function meowSound(): void {
  const ctx = ac();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.linearRampToValueAtTime(880, t + 0.14);
    osc.frequency.linearRampToValueAtTime(480, t + 0.34);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    osc.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.42);
  } catch {
    /* ignore */
  }
}

function purrSound(): void {
  const ctx = ac();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 52;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 23;
    const depth = ctx.createGain();
    depth.gain.value = 0.1;
    lfo.connect(depth);
    depth.connect(g.gain);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.9);
    lfo.stop(t + 0.9);
  } catch {
    /* ignore */
  }
}

function barkSound(): void {
  blip({ type: "square", f0: 300, f1: 170, dur: 0.09, vol: 0.2 });
  blip({ type: "square", f0: 320, f1: 150, dur: 0.11, vol: 0.22, delay: 0.13 });
}

function nomSound(): void {
  blip({ type: "sine", f0: 340, f1: 150, dur: 0.1, vol: 0.3 });
  blip({ type: "sine", f0: 380, f1: 160, dur: 0.1, vol: 0.28, delay: 0.14 });
}

function grumbleSound(): void {
  blip({ type: "square", f0: 150, f1: 90, dur: 0.25, vol: 0.12 });
}

function fanfareSound(): void {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    blip({ type: "triangle", f0: f, dur: 0.22, vol: 0.25, delay: i * 0.12 })
  );
}

function trickSound(kind: PetTrick): void {
  if (kind === "roll") {
    blip({ type: "sine", f0: 600, f1: 200, dur: 0.32, vol: 0.22 });
  } else if (kind === "spin") {
    [440, 660, 880].forEach((f, i) =>
      blip({ type: "triangle", f0: f, dur: 0.14, vol: 0.22, delay: i * 0.09 })
    );
  } else {
    blip({ type: "square", f0: 1200, dur: 0.05, vol: 0.15 });
    blip({ type: "square", f0: 1500, dur: 0.06, vol: 0.18, delay: 0.12 });
  }
}

function tapSound(s: PetSpecies): void {
  if (s === "cat") {
    if (Math.random() < 0.35) purrSound();
    else meowSound();
  } else if (s === "dog") {
    barkSound();
  } else {
    popSound();
  }
}
