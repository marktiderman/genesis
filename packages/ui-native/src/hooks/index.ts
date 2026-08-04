/**
 * Genesis UI-native hooks — Layer-3/4 helpers.
 *
 * Hooks here are meant for consumer code AND internal Genesis primitives.
 * Group conventions mirror genesis-core/src/hooks (category folders for
 * future growth; flat exports today since the surface is small).
 */

export { useReducedMotion } from "./use-reduced-motion";
export { useThemeMode, type ThemeMode } from "./use-theme-mode";
export {
  BrandExtensionsProvider,
  useGenesisExtension,
  type BrandExtensionsValue,
  type BrandExtensionsProviderProps,
} from "./use-genesis-extension";
