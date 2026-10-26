import type * as React from "react";

/**
 * Brand theming for public pages: a host's brand object becomes CSS
 * variables on a page root, so every Genesis component inside it (a
 * `Button`, a focus ring, a link styled `text-primary`) picks up the accent
 * without knowing a brand exists.
 *
 * The accent is the one colour a public page takes from outside the token
 * set, and it is the one most likely to be unreadable: brand palettes are
 * picked for logos, not for 14px text. Emerald `#10b981` with white text is
 * 2.5:1, half of WCAG AA's 4.5:1. So the accent is never used as-is for
 * text or for a button's fill. {@link accessibleAccent} keeps its hue and
 * saturation and lowers its lightness until white text on it (and it as
 * text on white) clears 4.5:1; the raw accent stays available for
 * decoration (`--brand-accent`: a header rule, a border).
 *
 * Variables set (all HSL triplets, the same shape as Genesis tokens, so
 * `hsl(var(--x))` works everywhere):
 *
 * - `--brand-accent`: the accent exactly as given. Decoration only.
 * - `--brand-accent-strong`: the accessible shade. Text and fills.
 * - `--brand-accent-foreground`: text on `--brand-accent-strong`.
 * - `--primary`, `--primary-foreground`, `--ring`: the Genesis tokens,
 *   pointed at the accessible shade, which is what makes nested components
 *   follow the brand.
 */

/** What a host knows about the brand a public page belongs to. */
export interface PublicBrand {
  /** Display name, shown in the header beside the logo (so the logo itself is decorative, `alt=""`). */
  name: string;
  /** Logo image URL. */
  logoUrl?: string;
  /**
   * Accent colour: `#rgb`, `#rrggbb`, `rgb()`/`rgba()`, `hsl()`/`hsla()` or a
   * bare token triplet like `"160 84% 39%"`. Alpha is ignored (the accent is
   * treated as opaque). Invalid or absent: Genesis's own primary.
   */
  accent?: string;
  /** Optional wide cover image above the header row. Decorative. */
  headerImageUrl?: string;
}

/** An sRGB colour, 0-255 per channel. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** WCAG AA for normal-size text. */
export const MIN_TEXT_CONTRAST = 4.5;

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)`;
const HUE = `(${NUM})(?:deg)?`;
const PCT = `(${NUM})%?`;
const ALPHA = String.raw`(?:\s*[,/]\s*${NUM}%?)?`;
const SEP = String.raw`(?:\s*,\s*|\s+)`;
const HSL_FN = new RegExp(String.raw`^hsla?\(\s*${HUE}${SEP}${PCT}${SEP}${PCT}${ALPHA}\s*\)$`);
// Bare shadcn-style token triplet: percentages required so it can't be read as rgb.
const HSL_BARE = new RegExp(String.raw`^${HUE}\s+(${NUM})%\s+(${NUM})%$`);

/**
 * Parses `#rgb`, `#rrggbb`, `rgb()`/`rgba()`, `hsl()`/`hsla()` (commas or
 * spaces, optional `/` or `,` alpha, which is ignored) and bare HSL triplets
 * like `"160 84% 39%"`. Anything else, including out-of-range channels: `null`.
 * Never throws.
 */
export function parseColor(input: string | undefined | null): Rgb | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  if (!value) return null;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
  if (hex) {
    const digits = hex[1]!;
    const full = digits.length === 3 ? digits.replace(/./g, (c) => c + c) : digits;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }
  const fn = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(value);
  if (fn) {
    const [r, g, b] = [fn[1], fn[2], fn[3]].map(Number) as [number, number, number];
    if ([r, g, b].every((c) => c <= 255)) return { r, g, b };
    return null;
  }
  const hsl = HSL_FN.exec(value) ?? HSL_BARE.exec(value);
  if (hsl) {
    const [h, sat, l] = [hsl[1], hsl[2], hsl[3]].map(Number) as [number, number, number];
    if (![h, sat, l].every(Number.isFinite) || sat < 0 || sat > 100 || l < 0 || l > 100) return null;
    return hslToRgb({ h, s: sat, l });
  }
  return null;
}

/** WCAG 2 relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** sRGB to HSL: hue 0-360, saturation and lightness 0-100. */
export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

