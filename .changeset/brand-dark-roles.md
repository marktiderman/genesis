---
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-sites": minor
---

Opt-in brand roles, backward compatible: `CanonicalBrand` gains optional `dark` (dark-mode roles that `brandRoleVariables`, `resolveTokens` and sites themes resolve from), `signal`, `accents` (`--brand-accent-<name>`, `theme.accents`), `gradients.primary` (`--brand-gradient-primary`, `theme.buttonGradient`) and `typography.display` (`--font-display`, `--font-weight-display`, `--font-numeric-display`, `theme.display`). New `brandExtraVariables`, `brandGradientCss` and `useOptionalTheme`. `Button` / `NativeButton` gain `variant="gradient"` (falls back to the primary), and new `TierBadge` / `NativeTierBadge` take a tone from `accents`. A brand that sets none of these renders exactly as before.
