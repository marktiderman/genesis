---
"@marktiderman/genesis-cli": patch
"@marktiderman/genesis-supabase": patch
---

`genesis settings sync` writes the app manifest (genesis-supabase's `genesis_app_manifest`: the Genesis packages and versions, the preset, genesis.config.json `settings` and the settings catalogue) through the linked Supabase project (`supabase db query --linked`); `--print` gives the SQL for a pipeline that runs it with psql, and `--app-id` names the app when its package.json name isn't an id. Run it on every deploy, after the migrations: until the manifest is written, `set_genesis_setting` refuses every value, and nothing wrote it. The settings block's setup step and the genesis-supabase README say so; a server can still write it at start with `writeAppManifest`.
