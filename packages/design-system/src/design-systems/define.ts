/**
 * Design systems: the look rules attached to a brand.
 *
 * A brand is identity (name, logo, colours, fonts). A design system is how
 * they are used: the type ramp, space, shape, surfaces, image treatment and
 * motion. Each one is versioned in code (`crisp@1`); a brand names one, plus
 * up to three choices from fixed lists (density, corners, motion), and
 * swapping it re-themes every page with no other edit, because components
 * draw only its tokens.
 *
 * ```ts
 * export const quiet = defineDesignSystem({
 *   name: "quiet",
 *   version: 1,
 *   label: "Quiet",
 *   type: { ramp: { ...DEFAULT_RAMP, display: { min: 2.5, max: 4.75 } } },
 *   space: { density: "generous" },
 *   shape: { corners: "round", shadow: "soft" },
 *   surfaces: { ground: "paper" },
 *   image: { filter: "warm" },
 *   motion: { level: "calm" },
 * });
 * ```
 *
 * Every group is optional. A group left out keeps the host's own defaults
 * (that is how `classic@1`, today's look, emits nothing), so a host can adopt
 * one group at a time.
 */
import { FONT_CLASSES, type FontClass } from "../fonts";
import { GROUNDS, type Ground } from "./color";

// ── The fixed lists ─────────────────────────────────────────────────────────

/** Section padding. */
export const DENSITIES = ["compact", "normal", "generous"] as const;
export type Density = (typeof DENSITIES)[number];

/** Corner radius sets, from square to friendly. */
export const CORNERS = ["square", "crisp", "soft", "round", "friendly"] as const;
export type Corners = (typeof CORNERS)[number];

/** How much things move. CSS only; reduced motion always means `none`. */
export const MOTION_LEVELS = ["none", "calm", "lively", "bold"] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];

export const SHADOW_LEVELS = ["flat", "soft", "lifted"] as const;
export type ShadowLevel = (typeof SHADOW_LEVELS)[number];

export const IMAGE_FILTERS = ["none", "warm", "crisp", "mono"] as const;
export type ImageFilter = (typeof IMAGE_FILTERS)[number];

export const SCRIMS = ["full", "bottom", "side"] as const;
export type Scrim = (typeof SCRIMS)[number];

/** The type ramp's steps, smallest first. */
export const TYPE_STEPS = ["eyebrow", "sm", "body", "lead", "h4", "h3", "h2", "h1", "display"] as const;
export type TypeStep = (typeof TYPE_STEPS)[number];

// ── The definition ──────────────────────────────────────────────────────────

/**
 * A fluid size in rem: `min` on a 360px viewport, `max` on a 1440px one,
 * linear between. It becomes a `clamp()` per token (never on the root), so
 * browser zoom still scales it.
 */
export interface FluidSize {
  min: number;
  max: number;
}

/** How headings in one font class are set. */
export interface FontClassRule {
  /** The display and h1 weight (100–900). */
  displayWeight: number;
  /** The h2–h4 weight. */
  headingWeight: number;
  /** Letter spacing at display and h1 sizes, in em. */
  displayTracking: number;
  /** Letter spacing at h2–h4, in em. */
  headingTracking: number;
  /** `upper` sets headings in capitals. */
  case: "as-written" | "upper";
  /** Line height at display size. */
  displayLeading: number;
}

/** The small label above a heading. */
export interface EyebrowRule {
  weight: number;
  /** In em. */
  tracking: number;
  case: "as-written" | "upper";
}

