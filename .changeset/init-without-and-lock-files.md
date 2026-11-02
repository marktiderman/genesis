---
"@marktiderman/genesis-cli": minor
---

`genesis init --template native --without <switches>` turns starter.config.ts feature switches off, and leaves the blocks they carry out whole (migrations, pgTAP tests, Edge Functions, the starter's supabase files tagged only with them, their config.toml sections and API schemas). The lock records only the blocks that are on, and every file it names is written. The starter says which switch carries which block in its genesis.config.json (`starter.blocks`).

`genesis upgrade` and `genesis migrate` leave out a locked block whose starter.config.ts switch is off: no migrations planned, its files neither refreshed nor added (`migrate --block <id>` still checks one asked for).

New doctor rule `lock-files`: a file genesis.lock.json owns that is missing on disk is a warning (upgrade never brings it back); mark a deletion on purpose with `"deleted": true` in its lock entry. A locked file edited in the app, or a locked block switched off, is info.

A new app's genesis.config.json sets `doctor.supabase.since` just after its newest copied migration, so a fresh app (before it has a git history) passes the doctor with warnings only for the store ids in eas.json. init's summary lists each of those with what replaces it.
