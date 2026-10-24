/**
 * Theme roles: what a color is FOR (the page background, a secondary label, a
 * separator), not what it is. Each platform resolves a role its own way:
 *
 * - web: the theme's CSS variable, `hsl(var(--muted-foreground))`;
 * - iOS: the matching system color through `PlatformColor`, so screens follow
 *   light and dark mode, increased contrast and the user's accessibility
 *   settings the way the system apps do;
 * - Android (and iOS without `PlatformColor`): the Genesis token for the
 *   current color scheme.
 *
 * A brand changes the `tint` (its primary color); the neutral roles stay the
 * platform's. This file has no React Native import, so web, native and Node
 * all read it; React Native passes its own `PlatformColor` in.
 */
import { nativeThemeDark, nativeThemeLight } from "./native-themes";

/** @stability Beta */
export const THEME_ROLES = [
  "background",
  "groupedBackground",
  "surface",
  "label",
  "secondaryLabel",
  "tertiaryLabel",
  "separator",
  "fill",
  "tint",
  "destructive",
  "success",
  "warning",
] as const;

/** @stability Beta */
export type ThemeRole = (typeof THEME_ROLES)[number];

type NativeToken = keyof typeof nativeThemeLight;

/** Where each role comes from: a Genesis theme token and, on iOS, a system color. */
const ROLE_SOURCES: Record<Exclude<ThemeRole, "tint">, { token: NativeToken; ios: string }> = {
  background: { token: "background", ios: "systemBackground" },
  groupedBackground: { token: "muted", ios: "systemGroupedBackground" },
  surface: { token: "card", ios: "secondarySystemGroupedBackground" },
  label: { token: "foreground", ios: "label" },
  secondaryLabel: { token: "mutedForeground", ios: "secondaryLabel" },
  tertiaryLabel: { token: "mutedForeground", ios: "tertiaryLabel" },
  separator: { token: "border", ios: "separator" },
  fill: { token: "secondary", ios: "tertiarySystemFill" },
  destructive: { token: "destructive", ios: "systemRed" },
  success: { token: "success", ios: "systemGreen" },
  warning: { token: "warning", ios: "systemOrange" },
};

/** The Genesis brand primary, the default `tint` on native. */
const DEFAULT_TINT = "#10b981";

const kebab = (token: string) => token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** @stability Beta */
export interface ResolveThemeRolesOptions<C> {
  /** Where the colors are used. */
  target: "web" | "ios" | "android";
  /** Light or dark. Ignored on web (the CSS variables switch) and for iOS system colors (they switch themselves). */
  scheme?: "light" | "dark";
  /** React Native's `PlatformColor`. On iOS, roles become system colors; without it, Genesis token values. */
  platformColor?: (name: string) => C;
  /** The brand's primary color on native. Web uses `--primary`. */
  tint?: string;
}

/**
 * Every role's color for one platform and scheme.
 *
 * ```ts
 * import { PlatformColor, Platform } from "react-native";
 * const colors = resolveThemeRoles({ target: Platform.OS === "ios" ? "ios" : "android", scheme, platformColor: PlatformColor });
 * ```
 *
 * @stability Beta
 */
export function resolveThemeRoles<C = string>(options: ResolveThemeRolesOptions<C>): Record<ThemeRole, string | C> {
  const { target, scheme = "light", platformColor, tint } = options;
  const values = scheme === "dark" ? nativeThemeDark : nativeThemeLight;
  const out = {} as Record<ThemeRole, string | C>;
  for (const [role, source] of Object.entries(ROLE_SOURCES) as [Exclude<ThemeRole, "tint">, (typeof ROLE_SOURCES)[keyof typeof ROLE_SOURCES]][]) {
    if (target === "web") out[role] = `hsl(var(--${kebab(source.token)}))`;
    else if (target === "ios" && platformColor) out[role] = platformColor(source.ios);
    else out[role] = values[source.token];
  }
  out.tint = target === "web" ? "hsl(var(--primary))" : (tint ?? DEFAULT_TINT);
  return out;
}
