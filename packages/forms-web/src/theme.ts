/**
 * A form's own look: an accent colour and a header image. The accent becomes
 * the Genesis `--primary` (and `--ring`) inside the form, so every primary
 * surface follows it: buttons, selected options, stars, progress, focus rings.
 */
export interface FormTheme {
  /**
   * The accent colour, as `#rgb`, `#rrggbb` or `rgb(r, g, b)`, such as a
   * brand's colour. It is adjusted only as far as needed for contrast: at
   * least 3:1 against the page (light and dark), with text on it at least
   * 4.5:1 (white or near-black, whichever reads better). Anything else is ignored.
   */
  accent?: string | undefined;
  /** A banner image URL shown over the form's title. */
  headerImage?: string | undefined;
  /** The banner's text alternative. Default "" (decorative). */
  headerImageAlt?: string | undefined;
}

/** Shadcn HSL components (`"221 83% 53%"`), as Genesis tokens hold them. */
export interface ThemeColors {
  primary: string;
  primaryForeground: string;
}

type Rgb = [number, number, number];

/** `#rgb`, `#rrggbb` or `rgb(r, g, b)` (0–255); null for anything else. */
function parseColor(value: string): Rgb | null {
  const v = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return [...m[1]!].map((c) => parseInt(c + c, 16)) as Rgb;
  m = /^#([0-9a-f]{6})$/.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1]!.slice(i, i + 2), 16)) as Rgb;
  m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v);
  if (m) {
    const rgb = [m[1], m[2], m[3]].map(Number) as Rgb;
    return rgb.every((c) => c <= 255) ? rgb : null;
  }
  return null;
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((x) => Math.round(x * 255)) as Rgb;
}

/** WCAG relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const c = (x: number) => {
    const n = x / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const WHITE: Rgb = [255, 255, 255];
/** Genesis's dark background and dark foreground, `240 10% 3.9%`. */
const NEAR_BLACK: Rgb = hslToRgb(240, 10, 3.9);
const WHITE_HSL = "0 0% 100%";
const NEAR_BLACK_HSL = "240 10% 3.9%";

const fmt = (h: number, s: number, l: number) => `${Math.round(h)} ${Math.round(s)}% ${Math.round(l * 10) / 10}%`;

function fit(h: number, s: number, l: number, page: Rgb, darken: boolean): ThemeColors {
  let light = l;
  // At least 3:1 with the page (WCAG 1.4.11: borders, icons, focus rings).
  for (let i = 0; i < 100 && contrast(hslToRgb(h, s, light), page) < 3; i++) light = Math.max(0, Math.min(100, light + (darken ? -1 : 1)));
  // Text on the accent at least 4.5:1: white or near-black, whichever is higher;
  // in the narrow middle where neither reaches it, lighten under near-black text.
  const best = () => {
    const rgb = hslToRgb(h, s, light);
    const white = contrast(rgb, WHITE);
    const dark = contrast(rgb, NEAR_BLACK);
    return white >= dark ? { ratio: white, fg: WHITE_HSL } : { ratio: dark, fg: NEAR_BLACK_HSL };
  };
  let pick = best();
  for (let i = 0; i < 100 && pick.ratio < 4.5; i++) {
    light = Math.min(100, light + 1);
    pick = { ratio: contrast(hslToRgb(h, s, light), NEAR_BLACK), fg: NEAR_BLACK_HSL };
  }
  return { primary: fmt(h, s, light), primaryForeground: pick.fg };
}

/**
 * The accent as Genesis primary colours for a light and a dark page, each
 * adjusted only as far as contrast needs. Null when `accent` is not a colour
 * this understands.
 */
export function themeColors(accent: string): { light: ThemeColors; dark: ThemeColors } | null {
  const rgb = parseColor(accent);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb);
  return { light: fit(h, s, l, WHITE, true), dark: fit(h, s, l, NEAR_BLACK, false) };
}

/** The CSS that applies `theme` to the elements matching `selector`, or "" when it changes no colour. */
export function themeCss(theme: FormTheme | undefined, selector: string): string {
  const colors = theme?.accent ? themeColors(theme.accent) : null;
  if (!colors) return "";
  const block = (c: ThemeColors) => `--primary: ${c.primary}; --primary-foreground: ${c.primaryForeground}; --ring: ${c.primary};`;
  return `${selector} { ${block(colors.light)} }\n.dark ${selector}, ${selector}.dark { ${block(colors.dark)} }`;
}
