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
 * opacity.value = withTiming(1, motionTiming(motion, "fast", Easing, "decelerate"));
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

/** What `motionSpring` gives `withSpring`. */
export interface MotionSpringConfig {
  damping: number;
  stiffness: number;
  mass: number;
  velocity?: number;
}

/** What `motionTiming` gives `withTiming`. */
export interface MotionTimingConfig {
  duration: number;
  easing?: unknown;
}

/**
 * A `withSpring` config from a named spring. Worklet-safe (plain data in,
 * plain data out). Under reduced motion it's the stiff, critically damped
 * spring that settles in a few frames; to not move at all, check
 * `motion.reduced` and assign the value.
 */
export function motionSpring(motion: MotionTokens, name: keyof MotionSprings, velocity?: number): MotionSpringConfig {
  "worklet";
  const s = motion.spring[name];
  return typeof velocity === "number" && !motion.reduced
    ? { damping: s.damping, stiffness: s.stiffness, mass: s.mass, velocity }
    : { damping: s.damping, stiffness: s.stiffness, mass: s.mass };
}

/**
 * A `withTiming` config from a named duration and easing. Pass Reanimated's
 * `Easing` (`R.Easing`, or `Easing` imported in a worklet) so the token's
 * curve is used; a module without `Easing.bezier` gets Reanimated's default
 * curve. Worklet-safe.
 */
export function motionTiming(
  motion: MotionTokens,
  duration: keyof MotionDurations,
  Easing: Pick<GenesisReanimatedModule["Easing"], "bezier"> | undefined,
  easing: keyof MotionEasings = "out",
): MotionTimingConfig {
  "worklet";
  const [x1, y1, x2, y2] = motion.easing[easing];
  const curve = Easing?.bezier ? Easing.bezier(x1, y1, x2, y2) : undefined;
  return curve === undefined ? { duration: motion.duration[duration] } : { duration: motion.duration[duration], easing: curve };
}

/**
 * A Reanimated animation to `toValue` with the motion tokens, for a shared
 * value on the JS thread: `x.value = animateMotion(R, motion, 0, { spring: "smooth" })`.
 * Under reduced motion it returns `toValue` itself, so nothing moves.
 *
 * It takes no completion callback: Reanimated runs one on the UI thread, so
 * it must be a worklet, and the reduced path couldn't keep that promise. To
 * act when an animation ends, call `withSpring` / `withTiming` yourself with
 * `motionSpring` / `motionTiming` and a worklet callback. A module without
 * `withSpring` (an older one, a test fake) gets a `withTiming` at `base`.
 */
export function animateMotion(R: GenesisReanimatedModule, motion: MotionTokens, toValue: number, how: MotionHow): number {
  if (motion.reduced) return toValue;
  if (how.spring !== undefined) {
    if (R.withSpring) return R.withSpring(toValue, motionSpring(motion, how.spring, how.velocity));
    return R.withTiming(toValue, motionTiming(motion, "base", R.Easing));
  }
  return R.withTiming(toValue, motionTiming(motion, how.duration, R.Easing, how.easing));
}
