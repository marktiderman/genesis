/**
 * Starter themes: whole-app looks built on a brand.
 *
 * A brand (`CanonicalBrand`) already turns into every theme role variable
 * Genesis components read (`brandRoleVariables`): the page, text, primary,
 * muted, border and status colours, light and dark, solved for contrast. A
 * starter theme is a brand plus the few things that give a product its
 * character and that a brand leaves at the Genesis default:
 *
 *   - `roles`: any theme role set by hand, per mode, over what the brand
 *     works out. Mostly the sidebar (a dark rail in a light app, a warm
 *     tint) and a card that differs from the page.
 *   - `fonts`: the sans, display and mono stacks (`--font-*`).
 *   - `shell`: the density `AppShell` is given.
 *
 * Starter themes are content, at the customization layer's Brand level
 * (ADR 0013): no component renders differently because of one, so swapping
 * themes is a change of CSS variables only. An app copies one into its own
 * brand, or uses it as is through `dist/themes/starter.css` and a
 * `data-theme` attribute.
 *
 * ```ts
 * export const ledger = defineStarterTheme({
 *   name: "ledger",
 *   label: "Ledger",
 *   description: "Quiet and exact, for finance screens.",
 *   feel: "accounting tools",
 *   suits: ["invoices", "reports"],
 *   brand: { ...genesisBrand, name: "ledger", accent: { DEFAULT: "#0f766e" } },
 *   roles: { light: { "sidebar-background": "#f4f6f5" } },
 *   shell: { density: "compact" },
 * });
 * ```
 */
import { validateBrand, type CanonicalBrand } from "../schema/brand";
import { THEME_SECTIONS } from "../tokens/theme-css";

/** Every colour role a theme can set by hand: the names `themes/genesis.css` declares, without `--`. */
export const THEME_ROLES: readonly string[] = Object.freeze(
  THEME_SECTIONS.flatMap((section) => section.vars.filter((v) => v.kind === "color").map((v) => v.name)),
);

/** The font stacks a theme can set: `--font-sans`, `--font-display`, `--font-mono`. */
export const THEME_FONTS = ["sans", "display", "mono"] as const;
export type ThemeFont = (typeof THEME_FONTS)[number];

/** `AppShell`'s densities. */
export const SHELL_DENSITIES = ["comfortable", "compact"] as const;
export type ShellDensity = (typeof SHELL_DENSITIES)[number];

/** Theme roles set by hand, as `#rgb` or `#rrggbb`: `{ "sidebar-background": "#1d2327" }`. */
export type ThemeRoleColors = Readonly<Partial<Record<string, string>>>;

export interface StarterThemeInput {
  /** Lowercase letters, digits and hyphens: what `data-theme` names. */
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
  /** How the app shell is set. */
  shell?: { density?: ShellDensity };
}

/** A defined starter theme: its input, frozen, with its id (its name). */
export type StarterTheme = Readonly<StarterThemeInput> & { readonly id: string };

const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** A font stack is written into CSS: names, quotes, commas, digits and spaces only. */
const FONT_STACK = /^[A-Za-z0-9 ,"'_-]+$/;

/** Every problem with a starter theme input; empty when it is sound. */
export function validateStarterTheme(input: StarterThemeInput): string[] {
  const errors: string[] = [];
  const t = input as Partial<StarterThemeInput> | undefined;
  if (!t || typeof t !== "object") return ["starterTheme: expected object"];
  if (typeof t.name !== "string" || !NAME.test(t.name)) errors.push("starterTheme.name: lowercase letters, digits and hyphens, starting with a letter");
  for (const key of ["label", "description", "feel"] as const) {
    if (typeof t[key] !== "string" || !t[key]!.trim()) errors.push(`starterTheme.${key}: expected a non-empty string`);
  }
  if (!Array.isArray(t.suits) || t.suits.length === 0 || !t.suits.every((s) => typeof s === "string" && s.trim()))
    errors.push("starterTheme.suits: expected at least one non-empty string");
  const brand = validateBrand(t.brand);
  if (!brand.ok) errors.push(...brand.errors.map((e) => `starterTheme.brand: ${e}`));
  for (const mode of ["light", "dark"] as const) {
    const roles = t.roles?.[mode];
    if (roles === undefined) continue;
    for (const [role, value] of Object.entries(roles)) {
      if (!THEME_ROLES.includes(role)) errors.push(`starterTheme.roles.${mode}.${role}: not a theme role`);
      else if (typeof value !== "string" || !HEX.test(value)) errors.push(`starterTheme.roles.${mode}.${role}: expected #rgb or #rrggbb`);
    }
  }
  for (const [key, stack] of Object.entries(t.fonts ?? {})) {
    if (!(THEME_FONTS as readonly string[]).includes(key)) errors.push(`starterTheme.fonts.${key}: one of ${THEME_FONTS.join(", ")}`);
    else if (typeof stack !== "string" || !stack.trim() || !FONT_STACK.test(stack)) errors.push(`starterTheme.fonts.${key}: a font stack (names, quotes and commas)`);
  }
  const density = t.shell?.density;
  if (density !== undefined && !(SHELL_DENSITIES as readonly string[]).includes(density))
    errors.push(`starterTheme.shell.density: one of ${SHELL_DENSITIES.join(", ")}`);
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
 * Define a starter theme: checks it and returns it frozen, with its id.
 * Throws with every problem when it isn't sound.
 *
 * @stability Beta
 */
export function defineStarterTheme(input: StarterThemeInput): StarterTheme {
  const errors = validateStarterTheme(input);
  if (errors.length) throw new Error(`Starter theme "${String(input?.name)}" isn't valid:\n- ${errors.join("\n- ")}`);
  return deepFreeze({ ...structuredClone(input), id: input.name });
}
