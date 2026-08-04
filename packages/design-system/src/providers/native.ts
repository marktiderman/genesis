/**
 * GenesisThemeProvider — React Native theme context.
 *
 * Provides resolved native token values (hex colors, px numbers) for a
 * brand + color mode (light/dark).
 *
 * As of v0.2.0 (PRD-07 Phase A2), Genesis ships only the `genesis` brand
 * primary inline. Consumer apps that need a different brand pass an
 * explicit `primary` color (or full `brandColors` override) in via the
 * provider props — sourced from their `@<consumer>/brand` workspace
 * package — instead of a hardcoded brand id.
 *
 * Usage:
 *
 *   // Default — uses brand-genesis OOTB fallback.
 *   <GenesisThemeProvider mode="light">
 *     <App />
 *   </GenesisThemeProvider>
 *
 *   // Consumer app supplying its own brand primary:
 *   import { gamifyBrand } from "@gamify/brand/native";
 *   <GenesisThemeProvider primary={gamifyBrand.accent.DEFAULT} mode="light">
 *     <App />
 *   </GenesisThemeProvider>
 *
 *   const theme = useGenesisTheme();
 *   theme.colors.primary  // "#10b981" by default, or whatever the consumer passed
 *   theme.spacing["page-x"] // 16
 */

import { createContext, useContext, useMemo, createElement } from "react";
import type { ReactNode } from "react";
import {
  nativeColors,
  nativeSpacing,
  nativeRadius,
  nativeFontSize,
  nativeLineHeight,
  nativeFontWeight,
  nativeFontFamily,
  nativeTypography,
} from "../tokens/native";
import { nativeThemeLight, nativeThemeDark } from "../tokens/native-themes";

// ---------------------------------------------------------------------------
// Brand color maps
// ---------------------------------------------------------------------------

export interface BrandColors {
  primary: string;
  primaryForeground: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  destructive: string;
}

/**
 * Brand identifier accepted by the provider. Genesis ships only `"genesis"`
 * out of the box; consumer brand packages add their own keys via TypeScript
 * declaration merging on `BrandRegistry`.
 *
 * In a consumer brand package's `types.d.ts`:
 *
 *   declare module "@marktiderman/genesis-design-system" {
 *     interface BrandRegistry {
 *       gamify: true;
 *       acme: true;
 *     }
 *   }
 *
 * After this declaration, `<GenesisThemeProvider brand="gamify">` is fully
 * typed at every callsite. The registry must be an interface (not a type
 * alias) — TypeScript declaration merging works on interfaces and
 * namespaces, not on `type X = ...`.
 */
export interface BrandRegistry {
  genesis: true;
}

export type Brand = keyof BrandRegistry;

/** Default `genesis` brand primary (emerald-500 — matches the DTCG brand primary). */
export const GENESIS_PRIMARY = "#10b981";

function resolveBrandColors(
  primary: string,
  mode: "light" | "dark",
  primaryForeground?: string
): BrandColors {
  // Non-primary surface colors come from the DTCG themes (generated into
  // src/tokens/native-themes.ts by `pnpm build:tokens`), so the native
  // theme mirrors tokens/dtcg/themes/{light,dark}.json instead of
  // re-hardcoding the palette here. `primary` is the brand accent (passed
  // in); `primaryForeground` defaults to the theme's value but stays
  // overridable for consumer brands with non-default primaries.
  const theme = mode === "light" ? nativeThemeLight : nativeThemeDark;
  return {
    primary,
    primaryForeground: primaryForeground ?? theme.primaryForeground,
    background: theme.background,
    foreground: theme.foreground,
    card: theme.card,
    cardForeground: theme.cardForeground,
    muted: theme.muted,
    mutedForeground: theme.mutedForeground,
    border: theme.border,
    destructive: theme.destructive,
  };
}

// ---------------------------------------------------------------------------
// Theme value type
// ---------------------------------------------------------------------------

export interface GenesisTheme {
  brand: Brand;
  mode: "light" | "dark";
  colors: BrandColors & {
    neutral: typeof nativeColors.neutral;
    semantic: typeof nativeColors.semantic;
    status: typeof nativeColors.status;
  };
  spacing: typeof nativeSpacing;
  radius: typeof nativeRadius;
  fontSize: typeof nativeFontSize;
  lineHeight: typeof nativeLineHeight;
  fontWeight: typeof nativeFontWeight;
  fontFamily: typeof nativeFontFamily;
  typography: typeof nativeTypography;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const GenesisThemeContext = createContext<GenesisTheme | null>(null);

export function useGenesisTheme(): GenesisTheme {
  const ctx = useContext(GenesisThemeContext);
  if (!ctx) {
    throw new Error(
      "useGenesisTheme must be used within a <GenesisThemeProvider>"
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface GenesisThemeProviderProps {
  /**
   * Brand identifier. v0.2.0 ships only `"genesis"`; left as a prop so
   * consumer packages can extend via TS module augmentation later. Use
   * `primary` to override the primary color from a consumer brand package.
   */
  brand?: Brand;
  /** Light or dark color mode. */
  mode?: "light" | "dark";
  /**
   * Override the primary color (consumer brand packages source this from
   * their canonical brand object's `accent.DEFAULT`). Defaults to the
   * Genesis emerald.
   */
  primary?: string;
  /**
   * Override the primary foreground color. The defaults (`#ffffff` light,
   * `#09090b` dark) are tuned for the Genesis emerald primary; once
   * `primary` is overridden to an arbitrary brand color, the fixed
   * foreground may not satisfy WCAG contrast. Pass an explicit value
   * sourced from the consumer brand package to keep primary surfaces
   * readable.
   */
  primaryForeground?: string;
  children: ReactNode;
}

export function GenesisThemeProvider({
  brand = "genesis",
  mode = "light",
  primary = GENESIS_PRIMARY,
  primaryForeground,
  children,
}: GenesisThemeProviderProps) {
  const theme = useMemo<GenesisTheme>(() => {
    const brandColors = resolveBrandColors(primary, mode, primaryForeground);
    return {
      brand,
      mode,
      colors: {
        ...brandColors,
        neutral: nativeColors.neutral,
        semantic: nativeColors.semantic,
        status: nativeColors.status,
      },
      spacing: nativeSpacing,
      radius: nativeRadius,
      fontSize: nativeFontSize,
      lineHeight: nativeLineHeight,
      fontWeight: nativeFontWeight,
      fontFamily: nativeFontFamily,
      typography: nativeTypography,
    };
  }, [brand, mode, primary, primaryForeground]);

  return createElement(
    GenesisThemeContext.Provider,
    { value: theme },
    children
  );
}
