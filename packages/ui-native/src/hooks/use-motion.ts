/**
 * useMotion — the shared motion tokens (genesis-design-system's
 * `resolveMotion`), with the OS's reduce-motion setting applied.
 *
 * Every Genesis primitive that moves reads its durations, easings and springs
 * from here instead of its own constants, so motion is defined once for web
 * and native. Under Reduce Motion every duration is 0 and `animateMotion`
 * returns the final value, so a component lands without moving.
 *
 * The brand's motion level isn't read from a provider yet: pass `level` (a
 * brand whose design system chose `none` passes `"none"`). Without it,
 * `calm`.
 *
 * On the JS thread (an effect, a PanResponder), `animateMotion`:
 *
 * ```tsx
 * const motion = useMotion();
 * const { reanimated: R } = useGenesisModules();
 * opacity.value = animateMotion(R, motion, 1, { duration: "fast", easing: "decelerate" });
 * ```
 *
 * Inside a worklet (a gesture's `onEnd`, an animated scroll handler), build
 * the config with the worklet-safe `motionSpring` / `motionTiming` and call
 * Reanimated yourself:
 *
 * ```tsx
 * .onEnd((e) => { x.value = withSpring(0, motionSpring(motion, "snappy", e.velocityX)); })
 * ```
 *
 * A repeating animation checks `motion.reduced` first: a zero-length repeat
 * would flash every frame.
 *
 * @stability Beta
 */
import { useMemo } from "react";
import {
  resolveMotion,
  type MotionDurations,
  type MotionEasings,
  type MotionLevel,
  type MotionSprings,
  type MotionTokens,
} from "@marktiderman/genesis-design-system/tokens/motion";
import type { GenesisReanimatedModule } from "../native-modules";
import { useReducedMotion } from "./use-reduced-motion";

export interface UseMotionOptions {
  /** The brand's motion level. Default `calm`; `none` holds everything still, like Reduce Motion. */
  level?: MotionLevel;
}

export function useMotion(options: UseMotionOptions = {}): MotionTokens {
  const reducedMotion = useReducedMotion();
  const level = options.level ?? "calm";
  return useMemo(() => resolveMotion(level, { reducedMotion }), [level, reducedMotion]);
}

/** How to get there: a named spring (keeps a gesture's velocity), or a named duration and easing. */
export type MotionHow =
  | { spring: keyof MotionSprings; velocity?: number; duration?: never; easing?: never }
  | { duration: keyof MotionDurations; easing?: keyof MotionEasings; spring?: never; velocity?: never };

/** A `withSpring` config from a named spring. Worklet-safe (plain data in, plain data out). */
export function motionSpring(motion: MotionTokens, name: keyof MotionSprings, velocity?: number): { damping: number; stiffness: number; mass: number; velocity?: number } {
  "worklet";
  const s = motion.spring[name];
  return typeof velocity === "number" ? { damping: s.damping, stiffness: s.stiffness, mass: s.mass, velocity } : { damping: s.damping, stiffness: s.stiffness, mass: s.mass };
}

/**
 * A `withTiming` config from a named duration and easing. Pass Reanimated's
 * `Easing` to get the token's curve (without it, Reanimated's default curve).
 * Worklet-safe when `Easing` is.
 */
export function motionTiming(
  motion: MotionTokens,
  duration: keyof MotionDurations,
  easing: keyof MotionEasings = "out",
  Easing?: GenesisReanimatedModule["Easing"]
): { duration: number; easing?: unknown } {
  "worklet";
  const [x1, y1, x2, y2] = motion.easing[easing];
  const curve = Easing?.bezier ? Easing.bezier(x1, y1, x2, y2) : undefined;
  return curve === undefined ? { duration: motion.duration[duration] } : { duration: motion.duration[duration], easing: curve };
}

/**
 * A Reanimated animation to `toValue` with the motion tokens, for a shared
 * value on the JS thread: `x.value = animateMotion(R, motion, 0, { spring: "smooth" })`.
 * In a worklet, use `motionSpring` / `motionTiming` instead.
 *
 * Reduced motion returns `toValue` itself (no animation); `callback` then runs
 * on the next microtask, after the caller has assigned the value, as
 * Reanimated would. A module without `withSpring` (an older one, a test fake)
 * gets a `withTiming` at `base`. Reanimated is also told to follow the
 * system's setting (`ReduceMotion.System`), which covers the moment before
 * the OS answers on first launch.
 */
export function animateMotion(
  R: GenesisReanimatedModule,
  motion: MotionTokens,
  toValue: number,
  how: MotionHow,
  callback?: (finished?: boolean) => void
): number {
  if (motion.reduced) {
    if (callback) queueMicrotask(() => callback(true));
    return toValue;
  }
  const reduceMotion = R.ReduceMotion?.System;
  const system = reduceMotion === undefined ? {} : { reduceMotion };
  if (how.spring !== undefined) {
    if (R.withSpring) return R.withSpring(toValue, { ...motionSpring(motion, how.spring, how.velocity), ...system }, callback);
    return R.withTiming(toValue, { ...motionTiming(motion, "base", "out", R.Easing), ...system }, callback);
  }
  return R.withTiming(toValue, { ...motionTiming(motion, how.duration, how.easing, R.Easing), ...system }, callback);
}
