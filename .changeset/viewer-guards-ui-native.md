---
"@marktiderman/genesis-ui-native": minor
---

NativeResourceView and NativeResourceWorkspace pass the viewer (`useViewer()`) to the view's guards and `when`: cells, the peek, swipe actions, create, header actions and the settings lock. `allowed(view, action, row, screen, viewer?)` and `swipeActionsFor`'s `viewer` option take it for screens that map rows themselves.

Features: resource-page, resource-workspace
