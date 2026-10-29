/**
 * A design system as CSS variables: what `themeFromBrand(brand, { designSystem })`
 * adds to a brand's variables.
 *
 * Every token is `--ds-*`, so it never collides with Tailwind's own theme
 * variables, plus, when the design system has `surfaces`, genesis-ui's role
 * variables (`--background`, `--primary`, … as HSL triplets) from the colour
 * engine, and `--radius` from its corners. A group the design system leaves
 * out emits nothing, so the host's stylesheet keeps its own value there: a
 * host reads each token with a fallback, `var(--ds-text-h2, <its own>)`.
 */
import { FONT_CLASSES, type FontClass } from "../fonts";
import { hexToHslTriplet, palette, rolePairs, type ColorRoles, type ContrastPair, type Palette, type PaletteInput } from "./color";
import {
  DEFAULT_EYEBROW,
  DEFAULT_FONT_CLASS_RULES,
  DEFAULT_LEADING,
  TYPE_STEPS,
  type Corners,
  type Density,
  type DesignSystem,
  type FluidSize,
  type FontClassRule,
  type MotionLevel,
  type ShadowLevel,
} from "./define";

/** The viewports a fluid size runs between, in rem (360px and 1440px at 16px). */
const FROM = 22.5;
const TO = 90;

const num = (n: number, places = 4) => String(Number(n.toFixed(places)));

/**
 * `{ min: 3, max: 7 }` → `clamp(3rem, 1.6667rem + 5.9259vw, 7rem)`: `min` at a
 * 360px viewport, `max` at 1440px, linear between.
 */
export function fluid({ min, max }: FluidSize): string {
  if (min === max) return `${num(min)}rem`;
  const slope = (max - min) / (TO - FROM);
  const intercept = min - slope * FROM;
  return `clamp(${num(min)}rem, ${num(intercept)}rem + ${num(slope * 100)}vw, ${num(max)}rem)`;
}

// ── The fixed lists' values ─────────────────────────────────────────────────

/** Section padding steps (top and bottom), smallest first. */
const SECTION_STEPS: readonly FluidSize[] = [
  { min: 2, max: 3 },
  { min: 3, max: 5 },
  { min: 4, max: 7.5 },
  { min: 5, max: 11 },
  { min: 5.5, max: 12 },
];
const DENSITY_INDEX: Record<Density, number> = { compact: 1, normal: 2, generous: 3 };

/** The 4px space scale, `--ds-space-1` … `--ds-space-11`, in rem. */
const SPACE = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 10];

/** Radius per corners set, in px: chips and inputs, cards, feature images, buttons, photos. */
export const CORNER_RADII: Readonly<Record<Corners, { sm: number; md: number; lg: number; button: number; image: number }>> = Object.freeze({
  square: { sm: 0, md: 0, lg: 0, button: 0, image: 0 },
  crisp: { sm: 2, md: 4, lg: 4, button: 2, image: 0 },
  soft: { sm: 6, md: 12, lg: 16, button: 999, image: 12 },
  round: { sm: 8, md: 16, lg: 24, button: 999, image: 24 },
  friendly: { sm: 10, md: 20, lg: 28, button: 14, image: 20 },
});

const IMAGE_FILTER_CSS = {
  none: "none",
  warm: "saturate(0.92) contrast(1.04) sepia(0.06)",
  crisp: "contrast(1.08) saturate(1.05)",
  mono: "grayscale(1) contrast(1.1)",
} as const;

interface MotionTokens {
  /** The keyframes a reveal runs: `ds-rise`, `ds-clip`, or `none`. The host's stylesheet defines them. */
  reveal: string;
  /** On phones (`bold` falls back to `calm`'s reveal there). */
  revealPhone: string;
  distance: string;
  /** How much of the scroll the reveal takes (`animation-range`). */
  range: string;
  lift: string;
}

const MOTION: Record<MotionLevel, MotionTokens> = {
  none: { reveal: "none", revealPhone: "none", distance: "0px", range: "normal", lift: "0px" },
  calm: { reveal: "ds-rise", revealPhone: "ds-rise", distance: "16px", range: "entry 0% cover 35%", lift: "-2px" },
  lively: { reveal: "ds-rise", revealPhone: "ds-rise", distance: "24px", range: "entry 0% cover 25%", lift: "-3px" },
  bold: { reveal: "ds-clip", revealPhone: "ds-rise", distance: "24px", range: "entry 0% cover 30%", lift: "-3px" },
};

/** `#rrggbb` → `r g b` for `rgb(r g b / a)`. */
function rgbChannels(hex: string): string {
  const h = hex.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
}

