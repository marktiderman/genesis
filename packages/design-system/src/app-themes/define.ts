/**
 * App themes: a whole-app look, as far as a theme wants to take it.
 *
 * A theme changes how every part of a Genesis app looks, the way a site theme
 * does, without forking a component. It works in layers, and each is
 * optional; a theme uses the lowest one that does the job:
 *
 *   1. `brand`: colours, radius and status, light and dark, solved for
 *      contrast (`brandRoleVariables`).
 *   2. `roles`: any colour role set by hand, per mode: the sidebar, a card
 *      apart from the page.
 *   3. `fonts`: the sans, display and mono stacks.
 *   4. `tokens` (and `darkTokens`): component sizes, shapes and type
 *      (`COMPONENT_TOKENS`): control height, card shadow, button case, table
 *      cell padding, page title weight…
 *   5. `parts` (and `darkParts`): CSS declarations for any named part
 *      (`THEME_PARTS`): `card`, `button[variant=outline]`,
 *      `shell-nav-item[active]:hover`. A part style beats the component's own
 *      classes, so it can change anything about it.
 *   6. `css`: raw CSS nested in the theme's scope, for what parts can't say
 *      (keyframes, a pseudo-element, a selector across parts).
 *   7. `shell`: the app shell's layout (density, rail width, collapsed rail,
 *      sub-navigation), which genesis-ui's `appShellOptionsFromTheme` passes
 *      to `AppShell`.
 *
 * Every layer is presentation only: a theme never changes what a component
 * does, what data it shows or who may see it. Themes are code an app ships,
 * reviewed like code; `css` especially is trusted as written, so a theme is
 * never built from what a user types.
 */
import { validateBrand, type CanonicalBrand } from "../schema/brand";
import { COMPONENT_TOKENS, componentTokenProblem } from "../tokens/component-tokens";
import { getThemePart } from "../tokens/theme-parts";
import { THEME_SECTIONS } from "../tokens/theme-css";

/** Every colour role a theme can set by hand: the names `themes/genesis.css` declares, without `--`. */
export const THEME_ROLES: readonly string[] = Object.freeze(
  THEME_SECTIONS.flatMap((section) => section.vars.filter((v) => v.kind === "color").map((v) => v.name)),
);

/** The font stacks a theme can set: `--font-sans`, `--font-display`, `--font-mono`. */
export const THEME_FONTS = ["sans", "display", "mono"] as const;
export type ThemeFont = (typeof THEME_FONTS)[number];

/** The app shell's layout choices a theme can make (the same names and values as `AppShellOptions`). */
export interface AppThemeShell {
  /** Row padding in the sidebar and lists. */
  density?: "comfortable" | "compact";
  /** The expanded sidebar's width. */
  railWidth?: "narrow" | "wide";
  /** Open the sidebar collapsed to an icon rail. */
  defaultCollapsed?: boolean;
  /** The collapsed rail's width in px. */
  collapsedRailWidth?: 56 | 64;
  /** How a page's own sub-navigation shows. */
  subNav?: "section" | "tabs" | "sidebar" | "off";
}

const SHELL_VALUES: Record<keyof AppThemeShell, readonly unknown[]> = {
  density: ["comfortable", "compact"],
  railWidth: ["narrow", "wide"],
  defaultCollapsed: [true, false],
  collapsedRailWidth: [56, 64],
  subNav: ["section", "tabs", "sidebar", "off"],
};

/** Colour roles set by hand, as `#rgb` or `#rrggbb`: `{ "sidebar-background": "#1d2327" }`. */
export type ThemeRoleColors = Readonly<Partial<Record<string, string>>>;
/** Component token values, by name without `--`: `{ "control-height": "2rem" }`. */
export type ThemeTokenValues = Readonly<Partial<Record<string, string>>>;
/** CSS declarations, by property (kebab-case, custom properties allowed): `{ "box-shadow": "none" }`. */
export type ThemeDeclarations = Readonly<Record<string, string>>;
/** Declarations per part selector: `{ "card": { … }, "button[variant=outline]:hover": { … } }`. */
export type ThemePartStyles = Readonly<Record<string, ThemeDeclarations>>;

