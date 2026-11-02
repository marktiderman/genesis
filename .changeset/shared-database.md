---
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-notifications": patch
---

A phone app beside a web app shares its database. `genesis init --template native --beside <web-app>` writes no `supabase/` files (or the database CI workflow) when the web app has a `supabase/` folder, sets `"supabase": { "app": "../app" }` in genesis.config.json, drops the doctor's supabase pack, records the blocks that are on, and prints the `genesis add` line to run in the web app for the ones its lock doesn't list (requirements first, notifications before push). With that setting, or `"supabase": false`, `genesis add`, `migrate` and `upgrade` never write or plan Supabase files (migrations, pgTAP tests, Edge Functions, config.toml sections) in the app and say where to run them; `upgrade` leaves lock entries under `supabase/` alone. The doctor skips the supabase pack there, `lock-files` reports such entries as info, and a new `database-elsewhere` rule warns when the named app has no `supabase/` or a second copy is left in the app.

A block migration can declare the package migrations whose objects it provides or adopts (`provides` on its `genesis.blocks` entry). Once the providing migration is in the app, or is copied in the same run, the other is `provided`, never `new`. genesis-notifications' 0001 declares it provides genesis-supabase's 0005 (it adopts the push tables), so `migrate` and `add push` no longer list 0005 as new in an app that has notifications, where copying it failed with "relation already exists".

`genesis upgrade` accepts the `REPLACE_WITH_APP_FOLDER` substitution `init --template native` records, so it no longer refuses every app init made.
