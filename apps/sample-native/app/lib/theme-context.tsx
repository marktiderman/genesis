/**
 * Portfolio-wide theme + a11y controls (Phase G).
 *
 * Wraps `GenesisThemeProvider` so the showcase app can flip mode
 * (light / dark / system), brand (genesis is the only built-in brand
 * today; the contract is here for future multi-brand stories), and
 * a "reduce motion" preference that primitive showcases consult.
 *
 * Used by `app/_layout.tsx` and `<ThemeControls />`.
 *
 * @stability stable
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Appearance, useColorScheme as useRNColorScheme } from "react-native";
import {
  GenesisThemeProvider,
  type Brand,
} from "@marktiderman/genesis-design-system/providers/native";

export type ThemeMode = "light" | "dark" | "system";

export interface PortfolioThemeContextValue {
  mode: ThemeMode;
  resolvedMode: "light" | "dark";
  setMode: (m: ThemeMode) => void;
  brand: Brand;
  setBrand: (b: Brand) => void;
  reduceMotion: boolean;
  setReduceMotion: (b: boolean) => void;
}

const PortfolioThemeContext = createContext<PortfolioThemeContextValue | null>(
  null,
);

export function usePortfolioTheme(): PortfolioThemeContextValue {
  const ctx = useContext(PortfolioThemeContext);
  if (!ctx) {
    throw new Error(
      "usePortfolioTheme must be used within a <PortfolioThemeProvider>",
    );
  }
  return ctx;
}

export function PortfolioThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useRNColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");
  const [brand, setBrand] = useState<Brand>("genesis");
  const [reduceMotion, setReduceMotion] = useState(false);

  const resolvedMode: "light" | "dark" = useMemo(() => {
    if (mode === "system") {
      return (systemScheme ?? Appearance.getColorScheme() ?? "light") as
        | "light"
        | "dark";
    }
    return mode;
  }, [mode, systemScheme]);

  const value = useMemo<PortfolioThemeContextValue>(
    () => ({
      mode,
      resolvedMode,
      setMode,
      brand,
      setBrand,
      reduceMotion,
      setReduceMotion,
    }),
    [mode, resolvedMode, brand, reduceMotion],
  );

  return (
    <PortfolioThemeContext.Provider value={value}>
      <GenesisThemeProvider brand={brand} mode={resolvedMode}>
        {children}
      </GenesisThemeProvider>
    </PortfolioThemeContext.Provider>
  );
}
