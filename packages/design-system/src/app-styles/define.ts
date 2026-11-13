/**
 * App brands and app styles: how a Genesis app looks, in two independent
 * pieces an app combines freely (ADR 0018).
 *
 * An **app brand** is colours and typefaces: a `CanonicalBrand` (colours,
 * status, light and dark, solved for contrast), colour `roles` set by hand
 * (the sidebar, a card apart from the page) and `fonts`. It is set with
 * `data-app-brand="<id>"`.
 *
 * An **app style** is every component's size and shape, with no colours of
 * its own:
 *
 *   1. `tokens` (and `darkTokens`): component sizes, shapes and type sizes
 *      and weights (`COMPONENT_TOKENS`): control height, card shadow, button
 *      case, table cell padding, page title weight…
 *   2. `parts` (and `darkParts`): CSS declarations for any named part
 *      (`THEME_PARTS`): `card`, `button[variant=outline]`,
 *      `shell-nav-item[active]:hover`. A part style beats the component's own
 *      classes, so it can change anything about it. Colours in it come from
 *      roles (`hsl(var(--primary))`), so it takes on whatever brand is set.
 *   3. `css`: raw CSS nested in the style's scope, for what parts can't say.
 *
 * It is set with `data-app-style="<id>"`. Any brand works with any style: the
 * Genesis brand with the `press` style, an app's own brand with `tracker`. A
 * starter style names the brand it was designed with (`pairsWith`); nothing
 * requires it.
 *
 * Both are presentation only: never what a component does, what data it
 * shows or who may see it. The **app theme**, which bundles a brand, a style
 * and a layout (and the views a theme picks), is genesis-ui's
 * (`@marktiderman/genesis-ui/themes`), because a layout is the components'.
 * Light, dark or system is the person's **appearance** (`GenesisThemeProvider`),
 * not either of these.
 *
 * Brands and styles are code an app ships, reviewed like code; `css`
 * especially is trusted as written, so neither is ever built from what a
 * user types.
 */
import { validateBrand, type CanonicalBrand } from "../schema/brand";
import { COMPONENT_TOKENS, componentTokenProblem } from "../tokens/component-tokens";
import { getThemePart } from "../tokens/theme-parts";
import { THEME_SECTIONS } from "../tokens/theme-css";

/** Every colour role a brand can set by hand: the names `themes/genesis.css` declares, without `--`. */
export const THEME_ROLES: readonly string[] = Object.freeze(
  THEME_SECTIONS.flatMap((section) => section.vars.filter((v) => v.kind === "color").map((v) => v.name)),
);

/** The font stacks a brand can set: `--font-sans`, `--font-display`, `--font-mono`. */
export const THEME_FONTS = ["sans", "display", "mono"] as const;
export type ThemeFont = (typeof THEME_FONTS)[number];

/** Colour roles set by hand, as `#rgb` or `#rrggbb`: `{ "sidebar-background": "#1d2327" }`. */
export type ThemeRoleColors = Readonly<Partial<Record<string, string>>>;
/** Component token values, by name without `--`: `{ "control-height": "2rem" }`. */
export type ThemeTokenValues = Readonly<Partial<Record<string, string>>>;
/** CSS declarations, by property (kebab-case, custom properties allowed): `{ "box-shadow": "none" }`. */
export type ThemeDeclarations = Readonly<Record<string, string>>;
/** Declarations per part selector: `{ "card": { … }, "button[variant=outline]:hover": { … } }`. */
export type ThemePartStyles = Readonly<Record<string, ThemeDeclarations>>;

