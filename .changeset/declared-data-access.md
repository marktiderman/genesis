---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
---

Declared data access (docs/DATA-ACCESS.md). The Supabase provider takes per-resource `writes` (named database functions for create, update and delete, called with `p_values` / `p_id` / `p_expected_version` unless `args` names them), `actions` (named row actions, now served by `runAction`) and `table` (a declared opt-in to raw table access, with its `why`). `access: "declared"` makes the declarations binding: an undeclared read or write, or a resource missing from `resources`, is refused with a message that names what to declare; the default (`"open"`) refuses nothing and writes exactly as before. On a declared provider a table create or update asks for the row's `id` (and its version) only and reads the record back the way the resource reads, so a write never selects a column the client may not read; a write through a `writes` function reads back the same way in either mode. `runAction` is served only when some resource declares an action, and `capabilities().actions` says which; `ResourceView` and `NativeResourceView` hide a view's actions for a resource whose provider runs none, and run an action (from a list row, a bulk selection or a record page) at the version the row was read at (`expectedVersion`), so a row changed since is a conflict. `accessRules` (`@marktiderman/genesis-core/testing`) turns one function's access rule into runner-neutral test cases, allowed and refused, and `expectAccessRulesCover` fails for each function the provider's options declare without one (`declaredFunctions` lists them). The doctor adds `data/declared-access` (a provider left open, a table write in app code) and `data/access-rule-tests` (a Supabase provider with no `expectAccessRulesCover` test), and the generated agent guide states the pattern.

Features: declared-data-access
