/**
 * useThemeMode — read the active color scheme (light / dark / unset).
 *
 * Wraps RN's `Appearance.getColorScheme()` + `Appearance.addChangeListener`
 * with a stable React hook so consumers don't have to wire it themselves.
 *
 * Use this in tokens-aware components when you need to choose between
 * light/dark variants OUTSIDE of Tailwind's `dark:` modifier (e.g., to pick
 * an asset, run an extra-color computation, or set StatusBar style).
 *
 * @stability Beta
 */
import { useEffect, useState } from "react";
import { Appearance, type ColorSchemeName } from "react-native";

export type ThemeMode = "light" | "dark";

export function useThemeMode(): ThemeMode {
  const [scheme, setScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme(),
  );

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  return scheme === "dark" ? "dark" : "light";
}
