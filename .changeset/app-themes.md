---
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-ui": minor
---

App brands, app styles and app themes (ADR 0018): how an app looks, as pieces that combine freely. An app brand (`data-app-brand`) is colours and typefaces; an app style (`data-app-style`) is every component's size, shape and parts, with colours only from roles, so any brand goes with any style. An app theme bundles a brand, a style and a layout under one name.

- genesis-design-system: `@marktiderman/genesis-design-system/app-styles` exports `defineAppBrand` (a brand, `roles`, `fonts`), `appBrandCss`, `appBrandVariables`, `appBrandContrastProblems`; `defineAppStyle` (`tokens`/`darkTokens`, `parts`/`darkParts`, raw `css`), `appStyleCss`, `appStyleVariables`; `COMPONENT_TOKENS` (including the base `radius`) and `THEME_PARTS`. `themes/genesis.css` declares every component token at the value genesis-ui's classes had. Seven starter brands and seven starter styles ship in matching pairs (`tracker`, `repository`, `checklist`, `notebook`, `press`, `journal`, `arena`) in `themes/starter.css`; every brand reaches WCAG AA light and dark.
- genesis-ui: core components and the AppShell read component tokens in place of fixed sizes, shapes and weights (unchanged at the defaults; a `className` still wins), and mark their parts with `data-slot` plus `data-variant`, `data-size`, `data-active`, `data-side` and `data-density`. New `@marktiderman/genesis-ui/themes`: `defineAppTheme` (`brand`, `style`, `layout`, each optional), `appThemeAttributes`, `appShellOptionsFromTheme`, and seven starter themes (`STARTER_THEMES`, `getStarterTheme`, `withPairedBrand`).
