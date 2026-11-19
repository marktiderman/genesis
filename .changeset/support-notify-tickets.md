---
"@marktiderman/genesis-supabase": patch
---

`genesis-support-notify` takes new reports from `public.tickets`, the table genesis-support's migration 0004 renamed `support_reports` to. Before, it skipped every report sent after that migration. A webhook still on `support_reports` (an app that hasn't applied 0004) keeps working; point it at `tickets` once 0004 is applied. The handler exports the accepted names as `REPORT_TABLES`.
