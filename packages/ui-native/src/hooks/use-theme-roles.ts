/**
 * useThemeRoles — the theme roles (background, label, separator, tint…) as
 * colors for this platform and color scheme.
 *
 * On iOS every neutral role is a system color through `PlatformColor`, so a
 * screen follows light and dark mode, increased contrast and accessibility
 * settings like the system apps. On Android the roles are the Genesis tokens
 * for the current scheme. A brand sets `tint`.
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

export function useThemeRoles(options: { tint?: string } = {}): ThemeRoleColors {
  const scheme = useThemeMode();
  const { tint } = options;
  return useMemo(
    () =>
      resolveThemeRoles<ColorValue>({
        target: Platform.OS === "ios" ? "ios" : "android",
        scheme,
        platformColor: (name) => PlatformColor(name),
        tint,
      }),
    [scheme, tint],
  );
}
