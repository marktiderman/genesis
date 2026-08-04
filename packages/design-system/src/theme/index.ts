/**
 * Unified theme barrel — PRD-07 A2b.
 *
 * This file is the default barrel — it re-exports the WEB build
 * (`./index.web.ts`) which sources `<GenesisThemeProvider>` from
 * `./provider.web.tsx` (no `react-native` import; safe for SSR + JSDOM
 * + Node test runners). Native consumers resolve `./index.native.ts`
 * automatically via the package's `react-native` export condition.
 *
 * Why this layout?
 *
 *  - `provider.web.tsx` and `provider.native.tsx` differ in their
 *    runtime imports (`useColorScheme` from `react-native` vs.
 *    `matchMedia` on `window`).
 *  - We want a SINGLE consumer-facing import path:
 *    `import { GenesisThemeProvider } from "@marktiderman/genesis-design-system"`.
 *  - Conditional package exports (`react-native` condition) let Metro
 *    pick the native barrel and Vite/Webpack pick this default barrel.
 *
 * See `package.json` `exports.["./theme"]` for the wiring.
 */

export * from "./index.web";
