/**
 * The overlay's two ways in, as plain state machines (the root feeds them
 * touches and accelerometer samples; tests feed them numbers).
 *
 * - A hold with three fingers (`fingers`) for `holdMs`. Works in every build
 *   with no native module.
 * - A shake, from an accelerometer (`Accelerometer` from expo-sensors, in g):
 *   `required` samples above `threshold` g (gravity removed) within
 *   `windowMs`, then nothing for `cooldownMs`.
 */

export interface HoldDetectorOptions {
  /** Default 3. */
  fingers?: number;
  /** Default 800 ms. */
  holdMs?: number;
  onTrigger: () => void;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface HoldDetector {
  /** The number of fingers down now (`event.nativeEvent.touches.length`). */
  touches(count: number): void;
  cancel(): void;
}

export function createHoldDetector(options: HoldDetectorOptions): HoldDetector {
  const fingers = Math.max(2, options.fingers ?? 3);
  const holdMs = options.holdMs ?? 800;
  const setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let timer: unknown = null;
  // One trigger per hold: lifting a finger re-arms it.
  let fired = false;
  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  return {
    touches(count) {
      if (count < fingers) {
        cancel();
        fired = false;
        return;
      }
      if (timer !== null || fired) return;
      timer = setTimer(() => {
        timer = null;
        fired = true;
        options.onTrigger();
      }, holdMs);
    },
    cancel() {
      cancel();
      fired = false;
    },
  };
}

export interface ShakeDetectorOptions {
  /** g above gravity a sample must reach. Default 1.5. */
  threshold?: number;
  /** Samples over the threshold needed. Default 3. */
  required?: number;
  /** Default 800 ms. */
  windowMs?: number;
  /** Default 2000 ms. */
  cooldownMs?: number;
  onShake: () => void;
  now?: () => number;
}

export interface ShakeDetector {
  sample(reading: { x: number; y: number; z: number }): void;
}

export function createShakeDetector(options: ShakeDetectorOptions): ShakeDetector {
  const threshold = options.threshold ?? 1.5;
  const required = options.required ?? 3;
  const windowMs = options.windowMs ?? 800;
  const cooldownMs = options.cooldownMs ?? 2000;
  const now = options.now ?? Date.now;
  let hits: number[] = [];
  let lastFired = -Infinity;
  return {
    sample({ x, y, z }) {
      const at = now();
      if (at - lastFired < cooldownMs) return;
      if (Math.sqrt(x * x + y * y + z * z) - 1 <= threshold) return;
      hits = hits.filter((t) => at - t <= windowMs);
      hits.push(at);
      if (hits.length >= required) {
        hits = [];
        lastFired = at;
        options.onShake();
      }
    },
  };
}

/** `Accelerometer` from expo-sensors, or a stand-in. */
export interface AccelerometerLike {
  isAvailableAsync?(): Promise<boolean>;
  setUpdateInterval?(ms: number): void;
  addListener(listener: (reading: { x: number; y: number; z: number }) => void): { remove(): void };
}
