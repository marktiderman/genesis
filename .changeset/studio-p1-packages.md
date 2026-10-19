---
"@marktiderman/genesis-studio-server": minor
"@marktiderman/genesis-studio": minor
---

**Data Studio P1 — the studio people want to live in** (docs/DATA-STUDIO.md P1).

- **studio-server:**
  - **Create and delete:** creates and deletes run as the user and are audited, and deletes are version-checked.
  - **Audit history:** a record's history, limited to fields the user may read.
  - **`describe()`:** reports relations (`one`, `many`, or `through` a junction), a label field, and the fields a new row may set.
  - **Multi-field server sort.**
  - **Rule-bearing writes (decision 29):** `resources[name].functions` routes create, update or delete through the app's own database functions.
  - **The `outbox` audit sink and `createOutboxWorker`:**
    - delivery is at least once and in order per record;
    - claiming uses SKIP LOCKED, so two workers never send the same entry;
    - retries use backoff with jitter (10 attempts over about a day);
    - failed entries move to a dead-letter table with an alert, until replayed;
    - a run that fails before delivering (a refused login, a missing grant) is reported to `onError`;
    - delivered rows can be pruned.
  - **Writes run at REPEATABLE READ.** A write carried by an app function stays conflict-checked even where the user can't take a row lock. A delete takes no row lock, so DELETE rights alone are enough.
  - With `loginRole`, `record_history` refuses any login but the studio's, like `record_audit`.
  - **`byResource` rules** gain `create`, `delete` and `history`.
  - Re-run `npx genesis-studio-server sql` as a new migration: it adds the outbox tables and the history function, and is safe to run again.
- **studio:**
  - **The record pop-up:** a schema-built form (react-hook-form + zod: required, numbers, dates, enums, JSON), related records, history, delete with confirmation, and a copyable link.
  - New peers: `react-hook-form` ^7, `zod` ^3.25 or ^4, and `@hookform/resolvers` ^5.1 (the first with Zod 4 support).
  - **Rows and links:** adding a row; relation pickers that search on the server; and labels for link cells, one query per linked table per page.
  - **Server-side list controls:** a filter builder with operators by field type, multi-field sort and group-by, all kept in the URL.
  - **Saved views:** filters, sort, search, grouping and visible columns.
  - **CSV export:** every filtered row (up to 10 000), with cells that would run as spreadsheet formulas neutralised.
  - **Controls follow the provider:** they hide what it can't serve, and disabled actions say why.