export interface AppBrandInput {
  /** Lowercase letters, digits and hyphens: what `data-app-brand` names. */
  name: string;
  /** Its name in a picker. */
  label: string;
  description: string;
  /** Colours, radius and status: every role the brand says something about. */
  brand: CanonicalBrand;
  /** Colour roles set by hand, per mode, applied over the brand's. */
  roles?: { light?: ThemeRoleColors; dark?: ThemeRoleColors };
  /** Font stacks, as CSS (`"Inter", ui-sans-serif, sans-serif`). Unset keeps the host's. */
  fonts?: Readonly<Partial<Record<ThemeFont, string>>>;
  /**
   * The app's name as people see it ("Acme Studio"): the shell's title. Not `label`, which names
   * the brand in a picker.
   */
  appName?: string;
  /** The full logo (a wordmark, usually wide), with a version for dark backgrounds if it needs one. */
  logo?: AppBrandImage;
  /** The square icon: the collapsed rail, a tab's favicon, a phone's header. */
  mark?: AppBrandImage;
}

/**
 * A brand image: a URL (`https:`, a path from the site's root, or an inline `data:image/…`),
 * its words for a screen reader, and, if the image doesn't read on a dark ground, a dark one.
 */
export interface AppBrandImage {
  src: string;
  /** What it says: the app's name, usually. Empty for a mark beside the name, which says it already. */
  alt: string;
  /** Shown instead of `src` in dark appearance. */
  darkSrc?: string;
}

/** A defined app brand: its input, frozen, with its id (its name). */
export type AppBrand = Readonly<AppBrandInput> & { readonly id: string };

export interface AppStyleInput {
  /** Lowercase letters, digits and hyphens: what `data-app-style` names. */
  name: string;
  /** Its name in a picker. */
  label: string;
  description: string;
  /** The kind of product whose feel it follows, in words ("keyboard-first issue trackers"). */
  feel: string;
  /** The work it suits, for a picker or a zone map ("issues", "tasks", "journal"). */
  suits: readonly string[];
  /** The app brand it was designed with, by id: a suggestion for a picker, never a requirement. */
  pairsWith?: string;
  /** Component tokens, in both modes. */
  tokens?: ThemeTokenValues;
  /** Component tokens in dark mode only (a shadow, usually), over `tokens`. */
  darkTokens?: ThemeTokenValues;
  /** Declarations per part, in both modes. Colours only through roles: `hsl(var(--primary))`. */
  parts?: ThemePartStyles;
  /** Declarations per part in dark mode only, over `parts`. */
  darkParts?: ThemePartStyles;
  /**
   * Raw CSS, nested inside the style's scope (`[data-app-style="<id>"] { … }`):
   * a bare declaration styles the styled element, a nested rule
   * (`[data-slot="card"]:hover { … }`) its descendants. Trusted as written.
   */
  css?: string;
}

/** A defined app style: its input, frozen, with its id (its name). */
export type AppStyle = Readonly<AppStyleInput> & { readonly id: string };

const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** A font stack is written into CSS: names, quotes, commas, digits and spaces only. */
const FONT_STACK = /^[A-Za-z0-9 ,"'_-]+$/;
const PROPERTY = /^(?:--[a-z0-9-]+|-?[a-z][a-z-]*)$/;
const UNSAFE_VALUE = /[;{}<>\\]|\/\*|\*\/|@import|expression\(|javascript:/i;

/**
 * A part selector: up to three parts, each a part name with optional
 * `[attribute]` / `[attribute=value]` filters and one state, separated by
 * spaces (a part inside a part). `root` is the styled element itself.
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

/** Properties that paint a colour: in a style, their values take colours from roles only. */
const COLOUR_PROPERTY = /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline))?(?:-color)?|outline(?:-color)?|text-decoration(?:-color)?|caret-color|accent-color|fill|stroke|column-rule(?:-color)?)$/;
/** A colour written out: `#abc`, `rgb(1 2 3)`, `hsl(10 20% 30%)`, `oklch(…)`. `hsl(var(--role))` isn't one. */
const LITERAL_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\((?!\s*var\()/i;

function declarationProblems(path: string, decls: unknown): string[] {
  if (!decls || typeof decls !== "object" || Array.isArray(decls)) return [`${path}: expected declarations`];
  const errors: string[] = [];
  for (const [prop, value] of Object.entries(decls)) {
    if (!PROPERTY.test(prop)) errors.push(`${path}.${prop}: a CSS property in kebab-case`);
    else if (typeof value !== "string" || !value.trim() || UNSAFE_VALUE.test(value)) errors.push(`${path}.${prop}: a value without ; { } < > or \\`);
    else if (COLOUR_PROPERTY.test(prop) && LITERAL_COLOUR.test(value)) errors.push(`${path}.${prop}: a colour from a role (hsl(var(--primary))), so it follows the brand`);
  }
  return errors;
}

/**
 * Whether braces balance and no rule closes the style's scope early, with comments and strings
 * aside. One pass over the text, no backtracking, so it stays linear on any input.
 */
function balanced(css: string): boolean {
  let depth = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) return false; // an unclosed comment would swallow the scope's own brace
      i = end + 1;
    } else if (ch === '"' || ch === "'") {
      let k = i + 1;
      while (k < css.length && css[k] !== ch) k += css[k] === "\\" ? 2 : 1;
      if (k >= css.length) return false; // an unclosed string
      i = k;
    } else if (ch === "{") depth++;
    else if (ch === "}" && --depth < 0) return false;
  }
  return depth === 0;
}

