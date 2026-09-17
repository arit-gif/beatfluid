/**
 * Beat engine — the single source of truth for "how hard is the music
 * hitting right now" (0..1, refreshed every animation frame).
 *
 * Why this file exists:
 * Your audio plays inside YouTube's cross-origin iframe, which the browser
 * deliberately does NOT let us analyse with Web Audio (no AnalyserNode tap
 * possible). So true per-sample beat tracking of the YouTube stream is
 * impossible by design. This engine gives you the three workarounds,
 * in order of "realness":
 *
 *  1. BPM CLOCK (default, no permission needed) — pulses exactly on a tempo
 *     you set per playlist (or tap with the TAP button). Fake, but perfectly
 *     in time with most Bollywood/pop tracks once the BPM matches.
 *  2. MIC LISTEN (1 click, needs mic permission) — listens to whatever is
 *     actually coming out of the speakers (YouTube included) and detects
 *     real kicks/bass. This IS the real beat, via the microphone path.
 *  3. LOCAL FILE (most accurate) — user drops an MP3, we play it through
 *     <audio> + AnalyserNode, so we get sample-accurate bass + kick data.
 *
 * The fluid simulation calls getBeatPulse() once per frame; UI components
 * call subscribeBeat() to re-render dots/bars.
 */

export type BeatSource = "bpm" | "mic" | "file";

export interface BeatSnapshot {
  /** 0..1 — 1.0 exactly on a kick/downbeat, decays fast. Drive splats with this. */
  pulse: number;
  /** 0..1 — smoothed bass energy. Drive glow/size with this. */
  bass: number;
  /** Which source produced this frame's numbers. */
  source: BeatSource;
  /** Current BPM clock value (also used as fallback tempo). */
  bpm: number;
  /** True for one frame when a kick is detected. */
  kicked: boolean;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let bpm = 96; // sensible default for Hindi/Bengali pop
let source: BeatSource = "bpm";
let playing = false;

// BPM clock
let clockStart = performance.now();
let tapTimes: number[] = [];

// Analyser (shared by mic + file modes)
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let micStream: MediaStream | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;

// Kick detection
let bassSmooth = 0;
let pulse = 0;
let kickedFlag = false;
let lastKickAt = 0;
let sensitivity = 1.0; // 0.5..2.0 from UI slider

// Subscribers (tiny store, no dependency)
type Listener = (snap: BeatSnapshot) => void;
const listeners = new Set<Listener>();
let lastSnap: BeatSnapshot = { pulse: 0, bass: 0, source, bpm, kicked: false };

// ---------------------------------------------------------------------------
// Public API — settings
// ---------------------------------------------------------------------------

export function getBpm(): number {
  return bpm;
}

export function setBpm(next: number): void {
  bpm = Math.min(200, Math.max(50, Math.round(next)));
  clockStart = performance.now(); // restart phase so UI dot snaps to beat
}

export function getBeatSource(): BeatSource {
  return source;
}

export function setPlaying(isPlaying: boolean): void {
  playing = isPlaying;
  if (!isPlaying) {
    pulse = 0;
    bassSmooth = 0;
  }
}

export function setSensitivity(value: number): void {
  sensitivity = Math.min(2, Math.max(0.4, value));
}

export function getSensitivity(): number {
  return sensitivity;
}

/** Tap-tempo: call on each TAP press; after 3+ taps BPM is recomputed. */
export function tapTempo(): number {
  const now = performance.now();
  // Reset if gap > 2s (user started a new tapping run)
  if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1]! > 2000) {
    tapTimes = [];
  }
  tapTimes.push(now);
  if (tapTimes.length > 8) tapTimes.shift();
  if (tapTimes.length >= 3) {
    const gaps: number[] = [];
    for (let i = 1; i < tapTimes.length; i++) {
      gaps.push(tapTimes[i]! - tapTimes[i - 1]!);
    }
    gaps.sort((a, b) => a - b);
    // Median gap is robust against one sloppy tap
    const median = gaps[Math.floor(gaps.length / 2)]!;
    setBpm(60000 / median);
  }
  return bpm;
}

// ---------------------------------------------------------------------------
// Public API — audio sources
// ---------------------------------------------------------------------------

function ensureContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

function ensureAnalyser(ctx: AudioContext): AnalyserNode {
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256; // 128 bins — plenty for kick/bass, cheap per frame
    analyser.smoothingTimeConstant = 0.75;
    freqData = new Uint8Array(analyser.frequencyBinCount);
  }
  return analyser;
}

