/**
 * Unified theme barrel — PRD-07 A2b.
 *
 * Re-exports the consumer-facing API:
 *   - `<GenesisThemeProvider>` — single import path on web + native.
 *   - `useTheme()` — returns the same shape on every platform.
 *   - Types — `ResolvedTokens`, `UseThemeReturn`, `ThemeMode`, …
 *   - `GENESIS_THEME_V2` — feature-flag readers (for the dual-mode window).
 *
 * Platform resolution: `./provider` re-exports `provider.web.tsx` by
 * default; bundlers with platform-extension priority pick
 * `provider.native.tsx` on native automatically. See `./provider.ts`
 * for the resolution rules.
 */

export { GenesisThemeProvider, type GenesisThemeProviderProps } from "./provider";
export { useTheme } from "./use-theme";
export {
  resolveTokens,
  type ResolvedColorScale,
  type ResolvedThemeMode,
  type ResolvedTokens,
  type ThemeMode,
  type UseThemeReturn,
} from "./theme";
export {
  GENESIS_THEME_V2,
  readGenesisThemeV2Flag,
} from "./flag";
