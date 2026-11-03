/**
 * Motion tokens: how long things take, how they ease, and how springs feel,
 * defined once for every platform.
 *
 * - **Web** reads them as CSS variables (`--ds-dur-*`, `--ds-ease-*`), which
 *   `themeFromBrand(brand, { designSystem })` emits for a design system with a
 *   `motion` group (`designSystemTokens`).
 * - **Native** reads them through genesis-ui-native's `useMotion()`, which
 *   turns them into Reanimated `withTiming` and `withSpring` configs.
 *
 * Reduced motion always wins: `resolveMotion("calm", { reducedMotion: true })`
 * is the same as level `none`, where every duration is 0 and every spring
 * settles at once, so a component lands in its final state without moving.
 *
 * Dependency-free on purpose (no React, no Reanimated): it is imported by web
 * stylesheets' generators and by React Native alike.
 *
 * @stability Beta
 */
import type { MotionLevel } from "../design-systems/define";

/** A cubic Bézier curve's four control values, as CSS `cubic-bezier()` and Reanimated `Easing.bezier()` take them. */
export type Bezier = readonly [x1: number, y1: number, x2: number, y2: number];

/** Durations in milliseconds, by what they're for. */
export interface MotionDurations {
  /** Press feedback: a button or row pressing in and out. */
  press: number;
  /** Small things appearing: a toast, a menu, a drawer settling back. */
  fast: number;
  /** A hover's colour or lift (web). Kept at level `none`: it isn't movement. */
  hover: number;
  /** A panel opening: a drawer, a sheet's backdrop. */
  base: number;
  /** A larger change in place: a section expanding, a view switching. */
  ui: number;
  /** One cycle of a loading pulse (Skeleton). */
  pulse: number;
  /** A scroll-driven reveal (web). */
  reveal: number;
  /** Media: a hero image's slow zoom (web). */
  media: number;
}

/** Easing curves. */
export interface MotionEasings {
  /** Fast start, long gentle stop. The default for things arriving. */
  out: Bezier;
  /** A quicker settle, for small UI. */
  swift: Bezier;
  /** Starts and stops gently: things moving between two places, a pulse. */
  inOut: Bezier;
  /** A cubic ease-out: toasts and other things entering from an edge. */
  decelerate: Bezier;
}

/**
 * A spring, in the physical terms Reanimated's `withSpring` takes. Springs are
 * what native gestures settle with (a swipe released, a sheet let go), so
 * motion that follows a finger keeps its velocity.
 */
export interface MotionSpring {
  damping: number;
  stiffness: number;
  mass: number;
}

/** The named springs. */
export interface MotionSprings {
  /** Quick and nearly without overshoot: press feedback, a swiped row snapping back. */
  snappy: MotionSpring;
  /** Smooth and settled: a sheet or drawer let go, a list making room for a new row. */
  smooth: MotionSpring;
  /** A little overshoot, used sparingly: a reaction landing, a badge appearing. */
  bouncy: MotionSpring;
}

/** Every motion token at one level. */
export interface MotionTokens {
  level: MotionLevel;
  /** True when nothing should move (level `none`, or the OS asked for reduced motion). */
  reduced: boolean;
  duration: MotionDurations;
  easing: MotionEasings;
  spring: MotionSprings;
}

/** The durations at any level that moves. */
export const MOTION_DURATIONS: Readonly<MotionDurations> = Object.freeze({
  press: 120,
  fast: 180,
  hover: 200,
  base: 220,
  ui: 320,
  pulse: 1000,
  reveal: 700,
  media: 1100,
});

export const MOTION_EASINGS: Readonly<MotionEasings> = Object.freeze({
  out: Object.freeze([0.22, 1, 0.36, 1] as const),
  swift: Object.freeze([0.2, 0.75, 0.5, 1] as const),
  inOut: Object.freeze([0.65, 0, 0.35, 1] as const),
  decelerate: Object.freeze([0.33, 1, 0.68, 1] as const),
});

export const MOTION_SPRINGS: Readonly<MotionSprings> = Object.freeze({
  snappy: Object.freeze({ damping: 30, stiffness: 400, mass: 1 }),
  smooth: Object.freeze({ damping: 28, stiffness: 240, mass: 1 }),
  bouncy: Object.freeze({ damping: 14, stiffness: 220, mass: 1 }),
});

/** Durations at level `none`: everything is instant except a hover's colour change, which isn't movement. */
const STILL_DURATIONS: Readonly<MotionDurations> = Object.freeze({
  press: 0,
  fast: 0,
  hover: MOTION_DURATIONS.hover,
  base: 0,
  ui: 0,
  pulse: 0,
  reveal: 0,
  media: 0,
});

export interface ResolveMotionOptions {
  /** The OS's reduce-motion setting (`prefers-reduced-motion`, or iOS/Android's). Turns every level into `none`. */
  reducedMotion?: boolean;
}

/**
 * The motion tokens for a level. Levels `calm`, `lively` and `bold` share
 * durations, easings and springs (they differ in how far web reveals travel,
 * which the design system's CSS carries); `none`, or `reducedMotion`, makes
 * everything instant.
 */
export function resolveMotion(level: MotionLevel = "calm", options: ResolveMotionOptions = {}): MotionTokens {
  const reduced = level === "none" || options.reducedMotion === true;
  return {
    level: reduced ? "none" : level,
    reduced,
    duration: reduced ? STILL_DURATIONS : MOTION_DURATIONS,
    easing: MOTION_EASINGS,
    spring: MOTION_SPRINGS,
  };
}

/** `[0.22, 1, 0.36, 1]` → `cubic-bezier(0.22, 1, 0.36, 1)`. */
export function cubicBezierCss(b: Bezier): string {
  return `cubic-bezier(${b.join(", ")})`;
}

/** The motion CSS variables for a level: `--ds-ease-*` and `--ds-dur-*`. */
export function motionCssVariables(level: MotionLevel): Record<string, string> {
  const m = resolveMotion(level);
  const ms = (n: number) => `${n}ms`;
  return {
    "--ds-ease-out": cubicBezierCss(m.easing.out),
    "--ds-ease-swift": cubicBezierCss(m.easing.swift),
    "--ds-ease-in-out": cubicBezierCss(m.easing.inOut),
    "--ds-ease-decelerate": cubicBezierCss(m.easing.decelerate),
    "--ds-dur-press": ms(m.duration.press),
    "--ds-dur-fast": ms(m.duration.fast),
    "--ds-dur-hover": ms(m.duration.hover),
    "--ds-dur-base": ms(m.duration.base),
    "--ds-dur-ui": ms(m.duration.ui),
    "--ds-dur-reveal": ms(m.duration.reveal),
    "--ds-dur-media": ms(m.duration.media),
  };
}