export interface DesignSystemInput {
  /** Lowercase letters, digits and hyphens: `crisp`. */
  name: string;
  /** A whole number from 1. A change that alters how a site looks is a new version. */
  version: number;
  /** Its name in a picker. */
  label: string;
  description?: string;
  type?: {
    /** A fluid size per step. */
    ramp: Record<TypeStep, FluidSize>;
    /** Line height per step. Default: `DEFAULT_LEADING`. */
    leading?: Partial<Record<TypeStep, number>>;
    /** Heading rules per font class, over `DEFAULT_FONT_CLASS_RULES`. */
    classes?: Partial<Record<FontClass, Partial<FontClassRule>>>;
    eyebrow?: Partial<EyebrowRule>;
  };
  space?: {
    /** The default density; a brand may choose another. */
    density: Density;
  };
  shape?: {
    /** The default corners; a brand may choose others. */
    corners: Corners;
    /** Border width in px (1 or 2). Default 1. */
    borderWidth?: 1 | 2;
    shadow?: ShadowLevel;
  };
  /** The colour engine's ground. Leave `surfaces` out to keep the host's own colours. */
  surfaces?: {
    ground: Ground;
  };
  image?: {
    filter?: ImageFilter;
    /** Film grain in percent: 0, 3 or 5. */
    grain?: 0 | 3 | 5;
    /** Where the scrim behind text over a photo sits. */
    scrim?: Scrim;
  };
  motion?: {
    /** The default level; a brand may choose another. */
    level: MotionLevel;
  };
}

/** A defined design system: its input, frozen, with its id. */
export type DesignSystem = Readonly<DesignSystemInput> & {
  /** `name@version`. */
  readonly id: string;
};

/** What a brand says about its design system: which one, and up to three choices. */
export interface DesignSystemChoice {
  /** `crisp@1`. */
  id: string;
  density?: Density;
  corners?: Corners;
  motion?: MotionLevel;
}

// ── Defaults ────────────────────────────────────────────────────────────────

/** A ramp that suits most brands: 16 → 18px body, 48 → 112px display. */
export const DEFAULT_RAMP: Readonly<Record<TypeStep, FluidSize>> = Object.freeze({
  eyebrow: { min: 0.75, max: 0.8125 },
  sm: { min: 0.875, max: 0.9375 },
  body: { min: 1, max: 1.125 },
  lead: { min: 1.125, max: 1.375 },
  h4: { min: 1.1875, max: 1.375 },
  h3: { min: 1.375, max: 1.75 },
  h2: { min: 1.875, max: 3 },
  h1: { min: 2.5, max: 4.75 },
  display: { min: 3, max: 7 },
});

export const DEFAULT_LEADING: Readonly<Record<TypeStep, number>> = Object.freeze({
  eyebrow: 1.2,
  sm: 1.5,
  body: 1.6,
  lead: 1.5,
  h4: 1.3,
  h3: 1.2,
  h2: 1.1,
  h1: 1.0,
  display: 0.95,
});

/** How each font class is set at display sizes, when a design system says nothing else. */
export const DEFAULT_FONT_CLASS_RULES: Readonly<Record<FontClass, FontClassRule>> = Object.freeze({
  grotesk: { displayWeight: 600, headingWeight: 600, displayTracking: -0.035, headingTracking: -0.02, case: "as-written", displayLeading: 0.95 },
  geometric: { displayWeight: 700, headingWeight: 600, displayTracking: -0.025, headingTracking: -0.015, case: "as-written", displayLeading: 1.0 },
  condensed: { displayWeight: 700, headingWeight: 600, displayTracking: 0.01, headingTracking: 0.005, case: "upper", displayLeading: 0.88 },
  serif: { displayWeight: 500, headingWeight: 500, displayTracking: -0.02, headingTracking: -0.01, case: "as-written", displayLeading: 1.0 },
  mono: { displayWeight: 500, headingWeight: 500, displayTracking: -0.02, headingTracking: -0.01, case: "as-written", displayLeading: 1.05 },
});

export const DEFAULT_EYEBROW: Readonly<EyebrowRule> = Object.freeze({ weight: 600, tracking: 0.12, case: "upper" });

// ── Validation ──────────────────────────────────────────────────────────────

const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const ID = /^([a-z][a-z0-9-]{0,39})@([1-9][0-9]{0,3})$/;

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const finite = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

function checkKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]): void {
  for (const k of Object.keys(value)) if (!allowed.includes(k)) errors.push(`${path}.${k}: unknown property`);
}

