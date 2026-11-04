---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-chat": patch
---

Jumping to a row in a thread, settled.

- `useThreadJump` returns `cancel()`, which drops a jump the reader has taken over from.
- `NativeThreadList`: the reader's touch wins. A drag during a jump cancels the tries still queued (also the second try at the newest row) and a jump still loading, so nothing snaps back.
- `ThreadList` (web): a wheel, a touch, the scroll keys or the scrollbar drop a jump still loading. A row landing no longer takes focus from a field the reader is typing in. A jump that fails leaves the reader where they are; `NativeThreadList` still goes back to the newest, because FlatList may not have been placed yet.
- `ThreadPage` (web): with `onJumpFailed`, the app says what happened, as on native. Without it, a screen reader hears `labels.messageGone`.
- `NativeThreadList` and `ThreadList`: following new rows comes back on after a jump that moved nothing (a short thread).
- A row is gone when, once `onLoadUntil` has settled or failed, no row answers to its id. What's drawn counts, not what a cache holds: a jump to a message another view has cached, but this thread doesn't draw, loads and then says it's gone. A deleted message's tombstone is a row, so it's found.
- genesis-chat, web and native: a load that failed says so, and no longer also says the message is gone. A jump whose first page failed waits: it says the read failed and goes ahead when the rows come.
- For the record, from the release that added `jumpId`: `<testID>-earlier-loading` on chat's list became `<testID>-list-earlier-loading`.
