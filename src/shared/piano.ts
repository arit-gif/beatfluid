/**
 * Toy piano — 8 keys on a pentatonic scale (C D E G A C D E), so every
 * combination sounds good. Each key plays a soft synth note AND splashes
 * its colour into the fluid. Zero audio assets — pure WebAudio.
 */

import { fireBlast } from "./blast";

export const KEY_CODES = ["a", "s", "d", "f", "g", "h", "j", "k"];
export const KEY_LABELS = ["C", "D", "E", "G", "A", "C", "D", "E"];

const FREQS = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

export const KEY_CSS = [
  "#ff5252",
  "#ff9800",
  "#ffee58",
  "#69f0ae",
  "#40c4ff",
  "#7c4ff",
  "#e040fb",
  "#ff80ab",
];

const KEY_RGB: Array<[number, number, number]> = [
  [1, 0.32, 0.32],
  [1, 0.6, 0],
  [1, 0.93, 0.35],
  [0.41, 0.94, 0.68],
  [0.25, 0.77, 1],
  [0.49, 0.3, 1],
  [0.88, 0.25, 0.98],
  [1, 0.5, 0.67],
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensureCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

/** Plays key i (0–7) + splashes its colour across the fluid. */
export function playPianoKey(i: number): void {
  if (i < 0 || i >= FREQS.length) return;
  const ac = ensureCtx();
  const t = ac.currentTime;
  const freq = FREQS[i]!;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.5, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  gain.connect(master!);

  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  osc.connect(gain);
  osc.start(t);
  osc.stop(t + 1);

  const shimmer = ac.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.value = freq * 2;
  const shimmerGain = ac.createGain();
  shimmerGain.gain.value = 0.18;
  shimmer.connect(shimmerGain);
  shimmerGain.connect(gain);
  shimmer.start(t);
  shimmer.stop(t + 1);

  fireBlast((i + 0.5) / FREQS.length, 0.35, 0.9, KEY_RGB[i]);
}

/** Tiny happy blip for the beat pet. */
export function boop(): void {
  const ac = ensureCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(500, t);
  osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(gain);
  gain.connect(master!);
  osc.start(t);
  osc.stop(t + 0.25);
}