function shadows(level: ShadowLevel, ink: string): Record<string, string> {
  if (level === "flat") return { "--ds-shadow-1": "none", "--ds-shadow-2": "none", "--ds-shadow-3": "none" };
  const c = rgbChannels(ink);
  const s1 = `0 1px 2px rgb(${c} / 0.06), 0 1px 1px rgb(${c} / 0.04)`;
  const s2 = `0 2px 4px rgb(${c} / 0.05), 0 8px 16px rgb(${c} / 0.08)`;
  const s3 = `0 2px 4px rgb(${c} / 0.06), 0 12px 24px rgb(${c} / 0.1), 0 32px 64px rgb(${c} / 0.14)`;
  return { "--ds-shadow-1": s1, "--ds-shadow-2": s2, "--ds-shadow-3": level === "lifted" ? s3 : s2 };
}

// ── Emission ────────────────────────────────────────────────────────────────

export interface DesignSystemTokenInput {
  /** The brand's choices, already resolved. */
  choices: { density: Density; corners: Corners; motion: MotionLevel };
  /** The class of the brand's heading font (from `fontForStack`). Default `grotesk`. */
  displayClass?: FontClass;
  /** The brand's colours, for the colour engine (used when the design system has `surfaces`). */
  colors?: Omit<PaletteInput, "ground">;
}

/** A pair the design system's colours promise, in one mode. */
export interface DesignSystemPair extends ContrastPair {
  mode: "light" | "dark";
}

/** What a design system adds to a brand's theme. */
export interface DesignSystemTheme {
  /** `crisp@1`. */
  id: string;
  choices: { density: Density; corners: Corners; motion: MotionLevel };
  /** The variables per mode. Empty for a design system with no groups (`classic@1`). */
  variables: { light: Record<string, string>; dark: Record<string, string> };
  /** The colour engine's output, when the design system has `surfaces`. */
  palette?: Palette;
  /** Every colour pair it draws, for a contrast check (empty without `surfaces`). */
  pairs: DesignSystemPair[];
}

function colorVars(r: ColorRoles, scrimAlpha: number): Record<string, string> {
  const hsl = hexToHslTriplet;
  const ink = rgbChannels(r.inverse);
  const vars: Record<string, string> = {
    "--ds-ground": r.ground,
    "--ds-ground-raised": r.groundRaised,
    "--ds-ground-sunk": r.groundSunk,
    "--ds-ink": r.ink,
    "--ds-ink-quiet": r.inkQuiet,
    "--ds-border": r.border,
    "--ds-input-border": r.inputBorder,
    "--ds-accent-fill": r.accentFill,
    "--ds-on-accent": r.onAccent,
    "--ds-accent-text": r.accentText,
    "--ds-accent-edge": r.accentEdge,
    "--ds-accent-tint": r.accentTint,
    "--ds-on-tint": r.onTint,
    "--ds-inverse": r.inverse,
    "--ds-on-inverse": r.onInverse,
    "--ds-focus": r.focus,
    // A wash over a whole photo, at the least opacity that keeps text over it at 4.5:1.
    "--ds-scrim-full": `rgb(${ink} / ${num(scrimAlpha, 2)})`,
    // genesis-ui's roles, from the engine.
    "--background": hsl(r.ground),
    "--foreground": hsl(r.ink),
    "--card": hsl(r.groundRaised),
    "--card-foreground": hsl(r.ink),
    "--popover": hsl(r.groundRaised),
    "--popover-foreground": hsl(r.ink),
    "--primary": hsl(r.accentFill),
    "--primary-foreground": hsl(r.onAccent),
    "--secondary": hsl(r.groundSunk),
    "--secondary-foreground": hsl(r.ink),
    "--muted": hsl(r.groundSunk),
    "--muted-foreground": hsl(r.inkQuiet),
    "--accent": hsl(r.accentTint),
    "--accent-foreground": hsl(r.onTint),
    "--border": hsl(r.border),
    "--input": hsl(r.inputBorder),
    "--ring": hsl(r.focus),
  };
  if (r.secondary) {
    vars["--ds-secondary-fill"] = r.secondary.fill;
    vars["--ds-on-secondary"] = r.secondary.onFill;
    vars["--ds-secondary-text"] = r.secondary.text;
  }
  return vars;
}

/**
 * The CSS variables for one design system and one brand, per mode, and the
 * colour pairs they promise.
 *
 * @stability Beta
 */
