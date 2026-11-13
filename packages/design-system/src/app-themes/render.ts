/**
 * App brands and app themes as variables and as CSS scoped to their
 * attributes; brands checked for contrast.
 */
import { brandRoleVariables, hslToRgb } from "../factories/brand-roles";
import { COMPONENT_TOKENS, componentTokenCss } from "../tokens/component-tokens";
import { formatFontStack } from "../tokens/theme-css";
import { parsePartSelector, type AppBrand, type AppTheme, type ThemePartStyles } from "./define";

type Mode = "light" | "dark";
type Rgb = [number, number, number];

/** Variables per mode, as `{ "--primary": "243 75% 59%", "--font-sans": "…" }`. */
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
 * Every variable an app brand sets, per mode: its theme roles
 * (`brandRoleVariables`, web overrides applied), the roles it sets by hand,
 * then its font stacks.
 *
 * @stability Beta
 */
export function appBrandVariables(brand: AppBrand): AppThemeVariables {
  const base = brandRoleVariables(brand.brand, { platform: "web" });
  const out: AppThemeVariables = { light: { ...base.light }, dark: { ...base.dark } };
  // Corners are a theme's (its `radius` token), unless the brand names a radius itself.
  if (!brand.brand.radius) {
    delete out.light["--radius"];
    delete out.dark["--radius"];
  }
  for (const mode of ["light", "dark"] as const) {
    for (const [role, hex] of Object.entries(brand.roles?.[mode] ?? {})) {
      if (hex) out[mode][`--${role}`] = hexTriplet(hex);
    }
    for (const [font, stack] of Object.entries(brand.fonts ?? {})) {
      if (stack) out[mode][`--font-${font}`] = formatFontStack(stack);
    }
  }
  return out;
}

/**
 * Every variable an app theme sets, per mode: its component tokens
 * (`darkTokens` over `tokens` in dark mode).
 *
 * @stability Beta
 */
export function appThemeVariables(theme: AppTheme): AppThemeVariables {
  const out: AppThemeVariables = { light: {}, dark: {} };
  // A token computed from --radius is resolved where it's declared (:root), so a theme set on an
  // inner element that changes the radius declares them again in its own scope.
  const derived = theme.tokens?.["radius"]
    ? Object.fromEntries(COMPONENT_TOKENS.filter((t) => t.default.includes("var(--radius)")).map((t) => [t.name, t.default]))
    : {};
  for (const mode of ["light", "dark"] as const) {
    const tokens = { ...derived, ...theme.tokens, ...(mode === "dark" ? theme.darkTokens : {}) };
    for (const [name, value] of Object.entries(tokens)) {
      if (value) out[mode][`--${name}`] = componentTokenCss(name, value);
    }
  }
  return out;
}

export interface AppThemeCssOptions {
  /**
   * The attribute that names it. Default `data-app-brand` for a brand and
   * `data-app-theme` for a theme (`data-theme` is Genesis's light and dark mode).
   */
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

const scopes = (on: string) => ({ light: [`:root${on}`, on], dark: [`:root.dark${on}`, `.dark${on}`, `.dark ${on}`] });

/**
 * An app brand as CSS, scoped to `[data-app-brand="<id>"]`: its colour roles
 * and fonts, light and `.dark` (on the same element or an ancestor). On
 * `<html>` it colours the whole app, portalled menus and dialogs too; on any
 * other element, that element and what's inside.
 *
 * @stability Beta
 */
export function appBrandCss(brand: AppBrand, options: AppThemeCssOptions = {}): string {
  const on = `[${options.attribute ?? "data-app-brand"}="${brand.id}"]`;
  const vars = appBrandVariables(brand);
  const s = scopes(on);
  return [`/* Brand · ${brand.label}: ${brand.description} */`, block(s.light, vars.light, "light"), block(s.dark, vars.dark, "dark")].join("\n");
}

/**
 * An app theme as CSS, scoped to `[data-app-theme="<id>"]`: its component
 * tokens, its part styles (`darkParts` after `parts`), then its raw `css`
 * nested in its scope. Its colours come from whatever brand is set.
 *
 * Import it unlayered, after Genesis's stylesheets: its selectors outrank a
 * plain `:root` or `.dark` block, and its part styles beat the components'
 * own utility classes, which sit in Tailwind's layers.
 *
 * @stability Beta
 */
export function appThemeCss(theme: AppTheme, options: AppThemeCssOptions = {}): string {
  const on = `[${options.attribute ?? "data-app-theme"}="${theme.id}"]`;
  const vars = appThemeVariables(theme);
  const s = scopes(on);
  return [
    `/* Theme · ${theme.label}: ${theme.description} */`,
    ...(Object.keys(vars.light).length ? [block(s.light, vars.light)] : []),
    ...(Object.keys(vars.dark).length && theme.darkTokens ? [block(s.dark, vars.dark)] : []),
    ...partBlocks(theme.parts, [on]),
    ...partBlocks(theme.darkParts, [`.dark${on}`, `.dark ${on}`]),
    ...(theme.css?.trim() ? [`${on} {\n${theme.css.trim().replace(/^/gm, "  ")}\n}\n`] : []),
  ].join("\n");
}

/** Brands' and themes' CSS in one stylesheet: what `dist/themes/starter.css` holds for the starters. */
export function renderAppThemesCss(brands: readonly AppBrand[], themes: readonly AppTheme[]): string {
  return `/**
 * Genesis app brands and app themes, generated from src/app-themes. Do not edit by hand.
 *
 * Usage, unlayered, after genesis.css and the Tailwind bridge:
 *   @import "@marktiderman/genesis-design-system/themes/starter.css";
 * then, on <html> (the whole app) or on any element, choose each on its own:
 *   <html data-app-brand="${brands[0]?.id ?? "tracker"}" data-app-theme="${themes[0]?.id ?? "tracker"}">
 * Brands (colours, fonts): ${brands.map((b) => b.id).join(", ")}.
 * Themes (layout, shape): ${themes.map((t) => t.id).join(", ")}.
 * Load the fonts a brand names yourself; each stack falls back to system fonts.
 */

${[...brands.map((b) => appBrandCss(b)), ...themes.map((t) => appThemeCss(t))].join("\n")}`;
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
export const APP_BRAND_PAIRS: readonly (readonly [string, string, number])[] = Object.freeze([
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

export interface AppBrandContrastProblem {
  brand: string;
  mode: Mode;
  foreground: string;
  background: string;
  ratio: number;
  minimum: number;
}

/**
 * Every pair in {@link APP_BRAND_PAIRS} under its minimum, in either mode.
 * Empty for every theme Genesis ships (a test holds it there).
 *
 * @stability Beta
 */
export function appBrandContrastProblems(brand: AppBrand): AppBrandContrastProblem[] {
  const vars = appBrandVariables(brand);
  const problems: AppBrandContrastProblem[] = [];
  for (const mode of ["light", "dark"] as const) {
    for (const [fg, bg, minimum] of APP_BRAND_PAIRS) {
      const a = tripletRgb(vars[mode][`--${fg}`]);
      const b = tripletRgb(vars[mode][`--${bg}`]);
      if (!a || !b) continue;
      const r = ratio(a, b);
      if (r < minimum) problems.push({ brand: brand.id, mode, foreground: fg, background: bg, ratio: Math.round(r * 100) / 100, minimum });
    }
  }
  return problems;
}
