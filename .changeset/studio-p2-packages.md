---
"@marktiderman/genesis-studio-server": minor
"@marktiderman/genesis-studio": minor
---

**Data Studio P2 — power editing** (docs/DATA-STUDIO.md P2).

- **studio-server:**
  - `updateMany` and `deleteMany` run in one transaction, each row version-checked in its own savepoint. Every failure is listed, then nothing is kept.
  - `import` inserts every row for real, in its own savepoint, so the database checks each value, constraint and row rule. Nothing is coerced. A dry run rolls back and lists every failing row.
  - `undo` makes a compensating, audited write for the user's own change, and refuses when the row has changed since. A deleted row comes back with its own key or not at all.
  - Re-run `npx genesis-studio-server sql` as a new migration: it adds `genesis_studio.audit_entry`, which with `loginRole` refuses any login but the studio's.
- **studio:**
  - **Sheet view** (`?view=sheet`), built on `SheetGrid`. A paste across rows is saved in one transaction through `updateMany`. If any row fails, nothing is saved and the failing cells are marked.
  - **Undo:** Cmd/Ctrl+Z, plus an Undo button in the activity panel and in a record's History.
  - **Bulk actions:** "Set a field…" and "Delete" on selected rows, all or none.
  - **CSV import:** map the columns, check every row with a dry run, then import in one transaction.
  - **`forms` prop:** form sections, and fields shown only when a condition holds, declared in code.
