---
"@marktiderman/genesis-supabase": minor
---

Adds `sql/testing/genesis_testing.sql`, a pgTAP kit that checks an app's own schema keeps the Genesis data rules: refused writes, server-owned columns, guards that let system work through (signed out, bypass settings, ON DELETE SET NULL), private values never leaking through reports, and row counts per user. It uses shared owner, staff, client and stranger fixture ids.