export interface AppThemeInput {
  /** Lowercase letters, digits and hyphens: what `data-app-theme` names. */
  name: string;
  /** Its name in a picker. */
  label: string;
  description: string;
  /** The kind of product whose feel it follows, in words ("keyboard-first issue trackers"). */
  feel: string;
  /** The work it suits, for a picker or a zone map ("issues", "tasks", "journal"). */
  suits: readonly string[];
  /** Colours, radius and status: every role the brand says something about. */
  brand: CanonicalBrand;
  /** Roles set by hand, per mode, applied over the brand's. */
  roles?: { light?: ThemeRoleColors; dark?: ThemeRoleColors };
  /** Font stacks, as CSS (`"Inter", ui-sans-serif, sans-serif`). Unset keeps the host's. */
  fonts?: Readonly<Partial<Record<ThemeFont, string>>>;
  /** Component tokens, in both modes. */
  tokens?: ThemeTokenValues;
  /** Component tokens in dark mode only (a shadow, usually), over `tokens`. */
  darkTokens?: ThemeTokenValues;
  /** Declarations per part, in both modes. */
  parts?: ThemePartStyles;
  /** Declarations per part in dark mode only, over `parts`. */
  darkParts?: ThemePartStyles;
  /**
   * Raw CSS, nested inside the theme's scope (`[data-app-theme="<id>"] { … }`):
   * a bare declaration styles the themed element, a nested rule
   * (`[data-slot="card"]:hover { … }`) its descendants. Trusted as written.
   */
  css?: string;
  /** The app shell's layout. */
  shell?: AppThemeShell;
}

/** A defined theme: its input, frozen, with its id (its name). */
export type AppTheme = Readonly<AppThemeInput> & { readonly id: string };

