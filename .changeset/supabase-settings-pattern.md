---
"@marktiderman/genesis-supabase": minor
---

Settings: migration `0025_genesis_settings_pattern.sql` makes the database refuse a string setting that doesn't match its key's `pattern` (genesis-config's new `pattern`, written into the synced catalogue), in `set_genesis_setting`, the tenant and person writes and the server's resolver alike. A `pattern` that isn't a string, or that Postgres can't compile, is reported as a malformed catalogue entry. It is part of the settings block (`genesis migrate` copies it).
