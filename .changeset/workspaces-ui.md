---
"@marktiderman/genesis-ui": minor
---

`WorkspaceSwitcher` (`@marktiderman/genesis-ui/layout`): the workspace picker for AppShell's sidebar header, collapsed rail and phone top bar, with app-set labels, pictures, rows and footer. AppShell gains `mobileHeaderSlot`, which replaces the app name in the phone's top bar.

`ResourceView` now follows the viewer's scope by itself: inside a `ViewerScope` or `WorkspaceScope`, each of the view's `scope` keys filters the list (a list value, as in a roll-up, matches any of its values) and starts new rows. A screen's own `filter` wins over a scope key it also sets; `scoped={false}` opts a list out.
