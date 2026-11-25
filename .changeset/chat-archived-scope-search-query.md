---
"@marktiderman/genesis-chat": patch
---

Native: `ChatInboxScreen` with `archived` now applies the first of its `filters`, so an app's scope (one organization's conversations, say) holds in Archived as it does in the inbox. `ChatSearchScreen` takes `initialQuery`, the text its field starts with (the inbox's "Search messages for…" passes its query).
