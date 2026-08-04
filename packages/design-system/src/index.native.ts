/**
 * Root barrel — native build (PRD-07 A2b).
 *
 * Identical to `./index.ts` except the unified-theme exports are routed
 * to `./theme/index.native.ts` (which sources `<GenesisThemeProvider>`
 * from `./theme/provider.native.tsx`). Metro picks this barrel via the
 * package's `react-native` export condition; web bundlers fall through
 * to `./index.ts`.
 */

// Tokens
export {
  neutral,
  semantic,
  status,
  fontFamily,
  fontSize,
  fontWeight,
  borderRadius,
  spacing,
  generateLightTheme,
  generateDarkTheme,
  themeToCss,
  type ThemeConfig,
} from "./tokens/index";

// Canonical brand schema
export {
  type ColorScale,
  type CanonicalBrand,
  type BrandExtensions,
  type BrandValidationResult,
  type TypographyTokens,
  type ShadowToken,
  type GradientToken,
  type PlatformOverridable,
  isColorScale,
  validateBrand,
} from "./schema/brand";

// Cross-platform factories
export {
  tailwindFromBrand,
  themeFromBrand,
  debugBrandPreset,
  type TailwindBrandOutput,
  type NativeBrandOutput,
  type BrandFactoryOptions,
} from "./factories/from-brand";

// Brand-genesis OOTB fallback
export { genesisTheme, genesisColors, genesisBrand } from "./presets/brand-genesis";

// Unified theme API — native variant.
export {
  GenesisThemeProvider,
  type GenesisThemeProviderProps,
  useTheme,
  resolveTokens,
  type ResolvedColorScale,
  type ResolvedThemeMode,
  type ResolvedTokens,
  type ThemeMode,
  type UseThemeReturn,
  GENESIS_THEME_V2,
  readGenesisThemeV2Flag,
} from "./theme/index.native";
