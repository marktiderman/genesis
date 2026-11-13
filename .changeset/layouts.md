---
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-features": minor
"@marktiderman/genesis-ui": minor
---

Layouts (ADR 0022): an app's navigation style, frame, density and a document page template, plus zones in Genesis navigation (ADR 0003). Every default renders as before.

- genesis-ui: `AppShellOptions.navigation` (`"sidebar"` default, `"rail"`, `"top-tabs"`, `"bottom-bar"`, `"page-tree"`) over the same navigation tree, `AppShellOptions.frame` (`"flush"` default, `"inset"`), and `density` gains `"spacious"` (types `AppShellNavigation`, `AppShellFrame`, `AppShellDensity`). New page template `DocumentPage` (cover, icon, title, reading column) at `/layout` and `/document-page`. New parts: `shell-frame`, `shell-top-tabs`, `shell-page-tree`, `tab-bar`, `tab-bar-item`, `sub-nav`, `sub-nav-item`, `page-header`, `page-header-title` and the document page's; the `shell` part carries `data-navigation`, `data-frame` and `data-zone`. `AppThemeLayout` gains `navigation` and `frame` (and `spacious`), passed by `appShellOptionsFromTheme`; the starter themes name a navigation style and a frame. `resolveNavigationZones` and the zone types are re-exported.
- genesis-design-system: one density vocabulary, `DENSITY_LEVELS` (`compact`, `comfortable`, `spacious`), `DensityLevel` and `resolveDensity`; sites' design systems accept `comfortable` and `spacious` as aliases of `normal` and `generous`. Component tokens `--shell-frame-gap`, `--shell-frame-radius`, `--shell-frame-border-width` and `--shell-frame-shadow` (read only by the inset frame).
- genesis-core: `NavigationNode.zone`, `ResolvedNavigation.zone`, `NavigationZone` and `resolveNavigationZones(tree, pathname, { zones, rollUp })`.
- genesis-features: `BlockNavItem.zone`.

Features: shell-navigation-styles, navigation-zones
