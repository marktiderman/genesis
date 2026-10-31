/**
 * The colour engine: any brand colour in, a palette of colour roles out, in
 * light and dark, with every text pair solved to pass WCAG AA.
 *
 * It works in OKLCH (perceptual lightness, chroma, hue) and emits sRGB hex,
 * so every contrast is measured on the colour that is actually printed:
 *
 * - **Ramps.** Each brand colour gets an 11-step ramp at fixed lightness
 *   (50 … 950). Chroma follows the brand's, capped to the sRGB gamut and
 *   eased off at both ends. The brand's own hex replaces its nearest step,
 *   so the colour the owner chose appears unchanged.
 * - **Neutrals** take a hue and a very low chroma from the ground: `paper`
 *   (warm), `chalk` (cool), `pure` (the brand's hue, barely tinted) or
 *   `night` (dark). Ink is never `#000`; the ground is never `#fff`.
 * - **Roles.** The accent has a fill form (the brand colour as given, for
 *   buttons and bands) and a text form (walked down its ramp until it reads
 *   at 4.5:1 on every surface it sits on). Text on a fill is whichever of the
 *   tinted ink, the tinted ground, white or black reads best.
 *
 * Nothing here knows about CSS variables: see `tokens.ts` for that.
 */

// ── sRGB ↔ OKLab ────────────────────────────────────────────────────────────

