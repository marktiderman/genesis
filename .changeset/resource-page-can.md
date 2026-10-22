---
"@marktiderman/genesis-ui": minor
---

`ResourcePage` takes one permission check, `can(action, item)`, with `action` being `"create"`, `"edit"` or `"delete"`. Returning false hides the New button, or that row's Edit or Delete, and the built-in edit form won't open for it. `ResourceAction` is exported.

`canEditItem`, `canEdit` and `canDelete` are deprecated. They still work alongside `can` (a row any of them refuses stays refused) and will be removed after one minor.
