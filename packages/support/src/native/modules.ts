/**
 * The native modules the support block can use, as the shapes it needs. The
 * app passes the real ones (all optional peers), so the block runs without
 * any of them and the tests pass fakes:
 *
 *   import * as ViewShot from "react-native-view-shot";   // screenshots, mark-up
 *   import { Accelerometer } from "expo-sensors";          // shake to report
 */

export interface CaptureOptions {
  format?: "png" | "jpg" | "webp";
  quality?: number;
  result?: "tmpfile" | "base64" | "data-uri";
  width?: number;
  height?: number;
}

/** `react-native-view-shot`: `captureScreen` (the whole screen) and `captureRef` (one view, for flattening mark-up). */
export interface ViewShotLike {
  captureScreen(options?: CaptureOptions): Promise<string>;
  captureRef(view: unknown, options?: CaptureOptions): Promise<string>;
}

export interface AccelerometerMeasurement {
  x: number;
  y: number;
  z: number;
}

/** `expo-sensors`' `Accelerometer` (values in g). */
export interface AccelerometerLike {
  addListener(listener: (measurement: AccelerometerMeasurement) => void): { remove(): void };
  setUpdateInterval?(intervalMs: number): void;
}

export interface ShakeOptions {
  /** Acceleration, in g, that counts as a jolt. Default 2.3. */
  threshold?: number;
  /** Jolts needed within `windowMs`. Default 2. */
  jolts?: number;
  windowMs?: number;
  /** Quiet time after a shake. Default 3000 ms. */
  cooldownMs?: number;
  intervalMs?: number;
  now?: () => number;
}

/** Calls `onShake` when the phone is shaken: a few strong jolts close together, then a cooldown. Returns the stop. */
export function listenForShake(accelerometer: AccelerometerLike, onShake: () => void, options: ShakeOptions = {}): () => void {
  const { threshold = 2.3, jolts = 2, windowMs = 1000, cooldownMs = 3000, intervalMs = 100, now = Date.now } = options;
  const recent: number[] = [];
  let quietUntil = 0;
  accelerometer.setUpdateInterval?.(intervalMs);
  const subscription = accelerometer.addListener(({ x, y, z }) => {
    const t = now();
    if (t < quietUntil) return;
    if (Math.sqrt(x * x + y * y + z * z) < threshold) return;
    recent.push(t);
    while (recent.length && t - recent[0]! > windowMs) recent.shift();
    if (recent.length >= jolts) {
      recent.length = 0;
      quietUntil = t + cooldownMs;
      onShake();
    }
  });
  return () => subscription.remove();
}
