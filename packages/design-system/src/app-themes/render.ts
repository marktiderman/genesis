/**
 * An app theme as variables, as CSS scoped to `data-app-theme`, and checked for
 * contrast.
 */
import { brandRoleVariables, hslToRgb } from "../factories/brand-roles";
import { componentTokenCss } from "../tokens/component-tokens";
import { formatFontStack } from "../tokens/theme-css";
import { parsePartSelector, type AppTheme, type ThemePartStyles } from "./define";

type Mode = "light" | "dark";
type Rgb = [number, number, number];

/** The theme's variables per mode, as `{ "--primary": "243 75% 59%", "--font-sans": "…" }`. */
export interface AppThemeVariables {
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
 * (`brandRoleVariables`, web overrides applied), the roles it sets by hand,
 * its font stacks, then its component tokens (`darkTokens` over `tokens` in
 * dark mode).
 *
 * @stability Beta
 */
export function appThemeVariables(theme: AppTheme): AppThemeVariables {
  const base = brandRoleVariables(theme.brand, { platform: "web" });
  const out: AppThemeVariables = { light: { ...base.light }, dark: { ...base.dark } };
  for (const mode of ["light", "dark"] as const) {
    for (const [role, hex] of Object.entries(theme.roles?.[mode] ?? {})) {
      if (hex) out[mode][`--${role}`] = hexTriplet(hex);
    }
    for (const [font, stack] of Object.entries(theme.fonts ?? {})) {
      if (stack) out[mode][`--font-${font}`] = formatFontStack(stack);
    }
    const tokens = { ...theme.tokens, ...(mode === "dark" ? theme.darkTokens : {}) };
    for (const [name, value] of Object.entries(tokens)) {
      if (value) out[mode][`--${name}`] = componentTokenCss(name, value);
    }
  }
  return out;
}

export interface AppThemeCssOptions {
  /** The attribute that names the theme. Default `data-app-theme` (`data-theme` is Genesis's light and dark mode). */
  attribute?: string;
}

function block(selectors: string[], decls: Record<string, string>, scheme?: Mode): string {
  const lines = Object.entries(decls).map(([name, value]) => `  ${name}: ${value};`);
  return `${selectors.join(",\n")} {\n${scheme ? `  color-scheme: ${scheme};\n` : ""}${lines.join("\n")}\n}\n`;
}

/** A part selector under each scope: `card[variant=x]:hover` → `<scope> [data-slot="card"][data-variant="x"]:hover`. */
function partSelectors(selector: string, scopes: string[]): string[] {
  const parsed = parsePartSelector(selector);
  if ("problem" in parsed) return [];
  const compound = (part: (typeof parsed.parts)[number]) => {
    const filters = part.filters.map(([attr, value]) => (value === undefined ? `[data-${attr}]` : `[data-${attr}="${value}"]`)).join("");
    const state = part.state ? (part.state === "placeholder" ? "::placeholder" : `:${part.state}`) : "";
    return part.name === "root" ? `${filters}${state}` : `[data-slot="${part.name}"]${filters}${state}`;
  };
  const [first, ...rest] = parsed.parts;
  const tail = rest.map(compound).join(" ");
  return scopes.map((scope) => {
    const head = first!.name === "root" ? `${scope}${compound(first!)}` : `${scope} ${compound(first!)}`;
    return tail ? `${head} ${tail}` : head;
  });
}

function partBlocks(parts: ThemePartStyles | undefined, scopes: string[]): string[] {
  return Object.entries(parts ?? {}).flatMap(([selector, decls]) => {
    const selectors = partSelectors(selector, scopes);
    return selectors.length ? [block(selectors, { ...decls })] : [];
  });
}

/**
 * The theme as CSS, scoped to `[data-app-theme="<id>"]`: on `<html>` it themes
 * the whole app (portalled menus and dialogs too); on any other element, that
 * element and what's inside (menus and dialogs portalled out of it follow
 * the page's theme, so set it on `<html>` for a whole app). Dark mode follows Genesis's `.dark` class, on
 * the same element or an ancestor.
 *
 * In order: the variables (roles, fonts, tokens) per mode, the part styles
 * (`darkParts` after `parts`), then the raw `css` nested in the theme's scope.
 * Import it unlayered, after Genesis's stylesheets: its selectors outrank a
 * plain `:root` or `.dark` block, and its part styles beat the components'
 * own utility classes, which sit in Tailwind's layers.
 *
 * @stability Beta
 */
export function appThemeCss(theme: AppTheme, options: AppThemeCssOptions = {}): string {
  const attr = options.attribute ?? "data-app-theme";
  const on = `[${attr}="${theme.id}"]`;
  const light = [`:root${on}`, on];
  const dark = [`:root.dark${on}`, `.dark${on}`, `.dark ${on}`];
  const vars = appThemeVariables(theme);
  return [
    `/* ${theme.label}: ${theme.description} */`,
    block(light, vars.light, "light"),
    block(dark, vars.dark, "dark"),
    ...partBlocks(theme.parts, [on]),
    ...partBlocks(theme.darkParts, [`.dark${on}`, `.dark ${on}`]),
    ...(theme.css?.trim() ? [`${on} {\n${theme.css.trim().replace(/^/gm, "  ")}\n}\n`] : []),
  ].join("\n");
}

/** Every theme's CSS in one stylesheet: what `dist/themes/starter.css` holds for the starter themes. */
export function renderAppThemesCss(themes: readonly AppTheme[], options: AppThemeCssOptions = {}): string {
  return `/**
 * Genesis app themes, generated from src/app-themes. Do not edit by hand.
 *
 * Usage, unlayered, after genesis.css and the Tailwind bridge:
 *   @import "@marktiderman/genesis-design-system/themes/starter.css";
 * then set data-app-theme on <html> (the whole app) or on any element:
 *   <html data-app-theme="${themes[0]?.id ?? "tracker"}">
 * Themes: ${themes.map((t) => t.id).join(", ")}.
 * Load the fonts a theme names yourself; each stack falls back to system fonts.
 */

${themes.map((t) => appThemeCss(t, options)).join("\n")}`;
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
export const APP_THEME_PAIRS: readonly (readonly [string, string, number])[] = Object.freeze([
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

export interface AppThemeContrastProblem {
  theme: string;
  mode: Mode;
  foreground: string;
  background: string;
  ratio: number;
  minimum: number;
}

/**
 * Every pair in {@link APP_THEME_PAIRS} under its minimum, in either mode.
 * Empty for every theme Genesis ships (a test holds it there).
 *
 * @stability Beta
 */
export function appThemeContrastProblems(theme: AppTheme): AppThemeContrastProblem[] {
  const vars = appThemeVariables(theme);
  const problems: AppThemeContrastProblem[] = [];
  for (const mode of ["light", "dark"] as const) {
    for (const [fg, bg, minimum] of APP_THEME_PAIRS) {
      const a = tripletRgb(vars[mode][`--${fg}`]);
      const b = tripletRgb(vars[mode][`--${bg}`]);
      if (!a || !b) continue;
      const r = ratio(a, b);
      if (r < minimum) problems.push({ theme: theme.id, mode, foreground: fg, background: bg, ratio: Math.round(r * 100) / 100, minimum });
    }
  }
  return problems;
}
