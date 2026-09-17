/**
 * Splash blasts — double-tap / shake-the-phone dye explosions.
 * The fluid simulation hijacks emitter A to the blast point for ~1s,
 * so no shader changes were needed.
 */

export interface Blast {
  x: number; // 0..1
  y: number; // 0..1 (fluid coords: 0 = bottom)
  power: number; // 0..1, decayed by age
  /** Optional RGB (0..1) override — piano keys & battle teams splash in colour. */
  color?: [number, number, number];
}

let current: {
  x: number;
  y: number;
  at: number;
  strength: number;
  color?: [number, number, number];
} | null = null;

const TTL_MS = 1000;

export function fireBlast(
  x: number,
  y: number,
  strength = 1,
  color?: [number, number, number]
): void {
  current = {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
    at: performance.now(),
    strength: Math.min(1.5, Math.max(0.3, strength)),
    color,
  };
}

/** Called once per frame by the simulation. Returns null when idle/expired. */
export function getBlast(): Blast | null {
  if (!current) return null;
  const age = performance.now() - current.at;
  if (age >= TTL_MS) {
    current = null;
    return null;
  }
  // Fast attack, smooth release.
  const k = 1 - age / TTL_MS;
  return { x: current.x, y: current.y, power: current.strength * k * k, color: current.color };
}

// ---------------------------------------------------------------------------
// Shake detection (needs HTTPS — Netlify is HTTPS ✓, localhost works too)
// ---------------------------------------------------------------------------

let stopFn: (() => void) | null = null;

export function isShakeSupported(): boolean {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

export function isShakeOn(): boolean {
  return stopFn !== null;
}

/**
 * Must be called from a user gesture (iOS permission rule).
 * Returns true if shake listening is now active.
 */
export async function enableShake(): Promise<boolean> {
  const DME = DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<string>;
  };
  if (typeof DME.requestPermission === "function") {
    try {
      const result = await DME.requestPermission();
      if (result !== "granted") return false;
    } catch {
      return false;
    }
  }
  if (stopFn) return true;
  let lastFire = 0;
  let lx = 0;
  let ly = 0;
  let lz = 0;
  let primed = false;
  const handler = (event: DeviceMotionEvent) => {
    const a = event.accelerationIncludingGravity;
    if (!a) return;
    const x = a.x ?? 0;
    const y = a.y ?? 0;
    const z = a.z ?? 0;
    if (!primed) {
      lx = x;
      ly = y;
      lz = z;
      primed = true;
      return;
    }
    const jerk = Math.abs(x - lx) + Math.abs(y - ly) + Math.abs(z - lz);
    lx = x;
    ly = y;
    lz = z;
    const now = performance.now();
    if (jerk > 26 && now - lastFire > 1200) {
      lastFire = now;
      fireBlast(0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6, 1);
    }
  };
  window.addEventListener("devicemotion", handler);
  stopFn = () => window.removeEventListener("devicemotion", handler);
  return true;
}

export function disableShake(): void {
  stopFn?.();
  stopFn = null;
}
