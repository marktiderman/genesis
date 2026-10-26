---
"@marktiderman/genesis-core": minor
---

`genesis-core/resource-view`: `scopeValues(view, scope)` returns `{ key: value }` for the scope keys a view declares, read from `ViewerScope`'s `scope` (`practice_id`, then `practiceId`), for a screen's `filter`. In development a declared key with no single value throws `ViewDefinitionError`. Action names `create`, `update` and `delete` are reserved for the view's own operations, and initials come from letters only, so a name with none (`"  "`, `"🎉🎉"`) has no initials and no picture.