export function designSystemTheme(ds: DesignSystem, input: DesignSystemTokenInput): DesignSystemTheme {
  const { choices } = input;
  const shared: Record<string, string> = {};

  if (ds.type) {
    const leading = { ...DEFAULT_LEADING, ...(ds.type.leading ?? {}) };
    for (const step of TYPE_STEPS) {
      shared[`--ds-text-${step}`] = fluid(ds.type.ramp[step]);
      shared[`--ds-leading-${step}`] = num(leading[step]);
    }
    const cls: FontClass = input.displayClass && FONT_CLASSES.includes(input.displayClass) ? input.displayClass : "grotesk";
    const rule: FontClassRule = { ...DEFAULT_FONT_CLASS_RULES[cls], ...(ds.type.classes?.[cls] ?? {}) };
    const eyebrow = { ...DEFAULT_EYEBROW, ...(ds.type.eyebrow ?? {}) };
    const textCase = (c: "as-written" | "upper") => (c === "upper" ? "uppercase" : "none");
    // A font class's display leading wins over the ramp's, when it is tighter or looser on purpose.
    shared["--ds-leading-display"] = num(ds.type.leading?.display ?? rule.displayLeading);
    shared["--ds-display-weight"] = String(rule.displayWeight);
    shared["--ds-display-tracking"] = `${num(rule.displayTracking, 3)}em`;
    shared["--ds-display-case"] = textCase(rule.case);
    shared["--ds-heading-weight"] = String(rule.headingWeight);
    shared["--ds-heading-tracking"] = `${num(rule.headingTracking, 3)}em`;
    shared["--ds-heading-case"] = textCase(rule.case);
    shared["--ds-eyebrow-weight"] = String(eyebrow.weight);
    shared["--ds-eyebrow-tracking"] = `${num(eyebrow.tracking, 3)}em`;
    shared["--ds-eyebrow-case"] = textCase(eyebrow.case);
  }

  if (ds.space) {
    const i = DENSITY_INDEX[choices.density];
    shared["--ds-section-y-sm"] = fluid(SECTION_STEPS[i - 1]!);
    shared["--ds-section-y-md"] = fluid(SECTION_STEPS[i]!);
    shared["--ds-section-y-lg"] = fluid(SECTION_STEPS[i + 1]!);
    // Two neighbouring bands on the same surface read as one: the second loses its top padding.
    shared["--ds-collapse-top"] = "0px";
    shared["--ds-gutter"] = fluid({ min: 1, max: 3 });
    SPACE.forEach((rem, n) => (shared[`--ds-space-${n + 1}`] = `${num(rem)}rem`));
  }

  if (ds.shape) {
    const r = CORNER_RADII[choices.corners];
    shared["--ds-radius-sm"] = `${r.sm}px`;
    shared["--ds-radius-md"] = `${r.md}px`;
    shared["--ds-radius-lg"] = `${r.lg}px`;
    shared["--ds-radius-button"] = `${r.button}px`;
    shared["--ds-radius-image"] = `${r.image}px`;
    // genesis-ui's radii are steps around --radius (rounded-xl is --radius + 4px): cards (rounded-xl) get md.
    shared["--radius"] = `calc(${r.md}px - 4px)`;
    shared["--radius-2xl"] = `${r.lg}px`;
    shared["--ds-border-width"] = `${ds.shape.borderWidth ?? 1}px`;
  }

  if (ds.image) {
    shared["--ds-image-filter"] = IMAGE_FILTER_CSS[ds.image.filter ?? "none"];
    shared["--ds-image-grain"] = num((ds.image.grain ?? 0) / 100, 2);
  }

  if (ds.motion) {
    const m = MOTION[choices.motion];
    Object.assign(shared, {
      "--ds-ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
      "--ds-ease-swift": "cubic-bezier(0.2, 0.75, 0.5, 1)",
      "--ds-ease-in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
      "--ds-dur-press": choices.motion === "none" ? "0ms" : "120ms",
      "--ds-dur-hover": "200ms",
      "--ds-dur-ui": choices.motion === "none" ? "0ms" : "320ms",
      "--ds-dur-reveal": choices.motion === "none" ? "0ms" : "700ms",
      "--ds-dur-media": choices.motion === "none" ? "0ms" : "1100ms",
      "--ds-reveal": m.reveal,
      "--ds-reveal-phone": m.revealPhone,
      "--ds-reveal-distance": m.distance,
      "--ds-reveal-range": m.range,
      "--ds-hover-lift": m.lift,
    });
  }

  let light = { ...shared };
  let dark = { ...shared };
  let pal: Palette | undefined;
  const pairs: DesignSystemPair[] = [];
  if (ds.surfaces && input.colors) {
    pal = palette({ ...input.colors, ground: ds.surfaces.ground });
    light = { ...light, ...colorVars(pal.light, pal.light.scrimAlpha) };
    dark = { ...dark, ...colorVars(pal.dark, pal.dark.scrimAlpha) };
    for (const [mode, roles] of [["light", pal.light], ["dark", pal.dark]] as const) {
      for (const p of rolePairs(roles)) pairs.push({ ...p, mode });
    }
  }
  const shape = ds.shape;
  if (shape) {
    Object.assign(light, shadows(ds.surfaces?.ground === "night" ? "flat" : (shape.shadow ?? "flat"), pal?.light.ink ?? "#18181b"));
    // A dark ground has no shadows: elevation there comes from lightness.
    Object.assign(dark, shadows("flat", pal?.dark.ink ?? "#fafafa"));
  }
  return { id: ds.id, choices, variables: { light, dark }, ...(pal ? { palette: pal } : {}), pairs };
}