/** An OKLCH colour: lightness 0–1, chroma 0–~0.37, hue in degrees. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` / `#aabbcc` → [r, g, b] in 0–1. Throws on anything else. */
export function hexToRgb(hex: string): [number, number, number] {
  if (!HEX.test(hex)) throw new Error(`"${hex}" is not a #rgb or #rrggbb colour.`);
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

/** [r, g, b] in 0–1 → `#rrggbb` (clamped). */
export function rgbToHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB hex → OKLCH. */
export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  const h = c < 1e-6 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** OKLCH → linear sRGB (may be out of gamut). */
function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: readonly number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** The most chroma sRGB can show at this lightness and hue, up to `c`. */
export function maxChroma(l: number, h: number, c = 0.4): number {
  if (inGamut(oklchToLinear({ l, c, h }))) return c;
  let lo = 0;
  let hi = c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear({ l, c: mid, h }))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** OKLCH → sRGB hex, reducing chroma (never lightness or hue) until it fits the gamut. */
export function oklchToHex(color: Oklch): string {
  const l = Math.max(0, Math.min(1, color.l));
  const c = Math.min(color.c, maxChroma(l, color.h, color.c));
  return rgbToHex(oklchToLinear({ l, c, h: color.h }).map(toGamma) as [number, number, number]);
}

// ── Contrast ────────────────────────────────────────────────────────────────

/** WCAG 2 relative luminance of a hex colour. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio (1–21) of two hex colours. */
export function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `top` over `bottom` at `alpha` (0–1), blended in sRGB as browsers do: a hex. */
export function composite(top: string, bottom: string, alpha: number): string {
  const t = hexToRgb(top);
  const b = hexToRgb(bottom);
  return rgbToHex([0, 1, 2].map((i) => t[i]! * alpha + b[i]! * (1 - alpha)) as [number, number, number]);
}

// ── Ramps and grounds ───────────────────────────────────────────────────────

/** The ramp's steps and their OKLCH lightness. */
export const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type RampStep = (typeof RAMP_STEPS)[number];
const RAMP_L: Record<RampStep, number> = { 50: 0.97, 100: 0.94, 200: 0.88, 300: 0.8, 400: 0.71, 500: 0.62, 600: 0.54, 700: 0.46, 800: 0.38, 900: 0.3, 950: 0.22 };
/** Chroma eases off toward both ends of the ramp. */
const RAMP_EASE: Record<RampStep, number> = { 50: 0.35, 100: 0.6, 200: 0.85, 300: 1, 400: 1, 500: 1, 600: 1, 700: 1, 800: 0.85, 900: 0.6, 950: 0.35 };

/** An 11-step ramp from one colour, with the colour itself at its nearest step. */
export function ramp(hex: string): Record<RampStep, string> {
  const base = hexToOklch(hex);
  const nearest = RAMP_STEPS.reduce((best, step) => (Math.abs(RAMP_L[step] - base.l) < Math.abs(RAMP_L[best] - base.l) ? step : best), RAMP_STEPS[0] as RampStep);
  const out = {} as Record<RampStep, string>;
  for (const step of RAMP_STEPS) {
    out[step] = step === nearest ? hex.toLowerCase() : oklchToHex({ l: RAMP_L[step], c: base.c * RAMP_EASE[step], h: base.h });
  }
  return out;
}

/** The page's ground: warm, cool, the brand's own hue barely tinted, or dark. */
export const GROUNDS = ["paper", "chalk", "pure", "night"] as const;
export type Ground = (typeof GROUNDS)[number];

interface GroundSpec {
  /** A fixed hue, or the brand's. */
  hue: number | "brand";
  chroma: number;
  ground: number;
  ink: number;
}

const GROUND_SPEC: Record<Ground, GroundSpec> = {
  paper: { hue: 75, chroma: 0.012, ground: 0.975, ink: 0.2 },
  chalk: { hue: 240, chroma: 0.006, ground: 0.985, ink: 0.2 },
  pure: { hue: "brand", chroma: 0.004, ground: 0.995, ink: 0.2 },
  night: { hue: "brand", chroma: 0.012, ground: 0.17, ink: 0.96 },
};

// ── Roles ───────────────────────────────────────────────────────────────────

/** Every colour a page draws, as sRGB hex. */
export interface ColorRoles {
  /** The page. */
  ground: string;
  /** Cards and anything raised above the page. */
  groundRaised: string;
  /** A quiet alternate band. */
  groundSunk: string;
  /** Body text. */
  ink: string;
  /** Quieter text: 4.5:1 on the ground, a raised card and a sunk band. */
  inkQuiet: string;
  /** Hairlines between things. */
  border: string;
  /** A form field's edge: 3:1 on the ground (WCAG 1.4.11). */
  inputBorder: string;
  /** The brand colour as a fill: buttons, chips, accent bands. */
  accentFill: string;
  /** Text on the accent fill. */
  onAccent: string;
  /** The accent as text, links and borders: 4.5:1 on the ground, raised and sunk. */
  accentText: string;
  /** A fill's edge when the fill itself is under 3:1 on the ground; otherwise the fill. */
  accentEdge: string;
  /** A soft accent band. */
  accentTint: string;
  /** Text on the soft accent band. */
  onTint: string;
  /** The inverse band (the page's colours swapped). */
  inverse: string;
  /** Text on the inverse band. */
  onInverse: string;
  /** The focus ring: 3:1 on every surface it can sit on. */
  focus: string;
  /**
   * The least opacity of `inverse` laid over a photo so `onInverse` text
   * reads at 4.5:1 whatever the photo (pure white or pure black under it).
   */
  scrimAlpha: number;
  /** The secondary colour's fill, text form and text-on-fill, when the brand has one. Never a band. */
  secondary?: { fill: string; onFill: string; text: string };
}

export interface PaletteInput {
  /** The brand's primary, as #rrggbb. */
  primary: string;
  /** Its dark-mode fill. Default: the primary with 12% less chroma. */
  primaryDark?: string;
  /** One optional supporting colour. */
  secondary?: string;
  /** The page's ground in light mode. Dark mode is always `night`. */
  ground: Ground;
}

export interface Palette {
  light: ColorRoles;
  dark: ColorRoles;
  /** The primary's ramp (and the secondary's), for illustrations and charts. */
  ramps: { primary: Record<RampStep, string>; secondary?: Record<RampStep, string> };
}

const AA = 4.5;
const NON_TEXT = 3;
/**
 * What the solver aims for: a little over the minimums, so the colour a
 * browser prints (genesis-ui reads roles as HSL triplets, rounded to 0.1)
 * still passes.
 */
const SOLVE_AA = 4.6;
const SOLVE_NON_TEXT = 3.1;

/** The first of `candidates` that reaches `min` on every background, else undefined. */
function firstPassing(candidates: readonly string[], backgrounds: readonly string[], min: number): string | undefined {
  return candidates.find((c) => backgrounds.every((b) => contrast(c, b) >= min));
}

/** Whichever of `options` reads best on `background`. */
function best(background: string, options: readonly string[]): string {
  return options.reduce((a, b) => (contrast(b, background) > contrast(a, background) ? b : a));
}

/**
 * Walk lightness from `start` toward `end` (in steps of 0.01) at this hue and
 * chroma until the colour reaches `min` on every background. Falls back to
 * `fallback`, which the caller makes sure passes.
 */
function solveLightness(start: number, end: number, c: number, h: number, backgrounds: readonly string[], min: number, fallback: string): string {
  const dir = end < start ? -1 : 1;
  for (let l = start; dir < 0 ? l >= end : l <= end; l += dir * 0.01) {
    const hex = oklchToHex({ l, c, h });
    if (backgrounds.every((b) => contrast(hex, b) >= min)) return hex;
  }
  return fallback;
}

/** Text on a fill: the tinted ink or ground when one reads at 4.5:1, else white or black, whichever reads better (always at least 4.58:1). */
function textOn(fill: string, deep: string, pale: string): string {
  const tinted = best(fill, [deep, pale]);
  return contrast(tinted, fill) >= SOLVE_AA ? tinted : best(fill, ["#ffffff", "#000000"]);
}

/** The accent as text: walk its ramp away from the ground until it reads on every surface. */
function accentAsText(rampOf: Record<RampStep, string>, base: Oklch, dark: boolean, surfaces: readonly string[], ink: string): string {
  const order = dark ? [...RAMP_STEPS].reverse() : [...RAMP_STEPS];
  const nearestL = RAMP_STEPS.reduce((b, s) => (Math.abs(RAMP_L[s] - base.l) < Math.abs(RAMP_L[b] - base.l) ? s : b), RAMP_STEPS[0] as RampStep);
  const from = order.indexOf(nearestL);
  const found = firstPassing(order.slice(from).map((s) => rampOf[s]), surfaces, SOLVE_AA);
  if (found) return found;
  // Past the ramp's end: keep walking in finer steps, then fall back to ink.
  return solveLightness(RAMP_L[order[order.length - 1]!], dark ? 1 : 0, base.c * 0.35, base.h, surfaces, SOLVE_AA, ink);
}

/** The least `inverse` opacity over a photo for `text` to read at 4.5:1 over a white and a black photo. */
function scrimAlphaFor(inverse: string, text: string): number {
  for (let a = 0.3; a <= 1.0001; a += 0.01) {
    const alpha = Math.round(a * 100) / 100;
    if (["#ffffff", "#000000"].every((photo) => contrast(text, composite(inverse, photo, alpha)) >= SOLVE_AA)) return alpha;
  }
  return 1;
}

function rolesFor(input: PaletteInput, mode: "light" | "dark"): ColorRoles {
  const dark = mode === "dark";
  const groundName: Ground = dark ? "night" : input.ground;
  const spec = GROUND_SPEC[groundName];
  const brand = hexToOklch(input.primary);
  const hue = spec.hue === "brand" ? brand.h : spec.hue;
  const night = groundName === "night";

  const ground = oklchToHex({ l: spec.ground, c: spec.chroma, h: hue });
  const groundRaised = oklchToHex({ l: night ? spec.ground + 0.04 : Math.min(0.995, spec.ground + 0.015), c: spec.chroma, h: hue });
  const groundSunk = oklchToHex({ l: night ? spec.ground + 0.035 : spec.ground - 0.03, c: spec.chroma * 1.2, h: hue });
  const ink = oklchToHex({ l: spec.ink, c: spec.chroma * 1.5, h: hue });
  const surfaces = [ground, groundRaised, groundSunk];
  // Quiet text starts well away from ink and walks toward it until it reads everywhere.
  const inkQuiet = solveLightness(night ? 0.68 : 0.52, spec.ink, spec.chroma * 2, hue, surfaces, SOLVE_AA, ink);
  const border = composite(ink, ground, 0.12);
  let inputBorder = border;
  for (let a = 0.12; a <= 1.0001; a += 0.02) {
    inputBorder = composite(ink, ground, Math.min(1, a));
    if (contrast(inputBorder, ground) >= SOLVE_NON_TEXT) break;
  }

  // The two tinted extremes: what text on a fill tries first.
  const deep = oklchToHex({ l: 0.2, c: spec.chroma * 1.5, h: hue });
  const pale = oklchToHex({ l: 0.975, c: spec.chroma, h: hue });

  const primary = input.primary.toLowerCase();
  const accentFill = dark ? (input.primaryDark?.toLowerCase() ?? oklchToHex({ l: brand.l, c: brand.c * 0.88, h: brand.h })) : primary;
  const onAccent = textOn(accentFill, deep, pale);
  const primaryRamp = ramp(primary);
  const accentText = accentAsText(primaryRamp, brand, night, surfaces, ink);
  const accentEdge = contrast(accentFill, ground) >= SOLVE_NON_TEXT ? accentFill : accentText;
  const accentTint = night ? oklchToHex({ l: 0.3, c: Math.min(brand.c, 0.12) * 0.6, h: brand.h }) : oklchToHex({ l: 0.94, c: Math.min(brand.c, 0.12) * 0.6, h: brand.h });
  const onTint = contrast(ink, accentTint) >= SOLVE_AA ? ink : textOn(accentTint, deep, pale);
  const inverse = ink;
  const onInverse = ground;
  const focus = firstPassing([accentText, ink], [...surfaces, accentTint], SOLVE_NON_TEXT) ?? ink;

  const roles: ColorRoles = {
    ground,
    groundRaised,
    groundSunk,
    ink,
    inkQuiet,
    border,
    inputBorder,
    accentFill,
    onAccent,
    accentText,
    accentEdge,
    accentTint,
    onTint,
    inverse,
    onInverse,
    focus,
    scrimAlpha: scrimAlphaFor(inverse, onInverse),
  };
  if (input.secondary) {
    const sec = hexToOklch(input.secondary);
    const fill = dark ? oklchToHex({ l: sec.l, c: sec.c * 0.88, h: sec.h }) : input.secondary.toLowerCase();
    roles.secondary = { fill, onFill: textOn(fill, deep, pale), text: accentAsText(ramp(input.secondary), sec, night, surfaces, ink) };
  }
  return roles;
}

/**
 * The palette for a brand: colour roles for light and dark, and the ramps.
 *
 * ```ts
 * const { light, dark } = palette({ primary: "#c6ff00", ground: "paper" });
 * light.accentFill; // "#c6ff00": buttons stay lime, with ink text on them
 * light.accentText; // a dark olive from the lime's ramp: links read at 4.5:1
 * ```
 *
 * @stability Beta
 */
export function palette(input: PaletteInput): Palette {
  hexToRgb(input.primary);
  if (input.primaryDark) hexToRgb(input.primaryDark);
  if (input.secondary) hexToRgb(input.secondary);
  return {
    light: rolesFor(input, "light"),
    dark: rolesFor(input, "dark"),
    ramps: { primary: ramp(input.primary), ...(input.secondary ? { secondary: ramp(input.secondary) } : {}) },
  };
}

/** A pair of colours the page draws together, and the ratio it must reach. */
export interface ContrastPair {
  /** What the pair is: "quiet text on a sunk band". */
  name: string;
  foreground: string;
  background: string;
  /** 4.5 for text, 3 for focus rings and other non-text marks. */
  minimum: number;
}

/** Every pair the roles promise, for a contrast check or a test. */
export function rolePairs(r: ColorRoles): ContrastPair[] {
  const pairs: ContrastPair[] = [
    { name: "body text on the page", foreground: r.ink, background: r.ground, minimum: AA },
    { name: "body text on a raised card", foreground: r.ink, background: r.groundRaised, minimum: AA },
    { name: "body text on a sunk band", foreground: r.ink, background: r.groundSunk, minimum: AA },
    { name: "quiet text on the page", foreground: r.inkQuiet, background: r.ground, minimum: AA },
    { name: "quiet text on a raised card", foreground: r.inkQuiet, background: r.groundRaised, minimum: AA },
    { name: "quiet text on a sunk band", foreground: r.inkQuiet, background: r.groundSunk, minimum: AA },
    { name: "text on the accent fill", foreground: r.onAccent, background: r.accentFill, minimum: AA },
    { name: "accent text on the page", foreground: r.accentText, background: r.ground, minimum: AA },
    { name: "accent text on a raised card", foreground: r.accentText, background: r.groundRaised, minimum: AA },
    { name: "accent text on a sunk band", foreground: r.accentText, background: r.groundSunk, minimum: AA },
    { name: "text on the accent tint", foreground: r.onTint, background: r.accentTint, minimum: AA },
    { name: "text on the inverse band", foreground: r.onInverse, background: r.inverse, minimum: AA },
    { name: "text over a photo's scrim (white photo)", foreground: r.onInverse, background: composite(r.inverse, "#ffffff", r.scrimAlpha), minimum: AA },
    { name: "text over a photo's scrim (black photo)", foreground: r.onInverse, background: composite(r.inverse, "#000000", r.scrimAlpha), minimum: AA },
    { name: "the focus ring on the page", foreground: r.focus, background: r.ground, minimum: NON_TEXT },
    { name: "the focus ring on a raised card", foreground: r.focus, background: r.groundRaised, minimum: NON_TEXT },
    { name: "the focus ring on a sunk band", foreground: r.focus, background: r.groundSunk, minimum: NON_TEXT },
    { name: "the focus ring on the accent tint", foreground: r.focus, background: r.accentTint, minimum: NON_TEXT },
    { name: "a form field's edge on the page", foreground: r.inputBorder, background: r.ground, minimum: NON_TEXT },
  ];
  if (r.secondary) {
    pairs.push(
      { name: "text on the secondary fill", foreground: r.secondary.onFill, background: r.secondary.fill, minimum: AA },
      { name: "secondary text on the page", foreground: r.secondary.text, background: r.ground, minimum: AA },
      { name: "secondary text on a sunk band", foreground: r.secondary.text, background: r.groundSunk, minimum: AA },
    );
  }
  return pairs;
}

/** `#4f46e5` → `243 75% 59%`: the HSL triplet genesis-ui's role variables hold (`hsl(var(--primary))`). */
export function hexToHslTriplet(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  return `${round(h)} ${round(s * 100)}% ${round(l * 100)}%`;
}