function nameProblems(kind: string, t: { name?: unknown; label?: unknown; description?: unknown }): string[] {
  const errors: string[] = [];
  if (typeof t.name !== "string" || !NAME.test(t.name)) errors.push(`${kind}.name: lowercase letters, digits and hyphens, starting with a letter`);
  for (const key of ["label", "description"] as const) {
    if (typeof t[key] !== "string" || !(t[key] as string).trim()) errors.push(`${kind}.${key}: expected a non-empty string`);
  }
  return errors;
}

/** Every problem with an app brand input; empty when it is sound. */
export function validateAppBrand(input: AppBrandInput): string[] {
  const t = input as Partial<AppBrandInput> | undefined;
  if (!t || typeof t !== "object") return ["appBrand: expected object"];
  const errors = nameProblems("appBrand", t);
  const brand = validateBrand(t.brand);
  if (!brand.ok) errors.push(...brand.errors.map((e) => `appBrand.brand: ${e}`));
  for (const mode of ["light", "dark"] as const) {
    for (const [role, value] of Object.entries(t.roles?.[mode] ?? {})) {
      if (!THEME_ROLES.includes(role)) errors.push(`appBrand.roles.${mode}.${role}: not a theme role`);
      else if (typeof value !== "string" || !HEX.test(value)) errors.push(`appBrand.roles.${mode}.${role}: expected #rgb or #rrggbb`);
    }
  }
  for (const [key, stack] of Object.entries(t.fonts ?? {})) {
    if (!(THEME_FONTS as readonly string[]).includes(key)) errors.push(`appBrand.fonts.${key}: one of ${THEME_FONTS.join(", ")}`);
    else if (typeof stack !== "string" || !stack.trim() || !FONT_STACK.test(stack)) errors.push(`appBrand.fonts.${key}: a font stack (names, quotes and commas)`);
  }
  if (t.appName !== undefined && (typeof t.appName !== "string" || !t.appName.trim() || t.appName.length > 60))
    errors.push("appBrand.appName: a name of 1 to 60 characters");
  for (const key of ["logo", "mark"] as const) errors.push(...imageProblems(`appBrand.${key}`, t[key]));
  return errors;
}

