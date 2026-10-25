/**
 * The theme seam. Every part of a native form draws with plain React Native styles whose colors
 * come from theme roles (what a color is for: the page, a label, a separator, the tint), so it
 * works with or without NativeWind. The default is genesis-ui-native's `useThemeRoles`: iOS
 * system colors (light and dark mode, increased contrast) and Genesis tokens on Android. A host
 * passes its brand's `tint`, or any roles of its own.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ColorValue } from "react-native";
import { useThemeRoles, type ThemeRoleColors } from "@marktiderman/genesis-ui-native/hooks";

/** The colors a native form draws with, by role. */
export type FormTheme = ThemeRoleColors & {
  /** Text and icons on the tint (a selected option, the primary button). Default white. */
  onTint: ColorValue;
};

/** What a host may pass: a brand `tint`, and any role to override. */
export type FormThemeInput = Partial<FormTheme> & {
  /** On Android 12+, Material You colors for the neutral roles. */
  materialYou?: boolean;
};

const ThemeContext = createContext<FormTheme | null>(null);

/** The theme a form part draws with. */
export function useFormTheme(): FormTheme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useFormTheme: render inside <FormFocus> or <FormThemeProvider>.");
  return theme;
}

/** Resolve the roles once for a form (the device's colors, then the host's). */
export function FormThemeProvider({ theme, children }: { theme?: FormThemeInput | undefined; children: ReactNode }) {
  const { tint, materialYou, onTint, ...overrides } = theme ?? {};
  const roles = useThemeRoles({
    ...(typeof tint === "string" ? { tint } : {}),
    ...(materialYou ? { materialYou } : {}),
  });
  const key = JSON.stringify(overrides);
  const value = useMemo<FormTheme>(
    () => ({ ...roles, ...(tint !== undefined ? { tint } : {}), ...overrides, onTint: onTint ?? "#ffffff" }),
    // `overrides` is read through its key, so a new object with the same colors keeps the theme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles, tint, onTint, key],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
