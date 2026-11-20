---
"@marktiderman/genesis-cli": patch
---

`genesis settings sync` skips an app without the settings block (no `genesis_settings` table: neither in genesis.lock.json nor a copy of its migration) with one line and exit 0, so a deploy step can run it in every app.
