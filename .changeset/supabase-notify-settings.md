---
"@marktiderman/genesis-supabase": minor
---

The `genesis-support-notify` Edge Function template reads `support.githubRepo` and
`support.webhookUrl` from the app's settings (`genesis_settings_layers`) when `GITHUB_REPO` or
`SUPPORT_WEBHOOK_URL` isn't set, and posts no webhook with `support.staffAlerts` off;
`settingsFromLayers` reads a value as the resolver would (locked file, database, file).