/** Every problem with a design system input; empty when it is sound. */
export function validateDesignSystem(input: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(input)) return ["designSystem: expected object"];
  const d = input;
  checkKeys(d, ["name", "version", "label", "description", "type", "space", "shape", "surfaces", "image", "motion"], "designSystem", errors);
  if (typeof d.name !== "string" || !NAME.test(d.name)) errors.push("designSystem.name: lowercase letters, digits and hyphens, starting with a letter");
  if (typeof d.version !== "number" || !Number.isInteger(d.version) || d.version < 1 || d.version > 9999) errors.push("designSystem.version: a whole number from 1");
  if (typeof d.label !== "string" || !d.label.trim()) errors.push("designSystem.label: expected a non-empty string");
  if (d.description !== undefined && typeof d.description !== "string") errors.push("designSystem.description: expected a string");
  if (d.type !== undefined) {
    if (!isObject(d.type)) errors.push("designSystem.type: expected object");
    else {
      const t = d.type;
      checkKeys(t, ["ramp", "leading", "classes", "eyebrow"], "designSystem.type", errors);
      if (!isObject(t.ramp)) errors.push("designSystem.type.ramp: expected a size per step");
      else {
        for (const step of TYPE_STEPS) {
          const s = t.ramp[step];
          if (!isObject(s) || !finite(s.min, 0.5, 12) || !finite(s.max, 0.5, 12)) errors.push(`designSystem.type.ramp.${step}: expected { min, max } in rem, 0.5–12`);
          else if ((s.min as number) > (s.max as number)) errors.push(`designSystem.type.ramp.${step}: min is larger than max`);
        }
        checkKeys(t.ramp, TYPE_STEPS, "designSystem.type.ramp", errors);
      }
      if (t.leading !== undefined) {
        if (!isObject(t.leading)) errors.push("designSystem.type.leading: expected object");
        else for (const [k, v] of Object.entries(t.leading)) if (!oneOf(TYPE_STEPS, k) || !finite(v, 0.7, 2.5)) errors.push(`designSystem.type.leading.${k}: a type step and a line height 0.7–2.5`);
      }
      if (t.classes !== undefined) {
        if (!isObject(t.classes)) errors.push("designSystem.type.classes: expected object");
        else
          for (const [k, rule] of Object.entries(t.classes)) {
            if (!oneOf(FONT_CLASSES, k)) errors.push(`designSystem.type.classes.${k}: not a font class (${FONT_CLASSES.join(", ")})`);
            if (!isObject(rule)) {
              errors.push(`designSystem.type.classes.${k}: expected object`);
              continue;
            }
            checkKeys(rule, ["displayWeight", "headingWeight", "displayTracking", "headingTracking", "case", "displayLeading"], `designSystem.type.classes.${k}`, errors);
            for (const w of ["displayWeight", "headingWeight"] as const) if (rule[w] !== undefined && !(finite(rule[w], 100, 900) && (rule[w] as number) % 100 === 0)) errors.push(`designSystem.type.classes.${k}.${w}: 100–900 in hundreds`);
            for (const tr of ["displayTracking", "headingTracking"] as const) if (rule[tr] !== undefined && !finite(rule[tr], -0.1, 0.3)) errors.push(`designSystem.type.classes.${k}.${tr}: −0.1 to 0.3 em`);
            if (rule.case !== undefined && !oneOf(["as-written", "upper"], rule.case)) errors.push(`designSystem.type.classes.${k}.case: "as-written" or "upper"`);
            if (rule.displayLeading !== undefined && !finite(rule.displayLeading, 0.7, 2)) errors.push(`designSystem.type.classes.${k}.displayLeading: 0.7–2`);
          }
      }
      if (t.eyebrow !== undefined) {
        if (!isObject(t.eyebrow)) errors.push("designSystem.type.eyebrow: expected object");
        else {
          checkKeys(t.eyebrow, ["weight", "tracking", "case"], "designSystem.type.eyebrow", errors);
          if (t.eyebrow.weight !== undefined && !(finite(t.eyebrow.weight, 100, 900) && (t.eyebrow.weight as number) % 100 === 0)) errors.push("designSystem.type.eyebrow.weight: 100–900 in hundreds");
          if (t.eyebrow.tracking !== undefined && !finite(t.eyebrow.tracking, -0.1, 0.4)) errors.push("designSystem.type.eyebrow.tracking: −0.1 to 0.4 em");
          if (t.eyebrow.case !== undefined && !oneOf(["as-written", "upper"], t.eyebrow.case)) errors.push('designSystem.type.eyebrow.case: "as-written" or "upper"');
        }
      }
    }
  }
  const group = (key: string, fields: Record<string, (v: unknown) => boolean>, required: string[], hint: string) => {
    const g = d[key];
    if (g === undefined) return;
    if (!isObject(g)) {
      errors.push(`designSystem.${key}: expected object`);
      return;
    }
    checkKeys(g, Object.keys(fields), `designSystem.${key}`, errors);
    for (const r of required) if (g[r] === undefined) errors.push(`designSystem.${key}.${r}: required`);
    for (const [f, ok] of Object.entries(fields)) if (g[f] !== undefined && !ok(g[f])) errors.push(`designSystem.${key}.${f}: ${hint}`);
  };
  group("space", { density: (v) => oneOf(DENSITIES, v) }, ["density"], `one of ${DENSITIES.join(", ")}`);
  group("shape", { corners: (v) => oneOf(CORNERS, v), borderWidth: (v) => v === 1 || v === 2, shadow: (v) => oneOf(SHADOW_LEVELS, v) }, ["corners"], `corners: ${CORNERS.join(", ")}; borderWidth: 1 or 2; shadow: ${SHADOW_LEVELS.join(", ")}`);
  group("surfaces", { ground: (v) => oneOf(GROUNDS, v) }, ["ground"], `one of ${GROUNDS.join(", ")}`);
  group("image", { filter: (v) => oneOf(IMAGE_FILTERS, v), grain: (v) => v === 0 || v === 3 || v === 5, scrim: (v) => oneOf(SCRIMS, v) }, [], `filter: ${IMAGE_FILTERS.join(", ")}; grain: 0, 3 or 5; scrim: ${SCRIMS.join(", ")}`);
  group("motion", { level: (v) => oneOf(MOTION_LEVELS, v) }, ["level"], `one of ${MOTION_LEVELS.join(", ")}`);
  return errors;
}

