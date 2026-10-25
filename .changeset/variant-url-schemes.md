---
"@marktiderman/genesis-cli": minor
---

`withGenesis()` gives each `APP_VARIANT` its own URL scheme: `development` appends `-dev` and `preview` appends `-preview` to every `scheme` (production keeps the base), so builds installed side by side no longer register the same scheme and a `scheme://` link opens the build it names. `VariantSuffix` gains `scheme`; change it with `variants: { development: { scheme: "-debug" } }`. An app that matches incoming links against its scheme should read the build's own (`Constants.expoConfig.scheme`), as the starter's `src/lib/links.ts` now does.

Features: expo-config-plugin
