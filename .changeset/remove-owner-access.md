---
"@marktiderman/genesis-supabase": minor
---

Remove the owner-access block and its migration, `0009_genesis_owner_access.sql`. Its only user, genesis-work, moved into Growth90 (`packages/work`), which keeps its own applied copy. Breaking for anyone importing `ownerAccessBlock`; nothing in Genesis does. `0016_genesis_viewer_people.sql` stays: per-person entitlements (`feature-mirror`) use it.

Features: owner-access
