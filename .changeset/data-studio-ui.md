---
"@marktiderman/genesis-ui": minor
---

**DataTable and ResourcePage, extended for Data Studio** (DATA-STUDIO.md decision 21). Additive; a **minor**.

- **`DataTableColumn.editable.onSave` may return a promise.** While it is pending the cell stays open in a saving state (one save, even when Enter and blur both fire); a rejection keeps the editor open with the draft and shows the error's message beneath the cell (`role="alert"`, `aria-invalid`), and leaving the cell after a failure doesn't silently retry. A `void` return closes the editor at once, exactly as before.
- **`ResourcePage` `getKey`** — row identity for rows not keyed by `id` (composite keys). Used for React keys and bulk selection; detail `route` mode still navigates by `item.id`.
- **`ResourceColumnDef.editable` and `.accessor`** pass straight through to `DataTable`.
