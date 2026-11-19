---
"@marktiderman/genesis-supabase": patch
---

`genesis-support-cleanup` also deletes context dumps past their retention (genesis-support's migration 0019, `support_purge_diagnostics`), 90 days by default or `GENESIS_SUPPORT_DIAGNOSTICS_RETENTION_DAYS`. Without 0019 it leaves them alone. Its answer gains `diagnostics` (how many went).
