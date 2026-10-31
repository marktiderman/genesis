---
"@marktiderman/genesis-design-system": patch
"@marktiderman/genesis-native": patch
---

Brand role variables no longer read a color's `light` / `dark` keys as light and dark mode. Those keys are emphasis tints, so an app whose text tint was a light taupe got taupe body text on a white tint (under 4.5:1).

- design-system: `brandRoleVariables` takes a brand's colors from its `DEFAULT`s, as `tailwindFromBrand` emits them for web. Dark mode keeps the Genesis dark theme, with the brand's accent as the primary only where it reaches 4.5:1 on the dark background.
- native: `GenesisNativeApp` no longer sets role variables over the app's own by default. Opt in with `brandVariables`: `true` sets `brandRoleVariables(brand)`, and an object (one map, or `{ light, dark }`) sets the app's own. For your brand's classes, use `createGenesisNativewindPreset({ brand })` or your brand package's variables in `tailwind.config`.
