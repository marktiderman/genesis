---
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-ui": minor
---

App themes (ADR 0017): a whole-app look, from colours to every component's size, shape and parts, and the shell's layout.

- genesis-design-system: `@marktiderman/genesis-design-system/app-themes` exports `defineAppTheme` (a brand plus `roles`, `fonts`, `tokens`/`darkTokens`, `parts`/`darkParts`, raw `css` and `shell`), `appThemeCss` (scoped to `data-app-theme`, light and `.dark`), `appThemeVariables`, `appThemeContrastProblems`, `COMPONENT_TOKENS` and `THEME_PARTS`. `themes/genesis.css` declares every component token at the value genesis-ui's classes had. Seven starter themes ship (`tracker`, `repository`, `checklist`, `notebook`, `press`, `journal`, `arena`) in `themes/starter.css`, each reaching WCAG AA light and dark.
- genesis-ui: core components and the AppShell read component tokens in place of fixed sizes, shapes and weights (unchanged at the defaults; a `className` still wins), and mark their parts with `data-slot` plus `data-variant`, `data-size`, `data-active`, `data-side` and `data-density`. New `appShellOptionsFromTheme(theme)`.
