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

// Canonical brand schema (extensions slot, declaration-merging types).
// See ./schema/brand.ts for the consumer-facing extension contract.
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

// Cross-platform factories (PRD-07 A4.0). Derive a Tailwind v4 web preset
// AND a NativeWind v5 native theme from a single CanonicalBrand object.
// See research/a4-0-cross-platform-factory-spike.md for the verdict.
export {
  tailwindFromBrand,
  themeFromBrand,
  debugBrandPreset,
  type TailwindBrandOutput,
  type NativeBrandOutput,
  type BrandFactoryOptions,
} from "./factories/from-brand";

// Brand-genesis OOTB fallback. The 4 sibling brand presets that used to live
// here (acme / breakthrough / team-tiderman / gamify) were stripped in
// v0.2.0 — consumers now ship their own `@<consumer>/brand` workspace package
// declaring brand-specific scales via the `extensions` slot. See MIGRATION.md.
export { genesisTheme, genesisColors, genesisBrand } from "./presets/brand-genesis";

// Unified theme API (PRD-07 A2b). One <GenesisThemeProvider> + useTheme()
// import path that works on web AND native. Ships behind the
// GENESIS_THEME_V2 flag during the dual-mode window; the existing
// `./providers/native` GenesisThemeProvider remains available alongside
// until visual parity is confirmed and v1 is removed in the final commit
// of A2b (or deferred to G-PR-3b). See docs/MIGRATION.md `v0.2.x → v0.3.0`
// for the consumer-side migration.
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
} from "./theme";
