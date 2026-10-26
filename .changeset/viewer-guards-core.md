---
"@marktiderman/genesis-core": minor
---

Viewer-aware ResourceView guards. Guards, action guards and `when` get the viewer as their last argument (`create(viewer)`, `update(row, viewer)`, `delete(row, viewer)`, action `can(row, viewer)`, `when(row, viewer)`), and `view.can(...)`, `view.canAction(...)`, `workspace.settingsLocked(row, viewer)` and `workspace.headerFor(row, { viewer })` accept it. New `useViewer()` (`{ id, scope, roles }`, or `NO_VIEWER` outside a ViewerScope, so guards fail closed), the `Viewer` type, and `GenesisViewerRoles`, an empty interface apps fill by module augmentation. `ViewerScope` takes an optional `roles`, compared by value: equal roles change nothing, roles arriving keep the cache, different roles reset it (sending, not dropping, the viewer's waiting writes). One-argument guards keep working. Guards narrow what a page shows; row-level security stays the boundary.

Features: resource-page, resource-workspace
