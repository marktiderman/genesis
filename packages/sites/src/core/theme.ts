/**
 * A site's theme, from its brand: one `<style>` of CSS variables per site.
 *
 * The brand comes from the host (`BrandSource`) at render time, never copied
 * into the site. A publish checks the brand's colours and records its hash;
 * a page rendered with a different brand (edited since) is served with a
 * short cache and a warning until the site is published again, which checks
 * the new colours and purges the old pages. It
 * may be a full `CanonicalBrand` or the minimal shape a brand screen collects
 * (`SiteBrand`: a name, a primary colour for light and dark, a heading and a
 * body font from a fixed list, a logo).
 *
 * The variables are design-system `themeFromBrand(brand).variables` (the
 * brand's scales, `--color-*`) plus the genesis-ui roles the sections are
 * styled with (`--primary`, `--background`, `--font-display`, ...), so the
 * one shared stylesheet serves every brand. Foregrounds are picked for
 * contrast: the text on a primary button is whichever of the brand's light
 * or dark text reads better, and the focus ring falls back to the text
 * colour when the primary is too faint on the page.
 */
import { genesisBrand, themeFromBrand, type CanonicalBrand } from "@marktiderman/genesis-design-system";
import { SELF_HOSTED_FONTS } from "./fonts";
import type { BodyFontChoice, FontChoice, SiteDoc, TokenOverrides } from "./schemas";

/** The minimal brand: what a brand screen collects. */
export interface SiteBrand {
  name: string;
  colors: {
    /** The primary colour in light mode, as #rrggbb. */
    primary: string;
    /** The primary in dark mode. Default: the light primary, lightened. */
    primaryDark?: string;
  };
  fonts?: { heading?: FontChoice; body?: BodyFontChoice };
  /** The logo, shown in the header and footer and named in JSON-LD. */
  logo?: { src: string; alt?: string };
}

/** What a `BrandSource` may return: the minimal brand, or a full design-system brand (with an optional logo). */
export type BrandInput = SiteBrand | (CanonicalBrand & { logo?: { src: string; alt?: string }; displayName?: string });

/** The host's brand, read at render time. */
export interface BrandSource {
  getBrand(siteId: string): Promise<BrandInput | null> | BrandInput | null;
}

export interface FontInfo {
  /** The choice's id (`inter`). */
  id: FontChoice;
  label: string;
  /** The CSS font stack. */
  stack: string;
  /** The family this package serves itself (latin woff2 under `/_gs/`), when it isn't a system font. */
  family?: string;
  /** The weights served. Empty for a system font. */
  weights: readonly number[];
  /** A display face with one weight: a heading font only. */
  headingOnly?: boolean;
}

const sans = (family: string) => `${family.includes(" ") ? `"${family}"` : family}, ui-sans-serif, system-ui, sans-serif`;
const serif = (family: string) => `${family.includes(" ") ? `"${family}"` : family}, Georgia, serif`;

function served(id: Exclude<FontChoice, "system">, label: string, stack: (family: string) => string): FontInfo {
  const font = SELF_HOSTED_FONTS[id];
  return { id, label, stack: stack(font.family), family: font.family, weights: font.weights, ...(font.weights.length === 1 ? { headingOnly: true } : {}) };
}

