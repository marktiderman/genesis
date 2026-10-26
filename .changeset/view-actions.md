---
"@marktiderman/genesis-core": minor
---

`genesis-core/resource-view`: a view can declare `actions`, named operations on one row shaped like core's `RowAction` (`name`, `label`, `confirm`, `description`) plus an optional `can(row)` guard that returns `true` or a reason. `defineView` checks them at start-up (unique names, a name and label each, a function guard) and throws `ViewDefinitionError` otherwise. `view.actions()` lists them, frozen, and `view.canAction(name, row)` answers for one row; guards only narrow what the server allows.
