---
"@marktiderman/genesis-design-system": patch
---

Every radius step now scales from the brand's `--radius`, so `0` is square everywhere. `rounded-sm`, `md`, `xl` (and `xs`, bare `rounded`, `2xl`, `3xl`) are multiples of `--radius` in the Tailwind v4 bridge, the v3 preset and the NativeWind preset, instead of `--radius` minus or plus a few px: `rounded-xl` at `--radius: 0` was 4px, and `rounded-sm` went negative on a small radius. At the Genesis radius (0.625rem) every size is unchanged. `brandRoleVariables` (and so `themeFromBrand` and `createGenesisNativewindPreset({ brand })`) sets `--radius` from the brand's `radius.DEFAULT`, else `radius.lg`; a design system's `corners` set it so `rounded-xl` still lands on the set's `md`, and `square` is now `0px` instead of a negative calc.
