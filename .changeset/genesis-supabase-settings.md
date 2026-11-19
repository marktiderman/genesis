---
"@marktiderman/genesis-supabase": minor
---

The `settings` block: migration `0020_genesis_settings.sql` adds `genesis_settings` (the database
layer of Genesis settings, with locks), `genesis_setting_changes` (every change, trigger-written,
with its source) and `genesis_app_manifest` (one row: packages, preset, file settings and the
settings catalogue). Platform admins change runtime settings through `set_genesis_setting` and
`clear_genesis_setting`, gated by the app's `private.genesis_platform_admin(person)` hook (without it
nobody can, as with tenant features), and checked against the synced catalogue. Any signed-in
person reads the layers with `genesis_settings_resolved()`. Client helpers: `readSettingsLayers`,
`resolveAppSettings`, `setGenesisSetting`, `clearGenesisSetting`, `genesisSettingHistory`, and
`writeAppManifest` for the service role on deploy.
