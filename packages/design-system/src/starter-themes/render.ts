/**
 * A starter theme as theme role variables, as CSS scoped to `data-theme`,
 * and checked for contrast.
 */
import { brandRoleVariables, hslToRgb } from "../factories/brand-roles";
import { formatFontStack } from "../tokens/theme-css";
import type { StarterTheme } from "./define";

type Mode = "light" | "dark";
type Rgb = [number, number, number];

/** The theme's variables per mode, as `{ "--primary": "243 75% 59%", "--font-sans": "…" }`. */
export interface StarterThemeVariables {
  light: Record<string, string>;
  dark: Record<string, string>;
}

function parseHex(hex: string): Rgb {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** `#1d2327` → `204 14.6% 13.3%`, the format of every role variable. */
function hexTriplet(hex: string): string {
  const [r, g, b] = parseHex(hex).map((c) => c / 255) as Rgb;
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

/**
 * Every variable the theme sets, per mode: the brand's theme roles
 * (`brandRoleVariables`, web overrides applied), then the roles it sets by
 * hand, then its font stacks.
 *
 * @stability Beta
 */
export function starterThemeVariables(theme: StarterTheme): StarterThemeVariables {
  const base = brandRoleVariables(theme.brand, { platform: "web" });
  const out: StarterThemeVariables = { light: { ...base.light }, dark: { ...base.dark } };
  for (const mode of ["light", "dark"] as const) {
    for (const [role, hex] of Object.entries(theme.roles?.[mode] ?? {})) {
      if (hex) out[mode][`--${role}`] = hexTriplet(hex);
    }
    for (const [font, stack] of Object.entries(theme.fonts ?? {})) {
      if (stack) out[mode][`--font-${font}`] = formatFontStack(stack);
    }
  }
  return out;
}

export interface StarterThemeCssOptions {
  /** The attribute that names the theme. Default `data-theme`. */
  attribute?: string;
}

function block(selectors: string[], vars: Record<string, string>, scheme: Mode): string {
  const lines = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
  return `${selectors.join(",\n")} {\n  color-scheme: ${scheme};\n${lines.join("\n")}\n}\n`;
}

/**
 * The theme as CSS, scoped to `[data-theme="<id>"]`: on `<html>` it themes
 * the whole app (portalled menus and dialogs too); on any other element, that
 * element and what's inside. Dark mode follows Genesis's `.dark` class, on
 * the same element or an ancestor.
 *
 * The selectors outrank a plain `:root` or `.dark` block, so an app's own
 * brand overrides (`:root { --primary: … }`) give way while a theme is set,
 * and come back when it is removed.
 *
 * @stability Beta
 */
export function starterThemeCss(theme: StarterTheme, options: StarterThemeCssOptions = {}): string {
  const attr = options.attribute ?? "data-theme";
  const on = `[${attr}="${theme.id}"]`;
  const vars = starterThemeVariables(theme);
  return [
    `/* ${theme.label}: ${theme.description} */`,
    block([`:root${on}`, on], vars.light, "light"),
    block([`:root.dark${on}`, `.dark${on}`, `.dark ${on}`], vars.dark, "dark"),
  ].join("\n");
}

/** Every theme's CSS in one stylesheet: what `dist/themes/starter.css` holds. */
export function renderStarterThemesCss(themes: readonly StarterTheme[], options: StarterThemeCssOptions = {}): string {
  return `/**
 * Genesis starter themes, generated from src/starter-themes. Do not edit by hand.
 *
 * Usage, after genesis.css and the Tailwind bridge:
 *   @import "@marktiderman/genesis-design-system/themes/starter.css";
 * then set data-theme on <html> (the whole app) or on any element:
 *   <html data-theme="${themes[0]?.id ?? "tracker"}">
 * Themes: ${themes.map((t) => t.id).join(", ")}.
 * Load the fonts a theme names yourself; each stack falls back to system fonts.
 */

${themes.map((t) => starterThemeCss(t, options)).join("\n")}`;
}

// ── Contrast ────────────────────────────────────────────────────────────────

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function tripletRgb(triplet: string | undefined): Rgb | null {
  const [h, s, l] = (triplet ?? "").split(" ").map((p) => parseFloat(p));
  if (![h, s, l].every((n) => Number.isFinite(n))) return null;
  return hslToRgb(h!, s!, l!);
}

/**
 * The pairs genesis-ui draws, foreground on background, with their WCAG
 * minimum: 4.5:1 for text, 3:1 for the focus ring. The sidebar's active item
 * is `text-sidebar-primary` on `bg-sidebar-accent`.
 */
export const STARTER_THEME_PAIRS: readonly (readonly [string, string, number])[] = Object.freeze([
  ["foreground", "background", 4.5],
  ["card-foreground", "card", 4.5],
  ["popover-foreground", "popover", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["muted-foreground", "card", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["primary-text", "background", 4.5],
  ["primary-text", "card", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["sidebar-foreground", "sidebar-background", 4.5],
  ["sidebar-accent-foreground", "sidebar-accent", 4.5],
  ["sidebar-primary", "sidebar-accent", 4.5],
  ["sidebar-primary-foreground", "sidebar-primary", 4.5],
  ["ring", "background", 3],
] as const);

export interface StarterThemeContrastProblem {
  theme: string;
  mode: Mode;
  foreground: string;
  background: string;
  ratio: number;
  minimum: number;
}

/**
 * Every pair in {@link STARTER_THEME_PAIRS} under its minimum, in either mode.
 * Empty for every theme Genesis ships (a test holds it there).
 *
 * @stability Beta
 */
export function starterThemeContrastProblems(theme: StarterTheme): StarterThemeContrastProblem[] {
  const vars = starterThemeVariables(theme);
  const problems: StarterThemeContrastProblem[] = [];
  for (const mode of ["light", "dark"] as const) {
    for (const [fg, bg, minimum] of STARTER_THEME_PAIRS) {
      const a = tripletRgb(vars[mode][`--${fg}`]);
      const b = tripletRgb(vars[mode][`--${bg}`]);
      if (!a || !b) continue;
      const r = ratio(a, b);
      if (r < minimum) problems.push({ theme: theme.id, mode, foreground: fg, background: bg, ratio: Math.round(r * 100) / 100, minimum });
    }
  }
  return problems;
}
