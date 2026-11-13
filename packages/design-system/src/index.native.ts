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
  THEME_ROLES,
  resolveThemeRoles,
  type ResolveThemeRolesOptions,
  type ThemeRole,
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
  type BrandDarkRoles,
  type BrandGradient,
  type DisplayTypography,
  type PlatformOverridable,
  type BrandValidationOptions,
  type BrandContrastFinding,
  isColorScale,
  clampBounds,
} from "./schema/brand";
// The full check (shape and contrast); "./schema/brand" keeps the light shape check.
export { validateBrand, brandContrastProblems, type BrandContrastProblem } from "./schema/brand-contrast";

// Design systems and the OKLCH colour engine (pure maths; same as web).
export * from "./design-systems/index";

// The fonts a brand may choose.
export {
  FONT_CHOICES,
  FONT_CLASSES,
  FONT_IDS,
  LATIN_UNICODE_RANGE,
  SELF_HOSTED_FONTS,
  fontFileKey,
  fontForStack,
  type FontClass,
  type FontId,
  type FontInfo,
  type SelfHostedFont,
} from "./fonts";

// Cross-platform factories
export {
  tailwindFromBrand,
  themeFromBrand,
  debugBrandPreset,
  type TailwindBrandOutput,
  type NativeBrandOutput,
  type NativeDisplayText,
  type BrandFactoryOptions,
} from "./factories/from-brand";
export { brandExtraVariables, brandGradientCss, brandRoleVariables, type BrandRoleVariables, type BrandRoleVariablesOptions } from "./factories/brand-roles";

// Brand-genesis OOTB fallback
export { genesisTheme, genesisColors, genesisBrand } from "./presets/brand-genesis";

// Unified theme API — native variant.
export {
  GenesisThemeProvider,
  type GenesisThemeProviderProps,
  useTheme,
  useOptionalTheme,
  resolveTokens,
  type ResolvedColorScale,
  type ResolvedThemeMode,
  type Appearance,
  type ResolvedAppearance,
  type ResolvedTokens,
  type ThemeMode,
  type UseThemeReturn,
  GENESIS_THEME_V2,
  readGenesisThemeV2Flag,
} from "./theme/index.native";

// Motion: durations, easings and springs, for web CSS and native (Reanimated) alike.
export * from "./tokens/motion";
