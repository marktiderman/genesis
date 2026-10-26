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
  /** Display name, shown in the header and used as the logo's alt text. */
  name: string;
  /** Logo image URL. */
  logoUrl?: string;
  /** Accent colour: `#rgb`, `#rrggbb` or `rgb(r, g, b)`. Invalid or absent: Genesis's own primary. */
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

/** Parses `#rgb`, `#rrggbb` or `rgb(r, g, b)` / `rgb(r g b)`. Anything else: `null`. */
export function parseColor(input: string | undefined | null): Rgb | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
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

/** HSL (hue 0-360, saturation and lightness 0-100) to sRGB. */
export function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
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
  /** Contrast of the given accent against the background. */
  ratio: number;
  /** Contrast of `strong` against the background (at least `minRatio`). */
  strongRatio: number;
  /** True when `strong` had to be darkened from `accent`. */
  adjusted: boolean;
}

/**
 * The contrast fallback. Returns the accent unchanged when it reaches
 * `minRatio` against `background` (white by default); otherwise the same hue
 * and saturation at the highest lightness that does. The search walks
 * lightness down in 0.5% steps, so the shade stays as close to the brand as
 * the ratio allows, and it always ends: lightness 0 is black, 21:1.
 */
export function accessibleAccent(
  accent: Rgb | string,
  { background = WHITE, minRatio = MIN_TEXT_CONTRAST }: { background?: Rgb; minRatio?: number } = {},
): AccessibleAccent | null {
  const base = typeof accent === "string" ? parseColor(accent) : accent;
  if (!base) return null;
  const ratio = contrastRatio(base, background);
  if (ratio >= minRatio) return { accent: base, strong: base, ratio, strongRatio: ratio, adjusted: false };
  const { h, s, l } = rgbToHsl(base);
  let strong = base;
  let strongRatio = ratio;
  for (let next = l - 0.5; next >= 0; next -= 0.5) {
    strong = hslToRgb({ h, s, l: next });
    strongRatio = contrastRatio(strong, background);
    if (strongRatio >= minRatio) break;
  }
  if (strongRatio < minRatio) {
    strong = { r: 0, g: 0, b: 0 };
    strongRatio = contrastRatio(strong, background);
  }
  return { accent: base, strong, ratio, strongRatio, adjusted: true };
}

/**
 * The CSS variables for a brand's accent, for a page root's `style`. Empty
 * when the brand has no valid accent, so the page keeps Genesis's primary.
 */
export function brandThemeStyle(brand: Pick<PublicBrand, "accent"> | undefined): React.CSSProperties {
  const result = brand?.accent ? accessibleAccent(brand.accent) : null;
  if (!result) return {};
  const strong = toHslTriplet(result.strong);
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
