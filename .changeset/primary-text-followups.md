---
"@marktiderman/genesis-design-system": patch
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
---

`primary-text` follow-ups.

- **design-system:** in light mode, `--primary-text` now also reaches 4.5:1 on the muted fill (message bubbles, muted rows), as muted text does. A gold `#FFC402` on white now gives `#8a6a00` (5.07:1 on white, 4.6:1 on the muted fill). `primaryText` and `dark.primaryText` must be `#rgb` / `#rrggbb` (schema and `validateBrand`), and a brand's own `primaryText` now wins over a design system's accent text in `themeFromBrand`. `generateLightTheme` / `generateDarkTheme` pick a readable `--primary-text` instead of copying the primary. The DTCG themes (and `nativeThemeLight` / `nativeThemeDark`) gain `primary-text`.
- **ui:** `brandThemeStyle(brand, { mode: "dark" })` and `workspaceThemeStyle(workspace, { mode: "dark" })` lighten `--primary-text` until it reads on the dark background, for a root that renders dark (an inline style can't follow `.dark`). EmptyState's action link underlines on hover instead of fading below 4.5:1.
- **ui-native:** the TabBar "More" sheet's active row uses `text-accent-foreground` on its accent fill.

If you override `--primary` on a nested element (a scoped theme), set `--primary-text` beside it: the `:root` fallback `var(--primary)` is resolved at the root.
