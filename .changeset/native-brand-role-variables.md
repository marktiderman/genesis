---
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-native": minor
---

The brand passed to `GenesisNativeApp` now reaches NativeWind's role classes. Before, `bg-primary` and the other role classes read the Genesis variables the preset declares, so an app's own brand stayed Genesis purple on screen.

- design-system: `brandRoleVariables(brand)` returns the theme role variables (`--primary`, `--background`, `--border`, …, light and dark) worked out from a brand, after its native `platformOverrides` (`{ platform: "web" }` for the web ones). `themeFromBrand(brand).variables` now includes them beside the `--color-*` scales. `createGenesisNativewindPreset({ brand })` (`presets/nativewind`) declares a brand's role variables instead of the Genesis ones; `genesisNativewindPreset` is unchanged.
- native: `GenesisNativeApp` can set the brand's role variables on a view around the app (NativeWind's `vars()`), opt-in with `brandVariables`. `nativewind` is now a peer dependency, as it already was for ui-native.
