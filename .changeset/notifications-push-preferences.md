---
"@marktiderman/genesis-notifications": minor
---

`notificationsPushPreferences(supabase)` (from `/native`): the push block's `loadPreferences` / `savePreferences` on this package's preferences row, for an app that registers devices its own way: `createPush({ backend: { register, forget, ...notificationsPushPreferences(supabase) } })`, and Settings → Notifications reads and saves the notifier's preferences. `notificationsPushBackend` is now built on it (no change in behavior). Type `PushPreferencesBackend`.