const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** A font stack is written into CSS: names, quotes, commas, digits and spaces only. */
const FONT_STACK = /^[A-Za-z0-9 ,"'_-]+$/;
const PROPERTY = /^(?:--[a-z0-9-]+|-?[a-z][a-z-]*)$/;
const UNSAFE_VALUE = /[;{}<>\\]|@import|expression\(|javascript:/i;

/**
 * A part selector: up to three parts, each a part name with optional
 * `[attribute]` / `[attribute=value]` filters and one state, separated by
 * spaces (a part inside a part). `root` is the themed element itself.
 */
const STATES = ["hover", "focus-visible", "focus-within", "active", "disabled", "first-child", "last-child", "placeholder"] as const;
const COMPOUND = new RegExp(`^([a-z][a-z0-9-]*)((?:\\[[a-z][a-z-]*(?:=[a-z0-9-]+)?\\])*)(?::(${STATES.join("|")}))?$`);

/** A part selector's compounds: `card [variant=x]:hover` parts, or a problem. */
export function parsePartSelector(selector: string): { parts: { name: string; filters: [string, string | undefined][]; state?: string }[] } | { problem: string } {
  const compounds = selector.trim().split(/\s+/);
  if (compounds.length === 0 || compounds.length > 3) return { problem: "one to three parts, separated by spaces" };
  const parts = [];
  for (const [i, compound] of compounds.entries()) {
    const m = COMPOUND.exec(compound);
    if (!m) return { problem: `"${compound}": a part name, [attribute] or [attribute=value] filters, and one of :${STATES.join(", :")}` };
    const name = m[1]!;
    if (name === "root" ? i !== 0 : !getThemePart(name) && !name.startsWith("app-"))
      return { problem: `"${name}": not a Genesis part (THEME_PARTS); name an app's own part app-<name>` };
    const filters = [...(m[2] ?? "").matchAll(/\[([a-z][a-z-]*)(?:=([a-z0-9-]+))?\]/g)].map((f) => [f[1]!, f[2]] as [string, string | undefined]);
    parts.push({ name, filters, ...(m[3] ? { state: m[3] } : {}) });
  }
  return { parts };
}

function declarationProblems(path: string, decls: unknown): string[] {
  if (!decls || typeof decls !== "object" || Array.isArray(decls)) return [`${path}: expected declarations`];
  const errors: string[] = [];
  for (const [prop, value] of Object.entries(decls)) {
    if (!PROPERTY.test(prop)) errors.push(`${path}.${prop}: a CSS property in kebab-case`);
    else if (typeof value !== "string" || !value.trim() || UNSAFE_VALUE.test(value)) errors.push(`${path}.${prop}: a value without ; { } < > or \\`);
  }
  return errors;
}

/** Whether braces balance and no rule closes the theme's scope early (strings and comments aside). */
function balanced(css: string): boolean {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "");
  let depth = 0;
  for (const ch of bare) {
    if (ch === "{") depth++;
    else if (ch === "}" && --depth < 0) return false;
  }
  return depth === 0;
}

/** Every problem with a theme input; empty when it is sound. */
export function validateAppTheme(input: AppThemeInput): string[] {
  const errors: string[] = [];
  const t = input as Partial<AppThemeInput> | undefined;
  if (!t || typeof t !== "object") return ["appTheme: expected object"];
  if (typeof t.name !== "string" || !NAME.test(t.name)) errors.push("appTheme.name: lowercase letters, digits and hyphens, starting with a letter");
  for (const key of ["label", "description", "feel"] as const) {
    if (typeof t[key] !== "string" || !t[key]!.trim()) errors.push(`appTheme.${key}: expected a non-empty string`);
  }
  if (!Array.isArray(t.suits) || t.suits.length === 0 || !t.suits.every((s) => typeof s === "string" && s.trim()))
    errors.push("appTheme.suits: expected at least one non-empty string");
  const brand = validateBrand(t.brand);
  if (!brand.ok) errors.push(...brand.errors.map((e) => `appTheme.brand: ${e}`));
  for (const mode of ["light", "dark"] as const) {
    for (const [role, value] of Object.entries(t.roles?.[mode] ?? {})) {
      if (!THEME_ROLES.includes(role)) errors.push(`appTheme.roles.${mode}.${role}: not a theme role`);
      else if (typeof value !== "string" || !HEX.test(value)) errors.push(`appTheme.roles.${mode}.${role}: expected #rgb or #rrggbb`);
    }
  }
  for (const [key, stack] of Object.entries(t.fonts ?? {})) {
    if (!(THEME_FONTS as readonly string[]).includes(key)) errors.push(`appTheme.fonts.${key}: one of ${THEME_FONTS.join(", ")}`);
    else if (typeof stack !== "string" || !stack.trim() || !FONT_STACK.test(stack)) errors.push(`appTheme.fonts.${key}: a font stack (names, quotes and commas)`);
  }
  for (const key of ["tokens", "darkTokens"] as const) {
    for (const [name, value] of Object.entries(t[key] ?? {})) {
      const problem = componentTokenProblem(name, value);
      if (problem) errors.push(`appTheme.${key}: ${problem}`);
    }
  }
  for (const key of ["parts", "darkParts"] as const) {
    for (const [selector, decls] of Object.entries(t[key] ?? {})) {
      const parsed = parsePartSelector(selector);
      if ("problem" in parsed) errors.push(`appTheme.${key}["${selector}"]: ${parsed.problem}`);
      errors.push(...declarationProblems(`appTheme.${key}["${selector}"]`, decls));
    }
  }
  if (t.css !== undefined) {
    if (typeof t.css !== "string") errors.push("appTheme.css: expected a string");
    else if (/<\/|@import/i.test(t.css)) errors.push("appTheme.css: no @import and no </");
    else if (!balanced(t.css)) errors.push("appTheme.css: braces don't balance");
  }
  for (const [key, value] of Object.entries(t.shell ?? {})) {
    const allowed = SHELL_VALUES[key as keyof AppThemeShell];
    if (!allowed) errors.push(`appTheme.shell.${key}: one of ${Object.keys(SHELL_VALUES).join(", ")}`);
    else if (!allowed.includes(value)) errors.push(`appTheme.shell.${key}: one of ${allowed.join(", ")}`);
  }
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
 * Define a theme: checks it and returns it frozen, with its id. Throws with
 * every problem when it isn't sound.
 *
 * @stability Beta
 */
export function defineAppTheme(input: AppThemeInput): AppTheme {
  const errors = validateAppTheme(input);
  if (errors.length) throw new Error(`Theme "${String(input?.name)}" isn't valid:\n- ${errors.join("\n- ")}`);
  return deepFreeze({ ...structuredClone(input), id: input.name });
}

/** Every component token's name, for a picker or an editor. */
export const THEME_TOKEN_NAMES: readonly string[] = Object.freeze(COMPONENT_TOKENS.map((token) => token.name));
