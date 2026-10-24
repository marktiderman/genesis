/**
 * useThemeRoles — the theme roles (background, label, separator, tint…) as
 * colors for this platform and color scheme.
 *
 * On iOS every neutral role is a system color through `PlatformColor`, so a
 * screen follows light and dark mode, increased contrast and accessibility
 * settings like the system apps. On Android the roles are the Genesis tokens
 * for the current scheme, or Material You colors on Android 12+ with
 * `materialYou`. A brand sets `tint`.
 *
 * Use it for `style` props and anything Tailwind classes don't reach, such as
 * navigation header and tab bar options.
 *
 * @stability Beta
 */
import { useMemo } from "react";
import { Platform, PlatformColor, type ColorValue } from "react-native";
import { resolveThemeRoles, type ThemeRole } from "@marktiderman/genesis-design-system";
import { useThemeMode } from "./use-theme-mode";

export type ThemeRoleColors = Record<ThemeRole, ColorValue>;

export interface UseThemeRolesOptions {
  /** The brand's primary color. */
  tint?: string;
  /** On Android 12+, use Material You dynamic colors for the neutral roles (and the tint, unless `tint` is set). Ignored elsewhere. */
  materialYou?: boolean;
}

export function useThemeRoles(options: UseThemeRolesOptions = {}): ThemeRoleColors {
  const scheme = useThemeMode();
  const { tint, materialYou = false } = options;
  const androidDynamic = materialYou && Platform.OS === "android" && Number(Platform.Version) >= 31;
  return useMemo(
    () =>
      resolveThemeRoles<ColorValue>({
        target: Platform.OS === "ios" ? "ios" : "android",
        scheme,
        platformColor: (name) => PlatformColor(name),
        tint,
        androidDynamic,
      }),
    [scheme, tint, androidDynamic],
  );
}