/** HSL (hue 0-360, saturation and lightness 0-100) to sRGB, channels rounded to 8 bits. */
export function hslToRgb(hsl: { h: number; s: number; l: number }): Rgb {
  const { r, g, b } = hslToRgbExact(hsl);
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

/** The Genesis token shape: `"160 84% 39%"`, for `hsl(var(--x))`. */
export function toHslTriplet(color: Rgb): string {
  const { h, s, l } = rgbToHsl(color);
  return `${round(h)} ${round(s)}% ${round(l)}%`;
}

const round = (n: number) => Math.round(n * 10) / 10;

export interface AccessibleAccent {
  /** The accent as given. */
  accent: Rgb;
  /** The shade to use for text on white and for fills under white text. Equals `accent` when it already passes. */
  strong: Rgb;
  /**
   * `strong` as the exact HSL triplet to emit (`"H S% L%"`, 0.1 precision).
   * The contrast check runs on this value, not on the unrounded colour, so
   * what the browser renders is what was checked.
   */
  strongTriplet: string;
  /** Contrast of the given accent against the background. */
  ratio: number;
  /** Contrast of `strongTriplet`, as rendered, against the background (at least `minRatio`). */
  strongRatio: number;
  /** True when `strong` had to be darkened from `accent`. */
  adjusted: boolean;
}

/** HSL to sRGB without rounding the channels, for checking what a browser may render. */
function hslToRgbExact({ h, s, l }: { h: number; s: number; l: number }): Rgb {
  const hn = ((h % 360) + 360) % 360;
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + hn / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

/**
 * Contrast of an emitted HSL triplet against `background`: the worse of the
 * exact colour and its 8-bit rendering, so neither a float nor a quantising
 * renderer can land under the target.
 */
function emittedRatio(hsl: { h: number; s: number; l: number }, background: Rgb): number {
  return Math.min(contrastRatio(hslToRgbExact(hsl), background), contrastRatio(hslToRgb(hsl), background));
}

const tripletOf = ({ h, s, l }: { h: number; s: number; l: number }) => `${h} ${s}% ${l}%`;

/**
 * The contrast fallback. Returns the accent unchanged when its emitted
 * triplet reaches `minRatio` against `background` (white by default);
 * otherwise the same (rounded) hue and saturation at the highest lightness,
 * to 0.1%, whose emitted triplet does. Every check runs on the value
 * that is actually emitted, after rounding. It always ends: lightness 0 is
 * black, 21:1 on white.
 */
export function accessibleAccent(
  accent: Rgb | string,
  { background = WHITE, minRatio = MIN_TEXT_CONTRAST }: { background?: Rgb; minRatio?: number } = {},
): AccessibleAccent | null {
  const base = typeof accent === "string" ? parseColor(accent) : accent;
  if (!base) return null;
  const ratio = contrastRatio(base, background);
  const exact = rgbToHsl(base);
  const h = round(exact.h);
  const s = round(exact.s);
  const l = round(exact.l);
  const emitted = emittedRatio({ h, s, l }, background);
  if (emitted >= minRatio) {
    return { accent: base, strong: base, strongTriplet: tripletOf({ h, s, l }), ratio, strongRatio: emitted, adjusted: false };
  }
  // Lightness in integer tenths (no float drift). Walk down in whole
  // percents to the first passing shade, then take the lightest passing
  // tenth above it, so the result stays as close to the brand as it can.
  const start = Math.round(l * 10);
  const pick = (tenths: number) => {
    const candidate = { h, s, l: tenths / 10 };
    const strongRatio = emittedRatio(candidate, background);
    return strongRatio >= minRatio ? { candidate, strongRatio } : null;
  };
  for (let coarse = start - 10; coarse > -10; coarse -= 10) {
    const floor = Math.max(coarse, 0);
    const passing = pick(floor);
    if (!passing) continue;
    let best = passing;
    for (let fine = Math.min(floor + 9, start - 1); fine > floor; fine -= 1) {
      const found = pick(fine);
      if (found) {
        best = found;
        break;
      }
    }
    const { candidate, strongRatio } = best;
    return { accent: base, strong: hslToRgb(candidate), strongTriplet: tripletOf(candidate), ratio, strongRatio, adjusted: true };
  }
  const black = { h: 0, s: 0, l: 0 };
  return {
    accent: base,
    strong: { r: 0, g: 0, b: 0 },
    strongTriplet: tripletOf(black),
    ratio,
    strongRatio: emittedRatio(black, background),
    adjusted: true,
  };
}

/**
 * The CSS variables for a brand's accent, for a page root's `style`. Empty
 * when the brand has no valid accent, so the page keeps Genesis's primary.
 */
export function brandThemeStyle(brand: Pick<PublicBrand, "accent"> | undefined): React.CSSProperties {
  const result = brand?.accent ? accessibleAccent(brand.accent) : null;
  if (!result) return {};
  const strong = result.strongTriplet;
  const foreground = toHslTriplet(WHITE);
  return {
    "--brand-accent": toHslTriplet(result.accent),
    "--brand-accent-strong": strong,
    "--brand-accent-foreground": foreground,
    "--primary": strong,
    "--primary-foreground": foreground,
    "--ring": strong,
  } as React.CSSProperties;
}
