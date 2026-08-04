/**
 * Unified theme barrel — native build (PRD-07 A2b).
 *
 * Identical exports to `./index.web.ts`; the only difference is the
 * `GenesisThemeProvider` is sourced from `./provider.native.tsx` (which
 * imports from `react-native`). Metro picks this file automatically
 * for native platforms via the package's `react-native` export
 * condition; the `index.ts` barrel re-exports `index.web.ts` as the
 * default for everything else (web bundlers, Jest/Vitest, Node).
 */

export {
  GenesisThemeProvider,
  type GenesisThemeProviderProps,
} from "./provider.native";
export { useTheme } from "./use-theme";
export {
  resolveTokens,
  type ResolvedColorScale,
  type ResolvedThemeMode,
  type ResolvedTokens,
  type ThemeMode,
  type UseThemeReturn,
} from "./theme";
export { GENESIS_THEME_V2, readGenesisThemeV2Flag } from "./flag";