/**
 * MIC MODE — listens to the room/speakers. Works with YouTube playback,
 * Bluetooth speakers, anything audible. Needs a user gesture + permission.
 */
export async function startMicMode(): Promise<void> {
  const ctx = ensureContext();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  stopMicStreamOnly();
  micStream = stream;
  const analyserNode = ensureAnalyser(ctx);
  const src = ctx.createMediaStreamSource(stream);
  src.connect(analyserNode);
  source = "mic";
}

/** Returns to BPM-clock mode (keeps AudioContext for later reuse). */
export function stopMicMode(): void {
  stopMicStreamOnly();
  if (source === "mic") source = "bpm";
}

function stopMicStreamOnly(): void {
  if (micStream) {
    for (const track of micStream.getTracks()) track.stop();
    micStream = null;
  }
}

/**
 * FILE MODE — wire a playing <audio> element through an AnalyserNode.
 * Returns a cleanup function. Call it on pause/unmount/track change.
 */
export function attachFileElement(el: HTMLAudioElement): () => void {
  const ctx = ensureContext();
  const analyserNode = ensureAnalyser(ctx);
  const src = ctx.createMediaElementSource(el);
  src.connect(analyserNode);
  analyserNode.connect(ctx.destination);
  source = "file";
  return () => {
    try {
      src.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      analyserNode.disconnect();
    } catch {
      /* already disconnected */
    }
    if (source === "file") source = "bpm";
  };
}

// ---------------------------------------------------------------------------
// Per-frame update — call from the fluid loop (cheap: ~128-bin FFT read)
// ---------------------------------------------------------------------------

function readBass(): number {
  if (!analyser || !freqData) return 0;
  analyser.getByteFrequencyData(freqData);
  // Bins 1..8 ≈ 60–250 Hz at 48kHz/256-FFT — the kick/bass zone.
  // Skip bin 0 (DC/rumble).
  let sum = 0;
  const lo = 1;
  const hi = Math.min(8, freqData.length - 1);
  for (let i = lo; i <= hi; i++) sum += freqData[i]!;
  return sum / ((hi - lo + 1) * 255); // 0..1
}

/** Exposed for the mini visualizer bars in the player UI. */
export function getFrequencyData(): Uint8Array<ArrayBuffer> | null {
  return freqData;
}

function bpmPulse(now: number): number {
  if (!playing) return 0;
  const beatMs = 60000 / bpm;
  const elapsed = (now - clockStart) % beatMs;
  const phase = elapsed / beatMs; // 0 right on beat → 1 just before next
  // Sharp attack, smooth release: looks like a heartbeat on the fluid.
  return Math.pow(1 - phase, 2.2);
}

/**
 * Call once per animation frame (from simulation.ts). Returns the snapshot
 * and notifies UI subscribers (throttled to ~15fps so React doesn't melt).
 */
let lastNotify = 0;
export function getBeatPulse(): BeatSnapshot {
  const now = performance.now();
  kickedFlag = false;

  if (source === "bpm") {
    pulse = bpmPulse(now);
    // Fake a gentle bass bed so glow never looks dead while playing.
    bassSmooth += (pulse * 0.7 - bassSmooth) * 0.2;
  } else {
    const bass = readBass();
    // Adaptive kick detector: sudden rise over the smoothed floor = kick.
    // Threshold scales with sensitivity slider.
    const threshold = 0.12 / sensitivity + bassSmooth * 0.35;
    const isKick = playing && bass - bassSmooth > threshold && now - lastKickAt > 240;
    if (isKick) {
      lastKickAt = now;
      kickedFlag = true;
      pulse = 1;
    } else {
      // Fast decay (~8 frames) so each kick reads as a distinct thump.
      pulse *= 0.82;
    }
    bassSmooth += (bass - bassSmooth) * 0.25;
  }

  lastSnap = { pulse, bass: bassSmooth, source, bpm, kicked: kickedFlag };

  if (now - lastNotify > 66 && listeners.size > 0) {
    lastNotify = now;
    for (const fn of listeners) fn(lastSnap);
  }
  return lastSnap;
}

export function subscribeBeat(fn: Listener): () => void {
  listeners.add(fn);
  fn(lastSnap);
  return () => {
    listeners.delete(fn);
  };
}
