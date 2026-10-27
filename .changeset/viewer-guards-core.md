---
"@marktiderman/genesis-core": minor
---

Viewer-aware ResourceView guards. Guards, action guards and `when` get the viewer as their last argument (`create(viewer)`, `update(row, viewer)`, `delete(row, viewer)`, action `can(row, viewer)`, `when(row, viewer)`), and `view.can(...)`, `view.canAction(...)`, `workspace.settingsLocked(row, viewer)` and `workspace.headerFor(row, { viewer })` accept it. New `useViewer()` (`{ id, scope, roles }`, or `NO_VIEWER` outside a ViewerScope, so guards fail closed), the `Viewer` type, and `GenesisViewerRoles`, an empty interface apps fill by module augmentation. `ViewerScope` takes an optional `roles`, plain JSON compared by value with lists in any order (a Set, Map or class instance throws in development; in production it warns once and the roles count as unknown, so guards refuse): equal roles change nothing, roles arriving keep the cache, and different roles send the viewer's waiting writes and then reread every query, without remounting (a write the new roles refuse fails like any refused write). `ResolvedColumn.when`'s viewer is optional (no viewer answers for no one), and `view.can("create", row, viewer)` throws rather than reading the row as the viewer. One-argument guards keep working. Guards narrow what a page shows; row-level security stays the boundary.

Features: resource-page, resource-workspace
