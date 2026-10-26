---
"@marktiderman/genesis-core": minor
---

Supabase resources can read from a view or a set-returning database function (`source: "view"` or `source: { rpc, args }`) and name their default columns (`select`), keeping paging, filters, search, sort, totals, cursors and live updates; writes still go to the table.
