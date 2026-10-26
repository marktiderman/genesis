---
"@marktiderman/genesis-supabase": minor
---

New migration `0011_genesis_updates.sql` and the `status-updates` block. `status_updates` holds dated updates, with health and a note, on a pursuit, work item or metric. `update_requests` asks one person for an update by a due time, and the first update that person posts on the item answers it. `update_requests_due` lists open requests and whether each is overdue. An update with a health also sets the pursuit's health.

Access goes through the item, using the same hooks as the pursuits and metrics blocks. A pgTAP test sits beside the migration.

Features: status-updates
