---
"@marktiderman/genesis-config": minor
"@marktiderman/genesis-supabase": minor
---

**Whole-number settings.** A number setting can be declared `integer: true` (a count, days,
milliseconds): `settingValueProblem` and `resolveSettings` refuse a fraction for it, the doctor
reads it from package.json `genesis.settings`, and `catalogueManifest` writes it. genesis-supabase
migration `0021_genesis_settings_integer.sql` makes `set_genesis_setting` refuse a fraction for such
a key too, so the database never stores a value every reader would skip.
