/**
 * useMotion — the shared motion tokens (genesis-design-system's
 * `resolveMotion`), with the OS's reduce-motion setting applied.
 *
 * Every Genesis primitive that moves reads its durations, easings and springs
 * from here instead of its own constants, so motion is defined once for web
 * and native. Under Reduce Motion every duration is 0 and `animateMotion`
 * returns the final value, so a component lands without moving.
 *
 * ```tsx
 * const motion = useMotion();
 * const { reanimated: R } = useGenesisModules();
 * offset.value = animateMotion(R, motion, 0, { spring: "snappy" });
 * opacity.value = animateMotion(R, motion, 1, { duration: "fast", easing: "decelerate" });
 * ```
 *
 * @stability Beta
 */
import { useMemo } from "react";
import {
  resolveMotion,
  type MotionDurations,
  type MotionEasings,
  type MotionSprings,
  type MotionTokens,
} from "@marktiderman/genesis-design-system/tokens/motion";
import type { MotionLevel } from "@marktiderman/genesis-design-system/design-systems";
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

/** How to get there: a named spring (follows a gesture's velocity) or a named duration and easing. */
export type MotionHow =
  | { spring: keyof MotionSprings; velocity?: number }
  | { duration: keyof MotionDurations; easing?: keyof MotionEasings };

/**
 * A Reanimated animation to `toValue` with the motion tokens, for a shared
 * value: `x.value = animateMotion(R, motion, 0, { spring: "smooth" })`.
 *
 * Reduced motion returns `toValue` itself (no animation). A module without
 * `withSpring` (an older one, a test fake) gets a `withTiming` at `base`.
 */
export function animateMotion(
  R: GenesisReanimatedModule,
  motion: MotionTokens,
  toValue: number,
  how: MotionHow,
  callback?: (finished?: boolean) => void
): number {
  if (motion.reduced) {
    callback?.(true);
    return toValue;
  }
  if ("spring" in how) {
    if (R.withSpring) return R.withSpring(toValue, { ...motion.spring[how.spring], velocity: how.velocity }, callback);
    return R.withTiming(toValue, { duration: motion.duration.base, easing: bezier(R, motion, "out") }, callback);
  }
  return R.withTiming(toValue, { duration: motion.duration[how.duration], easing: bezier(R, motion, how.easing ?? "out") }, callback);
}

function bezier(R: GenesisReanimatedModule, motion: MotionTokens, name: keyof MotionEasings): unknown {
  const [x1, y1, x2, y2] = motion.easing[name];
  return R.Easing.bezier?.(x1, y1, x2, y2);
}