/** `https:` or `http:`, a path from the site's root, or an inline raster or SVG image. */
const IMAGE_SRC = /^(?:https:\/\/[^\s"'<>]+|\/(?!\/)[^\s"'<>]*|data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,[A-Za-z0-9+/=]+)$/;

function imageProblems(path: string, image: unknown): string[] {
  if (image === undefined) return [];
  if (!image || typeof image !== "object" || Array.isArray(image)) return [`${path}: expected { src, alt }`];
  const { src, alt, darkSrc } = image as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof src !== "string" || !IMAGE_SRC.test(src)) errors.push(`${path}.src: an https: URL, a path from the site's root, or a data:image/… URL`);
  if (typeof alt !== "string") errors.push(`${path}.alt: the image's words for a screen reader (empty for a mark beside the name)`);
  if (darkSrc !== undefined && (typeof darkSrc !== "string" || !IMAGE_SRC.test(darkSrc)))
    errors.push(`${path}.darkSrc: an https: URL, a path from the site's root, or a data:image/… URL`);
  return errors;
}

/** Every problem with an app style input; empty when it is sound. */
export function validateAppStyle(input: AppStyleInput): string[] {
  const t = input as Partial<AppStyleInput> & Record<string, unknown>;
  if (!t || typeof t !== "object") return ["appStyle: expected object"];
  const errors = nameProblems("appStyle", t);
  if (typeof t.feel !== "string" || !t.feel.trim()) errors.push("appStyle.feel: expected a non-empty string");
  if (!Array.isArray(t.suits) || t.suits.length === 0 || !t.suits.every((s) => typeof s === "string" && s.trim()))
    errors.push("appStyle.suits: expected at least one non-empty string");
  if (t.pairsWith !== undefined && (typeof t.pairsWith !== "string" || !NAME.test(t.pairsWith))) errors.push("appStyle.pairsWith: an app brand's id");
  for (const key of ["brand", "roles", "fonts"]) {
    if (t[key] !== undefined) errors.push(`appStyle.${key}: colours and typefaces are an app brand's (defineAppBrand), not a style's`);
  }
  for (const key of ["shell", "layout"]) {
    if (t[key] !== undefined) errors.push(`appStyle.${key}: a layout is an app theme's (defineAppTheme in @marktiderman/genesis-ui/themes), not a style's`);
  }
  for (const key of ["tokens", "darkTokens"] as const) {
    for (const [name, value] of Object.entries(t[key] ?? {})) {
      const problem = componentTokenProblem(name, value);
      if (problem) errors.push(`appStyle.${key}: ${problem}`);
    }
  }
  for (const key of ["parts", "darkParts"] as const) {
    for (const [selector, decls] of Object.entries(t[key] ?? {})) {
      const parsed = parsePartSelector(selector);
      if ("problem" in parsed) errors.push(`appStyle.${key}["${selector}"]: ${parsed.problem}`);
      errors.push(...declarationProblems(`appStyle.${key}["${selector}"]`, decls));
    }
  }
  if (t.css !== undefined) {
    if (typeof t.css !== "string") errors.push("appStyle.css: expected a string");
    else if (/<\/|@import/i.test(t.css)) errors.push("appStyle.css: no @import and no </");
    else if (!balanced(t.css)) errors.push("appStyle.css: braces don't balance");
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
 * Define an app brand (colours and fonts): checks it and returns it frozen,
 * with its id. Throws with every problem when it isn't sound.
 *
 * @stability Beta
 */
export function defineAppBrand(input: AppBrandInput): AppBrand {
  const errors = validateAppBrand(input);
  if (errors.length) throw new Error(`App brand "${String(input?.name)}" isn't valid:\n- ${errors.join("\n- ")}`);
  return deepFreeze({ ...structuredClone(input), id: input.name });
}

/**
 * Define an app style (every component's size and shape): checks it and returns it frozen,
 * with its id. Throws with every problem when it isn't sound.
 *
 * @stability Beta
 */
export function defineAppStyle(input: AppStyleInput): AppStyle {
  const errors = validateAppStyle(input);
  if (errors.length) throw new Error(`App style "${String(input?.name)}" isn't valid:\n- ${errors.join("\n- ")}`);
  return deepFreeze({ ...structuredClone(input), id: input.name });
}

/** Every component token's name, for a picker or an editor. */
export const THEME_TOKEN_NAMES: readonly string[] = Object.freeze(COMPONENT_TOKENS.map((token) => token.name));
