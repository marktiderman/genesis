---
"@marktiderman/genesis-supabase": patch
---

`watchAppSettings` started right after another stopped (a sign-in, a sign-out) now joins its Realtime channels once the old ones are gone, and reads again on that first join. Before, realtime-js handed it the channel still leaving under the same topic, `subscribe()` did nothing, and live settings stopped. Adds the `AppSettings` type: the settings it and `resolveAppSettings` give.
