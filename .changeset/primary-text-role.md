---
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-forms-web": patch
"@marktiderman/genesis-forms-builder": patch
"@marktiderman/genesis-forms-studio": patch
"@marktiderman/genesis-sites": patch
"@marktiderman/genesis-support": patch
---

A new theme role, `primary-text`: the primary as text or an icon on the page, readable for every brand.

`primary` is a fill colour, and a light brand primary (a gold `#FFC402` on white is 1.6:1) made every link, active tab, stat and icon coloured with `text-primary` unreadable. `--primary-text` (the `text-primary-text` class on web and in the NativeWind preset) is now declared in both modes for every brand: the primary where it reads at 4.5:1 on that mode's background, otherwise the primary's hue darkened (light mode) or lightened (dark mode) until it does. The gold above becomes `#947100` (4.54:1) on white. Genesis's own indigo already reads, so nothing changes for the default theme.

- **design-system:** `brandRoleVariables`, `themeFromBrand`, the NativeWind preset, `themes/genesis.css`, the Tailwind v4 bridge and the design-system colour engine all emit `--primary-text`. A brand can pick the exact shade with the new optional `primaryText` and `dark.primaryText` fields. `brandContrastProblems` checks primary text on the page at 4.5:1.
- **ui, ui-native, chat, forms, sites, support:** components that coloured text or icons with `text-primary` now use `text-primary-text`. Fills (`bg-primary`), borders and rings are unchanged. `brandThemeStyle` and the sites theme set `--primary-text` too.

`themes/genesis.css` declares `--primary-text: var(--primary)`, so an app that sets only `--primary` in its own CSS looks exactly as before. If that primary is light, set `--primary-text` beside it (or take the role variables from `brandRoleVariables` / `themeFromBrand`) and drop any app-side "readable primary" token. Use `text-primary-text` in your own screens wherever you colour text with the primary.
