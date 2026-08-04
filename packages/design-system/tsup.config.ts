import { defineConfig } from "tsup";

// Multi-entry build: TS tokens + providers + canonical schema + brand-genesis preset.
// Ordering (see package.json "build"): `build:tokens:native && tsup &&
// build:tokens:css`.
//   - Native token files (src/tokens/native.ts, native-themes.ts) are generated
//     by style-dictionary BEFORE tsup, so the bundled dist reflects the current
//     DTCG values instead of the previously-committed ones (one build behind).
//   - CSS themes (dist/themes/*.css) are generated AFTER tsup, because tsup's
//     clean:true wipes dist/.
//
// Per PRD-07 Phase A2 (v0.2.0): the 4 sibling brand presets
// (brand-{acme,breakthrough,team-tiderman,gamify}) were stripped. Only
// brand-genesis remains as the OOTB fallback. Consumers ship their own
// `@<consumer>/brand` workspace package satisfying the canonical schema.
export default defineConfig({
  entry: [
    "src/index.ts",
    "src/index.native.ts",
    "src/tokens/index.ts",
    "src/tokens/native.ts",
    "src/providers/native.ts",
    "src/presets/tailwind.ts",
    "src/presets/brand-genesis.ts",
    "src/schema/brand.ts",
    // PRD-07 A4.0 — cross-platform factories.
    "src/factories/from-brand.ts",
    // PRD-07 A2b — unified theme barrel + platform-specific providers.
    // Both `index.web.ts` and `index.native.ts` are emitted; the
    // package.json `exports."./theme"` block uses the `react-native`
    // conditional to route Metro at the native barrel and other
    // bundlers at the default (web) barrel.
    "src/theme/index.ts",
    "src/theme/index.web.ts",
    "src/theme/index.native.ts",
    "src/theme/provider.ts",
    "src/theme/provider.web.tsx",
    "src/theme/provider.native.tsx",
    "src/theme/use-theme.ts",
    "src/theme/theme.ts",
    "src/theme/flag.ts",
    "src/theme/context.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["react", "react-dom", "react-native"],
});
