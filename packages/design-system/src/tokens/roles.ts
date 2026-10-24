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
import { nativeColors } from "./native";
import { genesisColors } from "../presets/brand-genesis";

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

/** A text-safe red for the destructive role in both schemes (about 5:1 on the dark background). */
const DESTRUCTIVE_TEXT = nativeColors.semantic.error.DEFAULT;

interface RoleSource {
  /** The web theme token (its CSS variable switches with the scheme by itself). */
  token: NativeToken;
  /** The iOS system color. */
  ios: string;
  /** On native without system colors: a token (or color) per scheme, when it differs from `token`. */
  light?: NativeToken | `#${string}`;
  dark?: NativeToken | `#${string}`;
  /** Android 12+ Material You system colors, per scheme, used with `androidDynamic`. */
  material?: { light: string; dark: string };
}

/**
 * Where each role comes from. Native grouped screens follow iOS: in light
 * mode the page is gray and cells are white; in dark mode the page is the
 * darkest and cells are raised above it.
 */
const ROLE_SOURCES: Record<Exclude<ThemeRole, "tint">, RoleSource> = {
  background: { token: "background", ios: "systemBackground", material: m("neutral1_10", "neutral1_900") },
  groupedBackground: { token: "muted", ios: "systemGroupedBackground", light: "muted", dark: "background", material: m("neutral1_50", "neutral1_900") },
  surface: { token: "card", ios: "secondarySystemGroupedBackground", light: "card", dark: "muted", material: m("neutral1_10", "neutral1_800") },
  label: { token: "foreground", ios: "label", material: m("neutral1_900", "neutral1_50") },
  secondaryLabel: { token: "mutedForeground", ios: "secondaryLabel", material: m("neutral2_700", "neutral2_200") },
  // Genesis has one muted text token, so tertiary matches secondary off iOS (and on web).
  tertiaryLabel: { token: "mutedForeground", ios: "tertiaryLabel", material: m("neutral2_500", "neutral2_400") },
  separator: { token: "border", ios: "separator", material: m("neutral2_200", "neutral2_700") },
  fill: { token: "secondary", ios: "tertiarySystemFill", material: m("neutral2_100", "neutral2_800") },
  destructive: { token: "destructive", ios: "systemRed", light: DESTRUCTIVE_TEXT as `#${string}`, dark: DESTRUCTIVE_TEXT as `#${string}` },
  success: { token: "success", ios: "systemGreen" },
  warning: { token: "warning", ios: "systemOrange" },
};

function m(light: string, dark: string) {
  return { light: `@android:color/system_${light}`, dark: `@android:color/system_${dark}` };
}

/** The Genesis brand primary, the default `tint` on native. A brand passes its own. */
const DEFAULT_TINT = { light: genesisColors.primary as string, dark: genesisColors.primaryDark as string };
const DYNAMIC_TINT = m("accent1_600", "accent1_200");

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
  /**
   * Android 12+ only: resolve neutral roles (and the tint, unless `tint` is
   * given) to Material You dynamic colors through `platformColor`. Leave it
   * off below Android 12, where those system colors don't exist.
   */
  androidDynamic?: boolean;
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
  const { target, scheme = "light", platformColor, tint, androidDynamic = false } = options;
  const values: Record<string, string> = scheme === "dark" ? nativeThemeDark : nativeThemeLight;
  const pick = (v: NativeToken | `#${string}`) => (v.startsWith("#") ? v : values[v]!);
  const dynamic = target === "android" && androidDynamic && platformColor;
  const out = {} as Record<ThemeRole, string | C>;
  for (const [role, source] of Object.entries(ROLE_SOURCES) as [Exclude<ThemeRole, "tint">, RoleSource][]) {
    if (target === "web") out[role] = `hsl(var(--${kebab(source.token)}))`;
    else if (target === "ios" && platformColor) out[role] = platformColor(source.ios);
    else if (dynamic && source.material) out[role] = platformColor(source.material[scheme]);
    else out[role] = pick((scheme === "dark" ? source.dark : source.light) ?? source.token);
  }
  if (target === "web") out.tint = "hsl(var(--primary))";
  else if (tint) out.tint = tint;
  else if (dynamic) out.tint = platformColor(DYNAMIC_TINT[scheme]);
  else out.tint = DEFAULT_TINT[scheme];
  return out;
}
