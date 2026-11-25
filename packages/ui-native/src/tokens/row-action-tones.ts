/**
 * The colors behind a row's swipe actions on the phone (ADR 0028). An action's semantic `tone`
 * (core's `RowActionTone`) or its `accent` (a system color by name) becomes a swatch: `tint` (the
 * app's primary), `danger` (the destructive role, systemRed on iOS), or one of iOS's system colors
 * (what Mail and Messages use), with the same hues for Android and tests.
 *
 * @stability Beta
 */
import { useCallback } from "react";
import { Platform, PlatformColor, type ColorValue } from "react-native";
import { nativeThemeDark, nativeThemeLight } from "@marktiderman/genesis-design-system/tokens";
import { rowActionTone, type RowActionAccent, type RowActionTone, type RowSwipeAction } from "@marktiderman/genesis-core/row-actions";
import { useThemeMode } from "../hooks/use-theme-mode";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { readableOn } from "./contrast";

export { readableOn } from "./contrast";

/** A system color a swatch draws: every accent but `red`, which is the destructive role. */
export type RowActionSystemColor = Exclude<RowActionAccent, "red">;

/** What an action is drawn in: the app's primary, the destructive role, or a system color. */
export type RowActionSwatch = "tint" | "danger" | RowActionSystemColor;

/**
 * Each system color's iOS name, and its fallback where there is no `PlatformColor`. iOS keeps
 * its system colors with white on them, as Mail and Messages draw them: that is iOS's own look, and
 * not every pair reaches WCAG AA (white on systemGreen or systemOrange is about 2.2:1). The
 * fallbacks are darker shades that carry white at 4.5:1 or more.
 */
export const ROW_ACTION_SYSTEM_COLORS: Record<RowActionSystemColor, { ios: string; fallback: string }> = {
  blue: { ios: "systemBlue", fallback: "#0062CC" },
  green: { ios: "systemGreen", fallback: "#1E7B34" },
  orange: { ios: "systemOrange", fallback: "#B45400" },
  purple: { ios: "systemPurple", fallback: "#8A3FB8" },
  // Messages' Hide Alerts.
  indigo: { ios: "systemIndigo", fallback: "#4B49C7" },
  // Yellow carries black text (onRowActionColor): 13.9:1.
  yellow: { ios: "systemYellow", fallback: "#FFCC00" },
  gray: { ios: "systemGray", fallback: "#636366" },
};

/** The system color each semantic tone draws, on iOS as in Mail: success green, warning orange, info blue, neutral gray. */
export const TONE_SWATCHES: Record<RowActionTone, RowActionSwatch> = {
  tint: "tint",
  danger: "danger",
  success: "green",
  warning: "orange",
  info: "blue",
  neutral: "gray",
};

/** An action's swatch: its `accent` (`red` is `danger`), else its tone's (`danger` when destructive, else `tint`). */
export function rowActionSwatch(action: Pick<RowSwipeAction, "tone" | "accent" | "destructive">): RowActionSwatch {
  if (action.accent) return action.accent === "red" ? "danger" : action.accent;
  return TONE_SWATCHES[rowActionTone(action)];
}

/** Text and icons on a system color: white, as iOS draws them, except on yellow, where only black reads. */
export const ON_ROW_ACTION = "#FFFFFF";
export const ON_ROW_ACTION_LIGHT_TONE = "#000000";

/**
 * The text and icon color on an action of this swatch.
 *
 * - **System colors** (blue, green, orange, purple, indigo, gray): white, as iOS draws them; black on yellow.
 * - **`tint` and `danger`** sit on the app's own colors (`background`), so they take what reads on
 *   that color: white or black by contrast when it's a hex color, else `foreground` (the theme's
 *   `onPrimary` or `destructiveForeground`, which the caller passes), else white (iOS's systemRed,
 *   as Mail draws Delete). `useRowActionColors` passes them.
 */
export function onRowActionColor(swatch: RowActionSwatch, background?: unknown, foreground?: string): string {
  if (swatch === "yellow") return ON_ROW_ACTION_LIGHT_TONE;
  if (swatch !== "tint" && swatch !== "danger") return ON_ROW_ACTION;
  return readableOn(background) ?? foreground ?? ON_ROW_ACTION;
}

/** An action's colors behind the swipe: its background and the text and icons on it. */
export interface RowActionColors {
  background: ColorValue;
  foreground: ColorValue;
}

/**
 * The colors of a row's actions on the phone, for the current theme: `tint` is the app's primary
 * and `onPrimary` (useThemeRoles: the brand's native primary under a GenesisThemeProvider),
 * `danger` the destructive role and its foreground, a system color its iOS color (with the Android
 * fallbacks) and white, or black on yellow.
 */
export function useRowActionColors(): (action: Pick<RowSwipeAction, "tone" | "accent" | "destructive">) => RowActionColors {
  const roles = useThemeRoles();
  const tokens = useThemeMode() === "dark" ? nativeThemeDark : nativeThemeLight;
  return useCallback(
    (action) => {
      const swatch = rowActionSwatch(action);
      if (swatch === "tint") return { background: roles.primary, foreground: roles.onPrimary };
      if (swatch === "danger") return { background: roles.destructive, foreground: onRowActionColor("danger", roles.destructive, tokens.destructiveForeground) };
      const c = ROW_ACTION_SYSTEM_COLORS[swatch];
      return { background: Platform.OS === "ios" ? PlatformColor(c.ios) : c.fallback, foreground: onRowActionColor(swatch) };
    },
    [roles, tokens],
  );
}

/** The pill a row becomes while its round actions are open (iOS 26 Messages): systemGray5. */
export const ROW_PILL = { ios: "systemGray5", fallback: "#E5E5EA" } as const;
