/**
 * Component tokens: the sizes, shapes and type of genesis-ui's components,
 * as CSS variables a theme can set (`--control-height`, `--card-shadow`, …).
 *
 * Colours are theme roles (`--primary`, `--card`, …, in theme-css.ts). These
 * are everything else a component draws that a theme may want to change:
 * how tall a control is, how round a card is, whether a button's label is in
 * capitals, how heavy a page title is. genesis-ui reads each one in place of
 * a fixed class (`h-[var(--control-height)]` where it said `h-10`), and
 * `themes/genesis.css` declares every one at its default, which is what the
 * class said before, so an app that sets none looks exactly as it did.
 *
 * A token is declared once here: its name, what it holds, its default, and
 * the components that read it. genesis-ui's tests check that every token is
 * read somewhere and every `var(--…)` a component reads in their groups is
 * declared here.
 *
 * Mode-agnostic: a value that differs in dark mode (a shadow, usually) goes in
 * a theme's `dark` tokens.
 */

/** What a token holds, which decides the values it accepts. */
export type ComponentTokenKind = "length" | "shadow" | "weight" | "case" | "tracking";

export interface ComponentTokenInfo {
  /** The variable, without `--`. */
  name: string;
  kind: ComponentTokenKind;
  /** What `themes/genesis.css` declares: the value genesis-ui's class had before. */
  default: string;
  /** The components (genesis-ui part names) that read it. */
  parts: readonly string[];
  description: string;
}

const t = (name: string, kind: ComponentTokenKind, value: string, parts: string[], description: string): ComponentTokenInfo =>
  Object.freeze({ name, kind, default: value, parts: Object.freeze(parts), description });

/** Tailwind v4's `shadow-sm`, `shadow-md` and `shadow-lg`: genesis-ui's shadows before tokens. */
const SHADOW_SM = "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)";
const SHADOW_MD = "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)";
const SHADOW_LG = "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)";
/** No shadow, in a form Tailwind can compose with its ring shadows (`none` can't be). */
export const NO_SHADOW = "0 0 #0000";

/** Every component token, by group. */
export const COMPONENT_TOKENS: readonly ComponentTokenInfo[] = Object.freeze([
  // Controls: buttons, and the fields beside them.
  t("control-height", "length", "2.5rem", ["button", "input", "select-trigger"], "A button's and a field's height, default size."),
  t("control-height-sm", "length", "2.25rem", ["button"], "A small button's height."),
  t("control-height-lg", "length", "2.75rem", ["button"], "A large button's height."),
  t("control-padding-x", "length", "1rem", ["button"], "A button's side padding, default size."),
  t("control-padding-x-sm", "length", "0.75rem", ["button"], "A small button's side padding."),
  t("control-padding-x-lg", "length", "2rem", ["button"], "A large button's side padding."),
  t("control-radius", "length", "calc(var(--radius) * 0.8)", ["button", "input", "textarea", "select-trigger"], "A button's and a field's corners."),
  t("control-font-weight", "weight", "500", ["button"], "A button label's weight."),
  t("control-text-transform", "case", "none", ["button"], "A button label's case: `uppercase` for capitals."),
  t("control-letter-spacing", "tracking", "normal", ["button"], "A button label's letter spacing."),
  t("control-shadow", "shadow", NO_SHADOW, ["button"], "A filled or outlined button's shadow."),
  t("input-padding-x", "length", "0.75rem", ["input", "textarea", "select-trigger"], "A field's side padding."),
  t("input-border-width", "length", "1px", ["input", "textarea", "select-trigger"], "A field's border width."),
  t("input-shadow", "shadow", NO_SHADOW, ["input", "textarea", "select-trigger"], "A field's shadow (an inset one reads as sunk)."),
  t("focus-ring-width", "length", "2px", ["button", "input", "textarea", "select-trigger"], "The keyboard focus ring's width."),
  t("focus-ring-offset", "length", "2px", ["button", "input", "textarea", "select-trigger"], "The gap between a control and its focus ring."),

  // Surfaces: cards, and what floats over the page.
  t("card-radius", "length", "calc(var(--radius) * 1.4)", ["card"], "A card's corners."),
  t("card-border-width", "length", "1px", ["card"], "A card's border width (`0` for none)."),
  t("card-shadow", "shadow", SHADOW_SM, ["card"], "A card's shadow."),
  t("card-padding", "length", "1.5rem", ["card-header", "card-content", "card-footer"], "A card's inner padding."),
  t("popover-radius", "length", "calc(var(--radius) * 0.8)", ["popover", "dropdown-menu", "select-content", "hover-card", "context-menu"], "A popover's and a menu's corners."),
  t("popover-shadow", "shadow", SHADOW_MD, ["popover", "dropdown-menu", "select-content", "hover-card", "context-menu"], "A popover's and a menu's shadow."),
  t("overlay-shadow", "shadow", SHADOW_LG, ["dialog", "sheet"], "A dialog's and a sheet's shadow."),

  // Badges.
  t("badge-radius", "length", "9999px", ["badge"], "A badge's corners: a pill by default."),
  t("badge-font-weight", "weight", "500", ["badge"], "A badge label's weight."),
  t("badge-text-transform", "case", "none", ["badge"], "A badge label's case."),
  t("badge-letter-spacing", "tracking", "normal", ["badge"], "A badge label's letter spacing."),

  // Tables.
  t("table-head-height", "length", "2.5rem", ["table-head"], "A table header row's height."),
  t("table-cell-padding-x", "length", "0.5rem", ["table-head", "table-cell"], "A table cell's side padding."),
  t("table-cell-padding-y", "length", "0.5rem", ["table-cell"], "A table cell's top and bottom padding."),
  t("table-head-font-weight", "weight", "500", ["table-head"], "A column heading's weight."),
  t("table-head-text-transform", "case", "none", ["table-head"], "A column heading's case."),
  t("table-head-letter-spacing", "tracking", "normal", ["table-head"], "A column heading's letter spacing."),

  // Titles.
  t("title-font-weight", "weight", "600", ["card-title", "dialog-title", "sheet-title"], "A card's, dialog's and sheet's title weight."),
  t("title-letter-spacing", "tracking", "-0.025em", ["card-title", "dialog-title"], "A card's and dialog's title letter spacing."),
  t("title-text-transform", "case", "none", ["card-title", "dialog-title", "sheet-title"], "Their case."),
  t("page-title-font-weight", "weight", "700", ["dashboard-page-title", "detail-page-title", "form-page-title", "settings-page-title"], "A page title's weight."),
  t("page-title-letter-spacing", "tracking", "-0.025em", ["dashboard-page-title", "detail-page-title", "form-page-title", "settings-page-title"], "A page title's letter spacing."),
  t("page-title-text-transform", "case", "none", ["dashboard-page-title", "detail-page-title", "form-page-title", "settings-page-title"], "A page title's case."),

  // The app shell.
  t("sidebar-item-radius", "length", "var(--radius)", ["shell-nav-item"], "A sidebar item's corners."),
  t("sidebar-item-font-weight", "weight", "500", ["shell-nav-item"], "A sidebar item's weight."),
]);

