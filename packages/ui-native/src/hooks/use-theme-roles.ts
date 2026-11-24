/**
 * useThemeRoles — the theme roles (background, label, separator, tint…) as
 * colors for this platform and color scheme, plus the app's `primary` and the
 * text on it (`onPrimary`).
 *
 * On iOS every neutral role is a system color through `PlatformColor`, so a
 * screen follows light and dark mode, increased contrast and accessibility
 * settings like the system apps. On Android the roles are the Genesis tokens
 * for the current scheme, or Material You colors on Android 12+ with
 * `materialYou`. A brand sets `tint`.
 *
 * `primary` and `onPrimary` are what the app's own `bg-primary` and
 * `text-primary-foreground` draw on the phone: under a `GenesisThemeProvider`,
 * `brandRoleVariables(brand, { platform: "native" })` for the resolved mode
 * (native overrides, the brand's dark colors, the contrast-checked
 * foreground) as `hsl()`; else the tint, with black or white by contrast on a
 * hex tint, else the theme's `primaryForeground`.
 *
 * Use it for `style` props and anything Tailwind classes don't reach, such as
 * navigation header and tab bar options.
 *
 * @stability Beta
 */
import { useMemo } from "react";
import { Platform, PlatformColor, processColor, type ColorValue } from "react-native";
import { brandRoleVariables, resolveThemeRoles, useOptionalTheme, type CanonicalBrand, type ThemeRole } from "@marktiderman/genesis-design-system";
import { nativeThemeDark, nativeThemeLight } from "@marktiderman/genesis-design-system/tokens";
import { readableOn } from "../tokens/contrast";
import { useThemeMode } from "./use-theme-mode";

/** The roles as released in 3.16.0. */
export type ThemeRoleColors = Record<ThemeRole, ColorValue>;

/** What `useThemeRoles` returns: the roles, plus the app's primary and the text on it. */
export type ThemeRoleColorsWithPrimary = ThemeRoleColors & {
  /** The app's primary: the brand's native primary under a GenesisThemeProvider, else the tint. */
  primary: ColorValue;
  /** The text and icons on `primary`. */
  onPrimary: ColorValue;
};

export interface UseThemeRolesOptions {
  /** The brand's primary color. Wins over a GenesisThemeProvider's brand for `tint` and `primary`. */
  tint?: string;
  /** On Android 12+, use Material You dynamic colors for the neutral roles (and the tint, unless `tint` is set). Ignored elsewhere. */
  materialYou?: boolean;
}

/** `243.4 75.4% 58.6%` → `hsl(243.4, 75.4%, 58.6%)`, which React Native parses; anything else → undefined. */
export function tripletToHsl(triplet: string | undefined): string | undefined {
  const m = /^\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(triplet ?? "");
  return m ? `hsl(${m[1]}, ${m[2]}%, ${m[3]}%)` : undefined;
}

/** The brand's native `--primary` and `--primary-foreground` in `mode`, as `hsl()`, or undefined when either isn't a triplet. */
function brandPrimary(brand: CanonicalBrand, mode: "light" | "dark"): { primary: string; onPrimary: string } | undefined {
  const vars = brandRoleVariables(brand, { platform: "native" })[mode];
  const primary = tripletToHsl(vars["--primary"]);
  const onPrimary = tripletToHsl(vars["--primary-foreground"]);
  return primary && onPrimary ? { primary, onPrimary } : undefined;
}

/**
 * A colour string React Native resolves (a name such as "white" or "rebeccapurple", or any form
 * `readableOn` doesn't parse) as `#rrggbb`, so the contrast check works on every form a tint can
 * take. A PlatformColor or other opaque value stays unknown.
 */
function resolvedHex(color: ColorValue): string | undefined {
  if (typeof color !== "string") return undefined;
  const argb = processColor(color);
  if (typeof argb !== "number") return undefined;
  // Fully transparent ("transparent") has no colour to read on: leave it to the token.
  if (((argb >>> 24) & 0xff) === 0) return undefined;
  return `#${((argb >>> 0) & 0xffffff).toString(16).padStart(6, "0")}`;
}

export function useThemeRoles(options: UseThemeRolesOptions = {}): ThemeRoleColorsWithPrimary {
  const scheme = useThemeMode();
  const { tint, materialYou = false } = options;
  const androidDynamic = materialYou && Platform.OS === "android" && Number(Platform.Version) >= 31;
  const theme = useOptionalTheme();
  const themeBrand = theme?.brand;
  const themeMode = theme?.resolvedMode;
  return useMemo(() => {
    const roles = resolveThemeRoles<ColorValue>({
      target: Platform.OS === "ios" ? "ios" : "android",
      scheme,
      platformColor: (name) => PlatformColor(name),
      tint,
      androidDynamic,
    }) as Record<ThemeRole, ColorValue>;
    const brand = !tint && themeBrand && themeMode ? brandPrimary(themeBrand, themeMode) : undefined;
    const tokens = scheme === "dark" ? nativeThemeDark : nativeThemeLight;
    return {
      ...roles,
      primary: brand?.primary ?? roles.tint,
      // A brand's own onPrimary first; else whichever of white and black reads on the tint, for
      // every colour form (a name too); the token only for an opaque PlatformColor tint.
      onPrimary: brand?.onPrimary ?? readableOn(roles.tint) ?? readableOn(resolvedHex(roles.tint)) ?? tokens.primaryForeground,
    };
  }, [scheme, tint, androidDynamic, themeBrand, themeMode]);
}

/** The colour of a message you sent, on every thread on the phone. Its text is `text-primary-foreground`. */
export const sentBubbleColor = <C,>(roles: { tint: C }): C => roles.tint;
