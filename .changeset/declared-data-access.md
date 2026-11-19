---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-cli": minor
---

Declared data access (docs/DATA-ACCESS.md). The Supabase provider takes per-resource `writes` (named database functions for create, update and delete, called with `p_values` / `p_id` / `p_expected_version` unless `args` names them), `actions` (named row actions, now served by `runAction`) and `table` (a declared opt-in to raw table access, with its `why`). `access: "declared"` makes the declarations binding: an undeclared read or write, or a resource missing from `resources`, is refused with a message that names what to declare; the default (`"open"`) changes nothing for existing apps. A create or update now asks the table for the row's `id` only and reads the record back through the resource's read, so a write never selects a column the client may not read. `accessRules` (`@marktiderman/genesis-core/testing`) turns one function's access rule into runner-neutral test cases, allowed and refused. The doctor adds `data/declared-access` (a provider left open, a table write in app code) and `data/access-rule-tests` (a declared function with no `accessRules` test), and the generated agent guide states the pattern.

Features: declared-data-access
