---
"@marktiderman/genesis-design-system": minor
---

Every radius step now scales from the brand's `--radius`, so `0` is square everywhere. `rounded-sm`, `md`, `xl` (and `xs`, bare `rounded`, `2xl`, `3xl`) are multiples of `--radius` in the Tailwind v4 bridge, the v3 preset and the NativeWind preset, instead of `--radius` minus or plus a few px: `rounded-xl` at `--radius: 0` was 4px, and `rounded-sm` went negative on a small radius. `brandRoleVariables` (and so `themeFromBrand` and `createGenesisNativewindPreset({ brand })`) sets `--radius` from the brand's `radius.lg`, else `radius.DEFAULT`; a design system's `corners` set it so `rounded-xl` still lands on the set's `md`, and `square` is now `0px` instead of a negative calc.

What you'll see change:

- The `crisp` corners lose their square small corners: `rounded-sm` and `rounded-xs` are now small multiples of the radius instead of clamping to 0.
- A brand's own radius now takes effect: a brand that sets `radius.lg` or `radius.DEFAULT` gets every `rounded-*` step from it, where before the role classes stayed at the Genesis radius.
- On native, corners move by about 0.5px, since each step is a multiple of `--radius` rather than `--radius` plus or minus a fixed amount.
