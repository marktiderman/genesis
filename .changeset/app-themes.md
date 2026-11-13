---
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-ui": minor
---

App brands and app themes (ADR 0017): how an app looks, as two independent choices. An app brand (`data-app-brand`) is colours and fonts; an app theme (`data-app-theme`) is every component's size, shape and parts and the shell's layout, with colours only from roles, so any brand goes with any theme.

- genesis-design-system: `@marktiderman/genesis-design-system/app-themes` exports `defineAppBrand` (a brand, `roles`, `fonts`), `appBrandCss`, `appBrandVariables`, `appBrandContrastProblems`; `defineAppTheme` (`tokens`/`darkTokens`, `parts`/`darkParts`, raw `css`, `shell`), `appThemeCss`, `appThemeVariables`; `COMPONENT_TOKENS` (including the base `radius`) and `THEME_PARTS`. `themes/genesis.css` declares every component token at the value genesis-ui's classes had. Seven starter brands and seven starter themes ship in matching pairs (`tracker`, `repository`, `checklist`, `notebook`, `press`, `journal`, `arena`) in `themes/starter.css`; every brand reaches WCAG AA light and dark.
- genesis-ui: core components and the AppShell read component tokens in place of fixed sizes, shapes and weights (unchanged at the defaults; a `className` still wins), and mark their parts with `data-slot` plus `data-variant`, `data-size`, `data-active`, `data-side` and `data-density`. New `appShellOptionsFromTheme(theme)`.
