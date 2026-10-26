---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": patch
---

**An edit never blanks what it didn't load.** `useResourceForm` (and so ResourcePage, ResourceView and ResourceForm) sends a field the opened record didn't carry only when the person changed it. A list that didn't load a column, or a value the server left out, can no longer be overwritten with an empty one by an unrelated edit. `updates: "all"` restores the old behaviour.

On a create, a field's `defaultValue` now wins over the blank template ResourcePage builds.

**ResourceView:**
- A link named in a view's form is read-only until there's a relation picker, so no one sends a hand-typed id.
- A screen's `filter` fills those fields on create.
