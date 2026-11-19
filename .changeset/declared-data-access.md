---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
---

Declared data access (docs/DATA-ACCESS.md). The Supabase provider takes per-resource `writes` (named database functions for create, update and delete, called with `p_values` / `p_id` / `p_expected_version` unless `args` names them), `actions` (named row actions, now served by `runAction`) and `table` (a declared opt-in to raw table access, with its `why`). `access: "declared"` makes the declarations binding: an undeclared read or write, or a resource missing from `resources`, is refused with a message that names what to declare; the default (`"open"`) refuses nothing. One change reaches every app, open ones included: a raw create or update now asks the table for the row's `id` (and its version) only and reads the record back through the resource's read, so what a create or update returns is the resource's row as it reads (a view's joined columns included), or the values sent when that read fails. `runAction` is served only when some resource declares an action, and `capabilities().actions` says which; `ResourceView` and `NativeResourceView` hide a view's actions for a resource whose provider runs none, and run an action (from a list row, a bulk selection or a record page) at the version the row was read at (`expectedVersion`), so a row changed since is a conflict. `accessRules` (`@marktiderman/genesis-core/testing`) turns one function's access rule into runner-neutral test cases, allowed and refused. The doctor adds `data/declared-access` (a provider left open, a table write in app code) and `data/access-rule-tests` (a declared function with no `accessRules` test), and the generated agent guide states the pattern.

Features: declared-data-access
