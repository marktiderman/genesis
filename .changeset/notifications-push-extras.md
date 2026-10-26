---
"@marktiderman/genesis-notifications": patch
---

A type's `render` can return `push: { ids, display, mutableContent }`: `ids` always reach the push's `data` (a Reply action needs the conversation and message), `display` values and `mutableContent` (for iOS rich push, genesis-native's Notification Service Extension) only when previews are shown. Flat values only, and the notifier's own `data` keys win. `PushMessage` gains `mutableContent`.
