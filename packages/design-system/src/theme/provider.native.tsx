/**
 * Native `<GenesisThemeProvider>` — PRD-07 A2b unified theme model.
 *
 * Wraps children in the React context that `useTheme()` reads. The
 * factory's NativeWind variables (`themeFromBrand().variables.{light,
 * dark}`) are NOT injected here at runtime — they live in the
 * consumer app's `global.css`, processed by NativeWind v5's Metro
 * pipeline at bundle time. The provider's runtime job is mode tracking
 * and the `useTheme()` context value, identical to the web provider.
 *
 * --------------------------------------------------------------------------
 * Mode resolution
 * --------------------------------------------------------------------------
 *
 *   - Controlled: `mode` prop wins; `setMode` warns + no-ops.
 *   - Uncontrolled: defaults to `"system"`; resolves via React Native's
 *     `useColorScheme()` (re-exported from `react-native`).
 *
 * Both `mode` (caller intent, may be `"system"`) and `resolvedMode`
 * (OS-resolved `"light" | "dark"`) are surfaced via `useTheme()` so
 * consumers can build 3-state mode selectors that persist intent and
 * still drive tokens off the resolved value.
 *
 * Note: this module imports from `react-native` at the top level. It is
 * resolved by Metro at native build time. On web builds Metro/Vite pick
 * `provider.web.tsx` via the platform-extension resolution rules
 * (`.native.tsx` is preferred on RN; `.web.tsx` on web bundlers).
 */

import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
// eslint-disable-next-line import/no-unresolved
import { useColorScheme } from "react-native";
import { GenesisThemeContext } from "./context";
import {
  resolveTokens,
  type ResolvedThemeMode,
  type ResolvedTokens,
  type ThemeMode,
  type UseThemeReturn,
} from "./theme";
import type { CanonicalBrand } from "../schema/brand";

export interface GenesisThemeProviderProps {
  brand: CanonicalBrand;
  mode?: ThemeMode;
  defaultMode?: ThemeMode;
  onModeChange?: (mode: ResolvedThemeMode) => void;
  children: ReactNode;
}

export function GenesisThemeProvider({
  brand,
  mode: controlledMode,
  defaultMode = "system",
  onModeChange,
  children,
}: GenesisThemeProviderProps) {
  const isControlled = controlledMode !== undefined;
  const [internalChoice, setInternalChoice] =
    useState<ThemeMode>(defaultMode);

  const choice: ThemeMode = isControlled
    ? (controlledMode as ThemeMode)
    : internalChoice;

  // RN `useColorScheme()` returns "light" | "dark" | null.
  const systemRaw = useColorScheme();
  const systemResolved: ResolvedThemeMode = systemRaw === "dark" ? "dark" : "light";

  const resolvedMode: ResolvedThemeMode =
    choice === "system" ? systemResolved : (choice as ResolvedThemeMode);

  useEffect(() => {
    onModeChange?.(resolvedMode);
  }, [resolvedMode, onModeChange]);

  const setMode = useCallback(
    (next: ThemeMode) => {
      if (isControlled) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn(
            "[GenesisThemeProvider] setMode called while `mode` prop is " +
              "controlled — ignoring. Update the controlled prop instead."
          );
        }
        return;
      }
      setInternalChoice(next);
    },
    [isControlled]
  );

  const tokens: ResolvedTokens = useMemo(
    () => resolveTokens(brand, resolvedMode),
    [brand, resolvedMode]
  );

  const value: UseThemeReturn = useMemo(
    () => ({
      brand,
      mode: choice,
      resolvedMode,
      setMode,
      tokens,
    }),
    [brand, choice, resolvedMode, setMode, tokens]
  );

  return createElement(
    GenesisThemeContext.Provider,
    { value },
    children
  );
}
