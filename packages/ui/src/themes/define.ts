/**
 * App themes: the bundle (ADR 0018). A theme picks one of each look piece and
 * leaves any it doesn't pick to the app:
 *
 *   - `brand`: colours and typefaces (an `AppBrand`, design-system).
 *   - `style`: every component's size, shape and parts (an `AppStyle`,
 *     design-system).
 *   - `layout`: the app shell's layout (navigation, frame, density, rail,
 *     sub-navigation): the `AppShell` options it starts from (ADR 0022).
 *
 * Brand and style are presentation only, so they live in design-system. A
 * layout is the components', so the theme that bundles them lives here, a
 * layer above. Later pieces (default view types, record pages, widgets) join
 * the bundle as they ship.
 *
 * A theme is a default, never a lock: density and the rail are the person's
 * to change wherever `AppShell` is `configurable`, and their choice wins
 * (`lockedOptions` keeps one fixed). Light and dark is the person's
 * appearance, which no theme sets.
 */
import type { AppBrand, AppStyle } from "@marktiderman/genesis-design-system/app-styles";

/** The app shell's layout a theme starts from (the same names and values as `AppShellOptions`). */
export interface AppThemeLayout {
  /**
   * How the navigation is laid out: `sidebar`, `rail`, `top-tabs`,
   * `bottom-bar` or `page-tree` (`AppShellOptions.navigation`).
   */
  navigation?: "sidebar" | "rail" | "top-tabs" | "bottom-bar" | "page-tree";
  /** The page area's frame: `flush` or `inset` (`AppShellOptions.frame`). */
  frame?: "flush" | "inset";
  /** Row padding in the sidebar and lists: the default; the person's own choice wins. */
  density?: "compact" | "comfortable" | "spacious";
  /** The expanded sidebar's width. */
  railWidth?: "narrow" | "wide";
  /** Open the sidebar collapsed to an icon rail. */
  defaultCollapsed?: boolean;
  /** The collapsed rail's width in px. */
  collapsedRailWidth?: 56 | 64;
  /** How a page's own sub-navigation shows. */
  subNav?: "section" | "tabs" | "sidebar" | "off";
}

export interface AppThemeInput {
  /** Lowercase letters, digits and hyphens. */
  name: string;
  /** Its name in a picker. */
  label: string;
  description: string;
  /** The kind of product whose feel it follows, in words ("keyboard-first issue trackers"). */
  feel?: string;
  /** The work it suits, for a picker or a zone map ("issues", "tasks", "journal"). */
  suits?: readonly string[];
  /** Colours and typefaces. Unset keeps the app's own brand. */
  brand?: AppBrand;
  /** Every component's size and shape. Unset keeps Genesis's default style. */
  style?: AppStyle;
  /** The shell's layout. Unset keeps the app's own `AppShell` options. */
  layout?: AppThemeLayout;
}

/** A defined app theme: its input, frozen, with its id (its name). */
export type AppTheme = Readonly<AppThemeInput> & { readonly id: string };

const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const LAYOUT_VALUES: Record<keyof AppThemeLayout, readonly unknown[]> = {
  navigation: ["sidebar", "rail", "top-tabs", "bottom-bar", "page-tree"],
  frame: ["flush", "inset"],
  density: ["compact", "comfortable", "spacious"],
  railWidth: ["narrow", "wide"],
  defaultCollapsed: [true, false],
  collapsedRailWidth: [56, 64],
  subNav: ["section", "tabs", "sidebar", "off"],
};
const KEYS = new Set(["name", "label", "description", "feel", "suits", "brand", "style", "layout"]);

/** Every problem with an app theme input; empty when it is sound. */
export function validateAppTheme(input: AppThemeInput): string[] {
  const t = input as Partial<AppThemeInput> & Record<string, unknown>;
  if (!t || typeof t !== "object") return ["appTheme: expected object"];
  const errors: string[] = [];
  if (typeof t.name !== "string" || !NAME.test(t.name)) errors.push("appTheme.name: lowercase letters, digits and hyphens, starting with a letter");
  for (const key of ["label", "description"] as const) {
    if (typeof t[key] !== "string" || !(t[key] as string).trim()) errors.push(`appTheme.${key}: expected a non-empty string`);
  }
  if (t.feel !== undefined && (typeof t.feel !== "string" || !t.feel.trim())) errors.push("appTheme.feel: expected a non-empty string");
  if (t.suits !== undefined && (!Array.isArray(t.suits) || !t.suits.every((s) => typeof s === "string" && s.trim())))
    errors.push("appTheme.suits: expected non-empty strings");
  for (const key of Object.keys(t)) {
    if (KEYS.has(key)) continue;
    if (["tokens", "darkTokens", "parts", "darkParts", "css"].includes(key)) errors.push(`appTheme.${key}: belongs to an app style (defineAppStyle); give the theme a style`);
    else if (["roles", "fonts"].includes(key)) errors.push(`appTheme.${key}: belongs to an app brand (defineAppBrand); give the theme a brand`);
    else errors.push(`appTheme.${key}: not a theme piece (brand, style, layout)`);
  }
  for (const [key, kind] of [["brand", "an app brand (defineAppBrand)"], ["style", "an app style (defineAppStyle)"]] as const) {
    const v = t[key] as { id?: unknown } | undefined;
    if (v !== undefined && (!v || typeof v !== "object" || typeof v.id !== "string")) errors.push(`appTheme.${key}: expected ${kind}`);
  }
  for (const [key, value] of Object.entries(t.layout ?? {})) {
    const allowed = LAYOUT_VALUES[key as keyof AppThemeLayout];
    if (!allowed) errors.push(`appTheme.layout.${key}: one of ${Object.keys(LAYOUT_VALUES).join(", ")}`);
    else if (!allowed.includes(value)) errors.push(`appTheme.layout.${key}: one of ${allowed.join(", ")}`);
  }
  return errors;
}

/**
 * Define an app theme (a brand, a style and a layout, each optional): checks
 * it and returns it frozen, with its id. Throws with every problem when it
 * isn't sound.
 *
 * @stability Beta
 */
export function defineAppTheme(input: AppThemeInput): AppTheme {
  const errors = validateAppTheme(input);
  if (errors.length) throw new Error(`App theme "${String(input?.name)}" isn't valid:\n- ${errors.join("\n- ")}`);
  const layout = input.layout ? Object.freeze({ ...input.layout }) : undefined;
  const suits = input.suits ? Object.freeze([...input.suits]) : undefined;
  return Object.freeze({ ...input, ...(layout ? { layout } : {}), ...(suits ? { suits } : {}), id: input.name });
}

/**
 * The attributes that put a theme's brand and style on an element: spread on
 * `<html>` (or set them there in an effect) so portalled menus and dialogs
 * wear it too. A piece the theme leaves unset gets no attribute, so the app's
 * own stands.
 *
 * @stability Beta
 */
export function appThemeAttributes(theme: AppTheme | null | undefined): { "data-app-brand"?: string; "data-app-style"?: string } {
  return {
    ...(theme?.brand ? { "data-app-brand": theme.brand.id } : {}),
    ...(theme?.style ? { "data-app-style": theme.style.id } : {}),
  };
}