/** Every token's name. */
export type ComponentTokenName = string;

/** A token by name, or undefined. */
export function getComponentToken(name: string): ComponentTokenInfo | undefined {
  return COMPONENT_TOKENS.find((token) => token.name === name);
}

/** Characters a value may never hold: nothing that ends a declaration or a rule, opens markup or fetches. */
const UNSAFE = /[;{}<>\\]|url\(|@import|expression\(|javascript:/i;
const LENGTH = /^(?:0|-?\d*\.?\d+(?:rem|em|px|%|vw|vh)|(?:calc|min|max|clamp)\([\w\s.*+\-/%(),]+\)|var\(--[a-z0-9-]+\))$/;
const SHADOW = /^(?:none|[\w\s.,()/%#+-]+)$/;
const WEIGHT = /^[1-9]00$/;
const CASE = /^(?:none|uppercase|lowercase|capitalize)$/;
const TRACKING = /^(?:normal|-?\d*\.?\d+em|0)$/;

const KIND: Record<ComponentTokenKind, { pattern: RegExp; hint: string }> = {
  length: { pattern: LENGTH, hint: "a length: 0, rem, em, px, %, vw, vh, a calc()/min()/max()/clamp() of them, or var(--name)" },
  shadow: { pattern: SHADOW, hint: "a box-shadow (offsets and colours) or none" },
  weight: { pattern: WEIGHT, hint: "a font weight, 100 to 900 in hundreds" },
  case: { pattern: CASE, hint: "none, uppercase, lowercase or capitalize" },
  tracking: { pattern: TRACKING, hint: "normal or a length in em" },
};

/** The problem with a token value, or null when it is sound. */
export function componentTokenProblem(name: string, value: unknown): string | null {
  const token = getComponentToken(name);
  if (!token) return `--${name}: not a component token`;
  if (typeof value !== "string" || !value.trim()) return `--${name}: expected a value`;
  if (UNSAFE.test(value) || !KIND[token.kind].pattern.test(value.trim())) return `--${name}: ${KIND[token.kind].hint}`;
  return null;
}

/** A token value as the stylesheet declares it: `none` for a shadow becomes {@link NO_SHADOW}. */
export function componentTokenCss(name: string, value: string): string {
  const v = value.trim();
  return getComponentToken(name)?.kind === "shadow" && v === "none" ? NO_SHADOW : v;
}

/** Every token at its default, as `--name: value;` lines: the component block of `themes/genesis.css`. */
export function renderComponentTokenDefaults(indent = "  "): string {
  return COMPONENT_TOKENS.map((token) => `${indent}--${token.name}: ${token.default};`).join("\n");
}