/** Every problem with a brand's design system choice; empty when it is sound. */
export function validateDesignSystemChoice(input: unknown, path = "designSystem"): string[] {
  const errors: string[] = [];
  if (!isObject(input)) return [`${path}: expected object`];
  checkKeys(input, ["id", "density", "corners", "motion"], path, errors);
  if (typeof input.id !== "string" || !ID.test(input.id)) errors.push(`${path}.id: expected "name@version", e.g. "crisp@1"`);
  if (input.density !== undefined && !oneOf(DENSITIES, input.density)) errors.push(`${path}.density: one of ${DENSITIES.join(", ")}`);
  if (input.corners !== undefined && !oneOf(CORNERS, input.corners)) errors.push(`${path}.corners: one of ${CORNERS.join(", ")}`);
  if (input.motion !== undefined && !oneOf(MOTION_LEVELS, input.motion)) errors.push(`${path}.motion: one of ${MOTION_LEVELS.join(", ")}`);
  return errors;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * Define a design system: checks it and returns it frozen, with its id
 * (`name@version`). Throws with every problem when it isn't sound.
 *
 * @stability Beta
 */
export function defineDesignSystem(input: DesignSystemInput): DesignSystem {
  const errors = validateDesignSystem(input);
  if (errors.length) throw new Error(`Design system "${String((input as { name?: unknown })?.name)}" isn't valid:\n- ${errors.join("\n- ")}`);
  return deepFreeze({ ...structuredClone(input), id: `${input.name}@${input.version}` });
}

/** The design system's choices for a brand: the brand's, else the design system's defaults. */
export function resolveChoices(ds: DesignSystem, choice?: Partial<DesignSystemChoice>): { density: Density; corners: Corners; motion: MotionLevel } {
  return {
    density: choice?.density ?? ds.space?.density ?? "normal",
    corners: choice?.corners ?? ds.shape?.corners ?? "soft",
    motion: choice?.motion ?? ds.motion?.level ?? "none",
  };
}