/** The fonts a brand or site may choose. Every one but `system` is served by this package; none loads from a third party. */
export const FONT_CHOICES: Readonly<Record<FontChoice, FontInfo>> = Object.freeze({
  system: { id: "system", label: "System", stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', weights: [] },
  inter: served("inter", "Inter", sans),
  "dm-sans": served("dm-sans", "DM Sans", sans),
  "work-sans": served("work-sans", "Work Sans", sans),
  montserrat: served("montserrat", "Montserrat", sans),
  poppins: served("poppins", "Poppins", sans),
  "space-grotesk": served("space-grotesk", "Space Grotesk", sans),
  "source-serif": served("source-serif", "Source Serif", serif),
  merriweather: served("merriweather", "Merriweather", serif),
  "playfair-display": served("playfair-display", "Playfair Display", serif),
  lora: served("lora", "Lora", serif),
  barlow: served("barlow", "Barlow", sans),
  "barlow-condensed": served("barlow-condensed", "Barlow Condensed", sans),
  oswald: served("oswald", "Oswald", sans),
  "roboto-condensed": served("roboto-condensed", "Roboto Condensed", sans),
  "bebas-neue": served("bebas-neue", "Bebas Neue", (family) => `"${family}", Impact, ui-sans-serif, sans-serif`),
});

const RADIUS: Record<NonNullable<TokenOverrides["radius"]>, string> = { none: "0rem", sm: "0.25rem", md: "0.5rem", lg: "0.75rem", full: "1.25rem" };

// ── Colour maths ────────────────────────────────────────────────────────────

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` / `#aabbcc` → [r, g, b] (0–255). Throws on anything else. */
export function parseHex(hex: string): [number, number, number] {
  if (!HEX.test(hex)) throw new Error(`"${hex}" is not a #rgb or #rrggbb colour.`);
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (rgb: [number, number, number]) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1–21) of two colours. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mix a colour toward white (`amount` > 0) or black (< 0), 0–1. */
export function mix(hex: string, amount: number): string {
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return toHex(parseHex(hex).map((c) => c + (target - c) * t) as [number, number, number]);
}

/** `#4f46e5` → `243 75% 59%`: the HSL triplet genesis-ui's variables hold. */
export function hexToHslTriplet(hex: string): string {
  const [r, g, b] = parseHex(hex).map((c) => c / 255) as [number, number, number];
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

/** Whichever of `a` and `b` reads better on `background`. */
function readableOn(background: string, a: string, b: string): string {
  return contrastRatio(background, a) >= contrastRatio(background, b) ? a : b;
}

// ── Brand → canonical brand ─────────────────────────────────────────────────

export function isSiteBrand(brand: BrandInput): brand is SiteBrand {
  return typeof (brand as SiteBrand).colors === "object" && !("neutral" in brand);
}

/** The minimal brand as a design-system brand (Genesis's neutrals and status colours, the brand's primary and fonts). */
export function toCanonicalBrand(brand: BrandInput): CanonicalBrand {
  if (!isSiteBrand(brand)) {
    const { logo: _logo, displayName: _displayName, ...canonical } = brand as CanonicalBrand & { logo?: unknown; displayName?: unknown };
    return canonical;
  }
  const primary = brand.colors.primary.toLowerCase();
  parseHex(primary);
  const primaryDark = (brand.colors.primaryDark ?? mix(primary, 0.35)).toLowerCase();
  parseHex(primaryDark);
  const heading = FONT_CHOICES[brand.fonts?.heading ?? "inter"] ?? FONT_CHOICES.inter;
  const chosenBody = FONT_CHOICES[brand.fonts?.body ?? "inter"];
  // A one-weight display face reads badly as body text: the schema refuses it, and so does this.
  const body = chosenBody && !chosenBody.headingOnly ? chosenBody : FONT_CHOICES.inter;
  return {
    ...genesisBrand,
    name: brand.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "site",
    accent: { DEFAULT: primary, light: primary, dark: primaryDark },
    typography: {
      fontFamily: { body: body.stack.split(/,\s*/), display: heading.stack.split(/,\s*/) },
    },
  };
}

/** The brand's display name: the minimal brand's `name`, a canonical brand's `displayName` or `name`. */
export function brandDisplayName(brand: BrandInput): string {
  return isSiteBrand(brand) ? brand.name : ((brand as { displayName?: string }).displayName ?? brand.name);
}

// ── The theme ───────────────────────────────────────────────────────────────

export interface ThemePair {
  /** What the pair is, for an accessibility issue: "body text on the page". */
  name: string;
  mode: "light" | "dark";
  foreground: string;
  background: string;
  /** The ratio it must reach: 4.5 for text, 3 for the focus ring and other non-text marks. */
  minimum: number;
  /**
   * `error` (default) blocks the publish; `warning` is shown but doesn't. A
   * mark that never carries meaning alone (each one also has text or a shape)
   * warns, so a light brand colour can still publish.
   */
  severity?: "error" | "warning";
}

export interface SiteTheme {
  light: Record<string, string>;
  dark: Record<string, string>;
  colorScheme: "light" | "dark" | "auto";
  /** The fonts the site uses, to load. */
  fonts: FontInfo[];
  /** The headings' font, when it is one of `FONT_CHOICES`: the page preloads it. */
  headingFont?: FontInfo;
  /** The colour pairs the sections draw, for the contrast check. */
  pairs: ThemePair[];
  /** Hash of the brand and overrides it was made from (recorded on a release). */
  brandHash: string;
}

interface ModeColours {
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  ring: string;
  border: string;
}

function modeColours(brand: CanonicalBrand, mode: "light" | "dark"): ModeColours {
  const n = brand.neutral;
  const light = mode === "light";
  const background = (light ? brand.surface.light : brand.surface.dark) ?? brand.surface.DEFAULT;
  const foreground = (light ? brand.text.light : brand.text.dark) ?? brand.text.DEFAULT;
  const primary = (light ? brand.accent.light : brand.accent.dark) ?? brand.accent.DEFAULT;
  const muted = light ? (n["100"] ?? mix(background, -0.04)) : (n["800"] ?? mix(background, 0.08));
  // One step darker (lighter in dark mode) than shadcn's default, so quiet copy reaches 4.5:1 on a muted band too.
  const mutedForeground = light ? (n["600"] ?? mix(foreground, 0.3)) : (n["400"] ?? mix(foreground, -0.3));
  const border = light ? (n["200"] ?? mix(background, -0.1)) : (n["700"] ?? mix(background, 0.15));
  // White or the darkest neutral, whichever reads better; black when neither
  // reaches 4.5:1 (white or black always does, at worst about 4.58:1).
  let primaryForeground = readableOn(primary, "#ffffff", n["900"] ?? "#09090b");
  if (contrastRatio(primary, primaryForeground) < 4.5) primaryForeground = readableOn(primary, "#ffffff", "#000000");
  const ring = contrastRatio(primary, background) >= 3 ? primary : foreground;
  return { background, foreground, muted, mutedForeground, primary, primaryForeground, ring, border };
}

function roleVars(c: ModeColours): Record<string, string> {
  const hsl = hexToHslTriplet;
  return {
    "--background": hsl(c.background),
    "--foreground": hsl(c.foreground),
    "--card": hsl(c.background),
    "--card-foreground": hsl(c.foreground),
    "--popover": hsl(c.background),
    "--popover-foreground": hsl(c.foreground),
    "--primary": hsl(c.primary),
    "--primary-foreground": hsl(c.primaryForeground),
    "--secondary": hsl(c.muted),
    "--secondary-foreground": hsl(c.foreground),
    "--muted": hsl(c.muted),
    "--muted-foreground": hsl(c.mutedForeground),
    "--accent": hsl(c.muted),
    "--accent-foreground": hsl(c.foreground),
    "--border": hsl(c.border),
    "--input": hsl(c.border),
    "--ring": hsl(c.ring),
  };
}

function pairsFor(c: ModeColours, mode: "light" | "dark"): ThemePair[] {
  return [
    { name: "body text on the page", mode, foreground: c.foreground, background: c.background, minimum: 4.5 },
    { name: "quiet text on the page", mode, foreground: c.mutedForeground, background: c.background, minimum: 4.5 },
    { name: "quiet text on a muted band", mode, foreground: c.mutedForeground, background: c.muted, minimum: 4.5 },
    { name: "body text on a muted band", mode, foreground: c.foreground, background: c.muted, minimum: 4.5 },
    { name: "button and accent-band text on the primary colour", mode, foreground: c.primaryForeground, background: c.primary, minimum: 4.5 },
    { name: "text on an inverse band", mode, foreground: c.background, background: c.foreground, minimum: 4.5 },
    { name: "the focus ring on the page", mode, foreground: c.ring, background: c.background, minimum: 3 },
    // Non-text (1.4.11): the primary colour as a border or marker (a timetable chip, the picked day, a timeline's step).
    // Every such mark also has text or a shape (a chip names its type, a marker shows a dot), so it warns.
    { name: "the primary colour as a border or marker on the page", mode, foreground: c.primary, background: c.background, minimum: 3, severity: "warning" },
  ];
}

/** FNV-1a, 32 bits twice: a short, stable hash for cache keys and release records (not for security). */
export function stableHash(value: unknown): string {
  const text = JSON.stringify(value, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/**
 * The site's theme: variables for light and dark, the fonts to load, the
 * pairs the contrast check reads, and a hash of what it was made from.
 *
 * @stability Beta
 */
export function siteTheme(brand: BrandInput, theme: Partial<SiteDoc["theme"]> = {}): SiteTheme {
  const canonical = toCanonicalBrand(brand);
  const overrides = theme.overrides ?? {};
  const base = themeFromBrand(canonical).variables;
  const fontStack = (family: "body" | "display") => canonical.typography?.fontFamily?.[family]?.join(", ");
  const headingFont = overrides.headingFont ? FONT_CHOICES[overrides.headingFont] : undefined;
  const bodyFont = overrides.bodyFont ? FONT_CHOICES[overrides.bodyFont] : undefined;
  const fontVars: Record<string, string> = {};
  const sans = bodyFont?.stack ?? fontStack("body");
  const display = headingFont?.stack ?? fontStack("display") ?? sans;
  if (sans) fontVars["--font-sans"] = sans;
  if (display) fontVars["--font-display"] = display;
  if (overrides.radius) fontVars["--radius"] = RADIUS[overrides.radius];

  const light = modeColours(canonical, "light");
  const dark = modeColours(canonical, "dark");
  const usedFonts = new Map<string, FontInfo>();
  const choiceFor = (stack: string | undefined) => Object.values(FONT_CHOICES).find((f) => f.stack === stack);
  for (const stack of [sans, display]) {
    const info = choiceFor(stack);
    if (info) usedFonts.set(info.id, info);
  }
  const headingChoice = choiceFor(display);
  const colorScheme = theme.colorScheme ?? "light";
  const pairs = colorScheme === "light" ? pairsFor(light, "light") : colorScheme === "dark" ? pairsFor(dark, "dark") : [...pairsFor(light, "light"), ...pairsFor(dark, "dark")];
  return {
    light: { ...base.light, ...roleVars(light), ...fontVars },
    dark: { ...base.dark, ...roleVars(dark), ...fontVars },
    colorScheme,
    fonts: [...usedFonts.values()],
    ...(headingChoice ? { headingFont: headingChoice } : {}),
    pairs,
    brandHash: stableHash({ brand: canonical, overrides, colorScheme }),
  };
}

/** A CSS value from the theme, made safe to print inside a `<style>`: no `<`, braces or semicolons. */
function cssValue(value: string): string {
  return value.replace(/[<>{};\\]/g, "");
}

function block(selector: string, vars: Record<string, string>): string {
  const lines = Object.entries(vars)
    .filter(([name]) => /^--[a-z0-9-]+$/i.test(name))
    .map(([name, value]) => `${name}:${cssValue(value)}`);
  return `${selector}{${lines.join(";")}}`;
}

/** The site's `<style>` body: the light variables on `:root`, the dark ones by scheme. */
export function themeCss(theme: SiteTheme): string {
  if (theme.colorScheme === "dark") return block(":root", theme.dark) + ":root{color-scheme:dark}";
  if (theme.colorScheme === "auto") {
    return `${block(":root", theme.light)}:root{color-scheme:light dark}@media (prefers-color-scheme: dark){${block(":root", theme.dark)}}`;
  }
  return block(":root", theme.light) + ":root{color-scheme:light}";
}
