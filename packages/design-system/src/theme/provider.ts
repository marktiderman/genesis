/**
 * Platform-resolution barrel for `<GenesisThemeProvider>`.
 *
 * Metro (Expo) prefers `provider.native.tsx` automatically for native
 * builds via the platform-extension resolution rules. Web bundlers
 * (Vite, Webpack) with `.web.tsx` extensions configured prefer
 * `provider.web.tsx`. This file is the default fallback used by
 * non-bundled environments (Node, Jest/Vitest with default extension
 * resolution) — it points at the web implementation, which has no
 * `react-native` import and runs cleanly in JSDOM/Node.
 *
 * If you're consuming this package directly via TypeScript path
 * imports (i.e. not through a bundler), import from `./provider.web`
 * or `./provider.native` explicitly to bypass this barrel.
 */

export {
  GenesisThemeProvider,
  type GenesisThemeProviderProps,
} from "./provider.web";
