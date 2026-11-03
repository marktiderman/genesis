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
 * is the same as level `none`, where every duration is 0 and every spring is
 * a stiff, critically damped one that settles in a few frames without
 * overshoot, so a component lands in its final state.
 * (On native, `useMotion()` reads the OS setting. On web, the CSS variables
 * carry the brand's level only; a host gates movement with
 * `prefers-reduced-motion` itself.)
 *
 * A repeating animation (a pulse) checks `reduced` before it repeats: a
 * zero-length repeat would flash every frame.
 *
 * Dependency-free on purpose (no React, no Reanimated): it is imported by web
 * stylesheets' generators and by React Native alike.
 *
 * @stability Beta
 */
import type { MotionLevel } from "../design-systems/define";

export type { MotionLevel };

/** A cubic Bézier curve's four control values, as CSS `cubic-bezier()` and Reanimated `Easing.bezier()` take them. */
export type Bezier = readonly [x1: number, y1: number, x2: number, y2: number];

/** Durations in milliseconds, by what they're for. */
export interface MotionDurations {
  /** Press feedback: a button or row pressing in and out. */
  readonly press: number;
  /** Small things appearing: a toast, a menu, a drawer settling back. */
  readonly fast: number;
  /** A hover's colour or lift (web). Kept at level `none`: it isn't movement. */
  readonly hover: number;
  /** A panel opening: a drawer, a sheet's backdrop. */
  readonly base: number;
  /** A larger change in place: a section expanding, a view switching. */
  readonly ui: number;
  /** One cycle of a loading pulse (Skeleton). */
  readonly pulse: number;
  /** A scroll-driven reveal (web). */
  readonly reveal: number;
  /** Media: a hero image's slow zoom (web). */
  readonly media: number;
}

/** Easing curves. */
export interface MotionEasings {
  /** Fast start, long gentle stop. The default for things arriving. */
  readonly out: Bezier;
  /** A quicker settle, for small UI. */
  readonly swift: Bezier;
  /** Starts and stops gently: things moving between two places, a pulse. */
  readonly inOut: Bezier;
  /** A cubic ease-out: toasts and other things entering from an edge. */
  readonly decelerate: Bezier;
}

/**
 * A spring, in the physical terms Reanimated's `withSpring` takes. Springs are
 * what native gestures settle with (a swipe released, a sheet let go), so
 * motion that follows a finger keeps its velocity.
 */
export interface MotionSpring {
  readonly damping: number;
  readonly stiffness: number;
  readonly mass: number;
}

/** The named springs. */
export interface MotionSprings {
  /** Quick and nearly without overshoot: press feedback, a swiped row snapping back. */
  readonly snappy: MotionSpring;
  /** Smooth and settled: a sheet or drawer let go, a list making room for a new row. */
  readonly smooth: MotionSpring;
  /** A little overshoot, used sparingly: a reaction landing, a badge appearing. */
  readonly bouncy: MotionSpring;
}

/** Every motion token at one level. */
export interface MotionTokens {
  readonly level: MotionLevel;
  /** True when nothing should move (level `none`, or the OS asked for reduced motion). */
  readonly reduced: boolean;
  readonly duration: MotionDurations;
  readonly easing: MotionEasings;
  readonly spring: MotionSprings;
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

export const MOTION_SPRINGS: MotionSprings = Object.freeze({
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

/**
 * The springs under reduced motion: critically damped and very stiff, so
 * whatever a gesture left settles in a few frames with no overshoot. (A spring
 * can't be zero-length the way a timing can; a caller that must not move at
 * all checks `reduced` and assigns the value.)
 */
const STILL_SPRING: MotionSpring = Object.freeze({ damping: 200, stiffness: 10000, mass: 1 });
const STILL_SPRINGS: MotionSprings = Object.freeze({ snappy: STILL_SPRING, smooth: STILL_SPRING, bouncy: STILL_SPRING });

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
    spring: reduced ? STILL_SPRINGS : MOTION_SPRINGS,
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
