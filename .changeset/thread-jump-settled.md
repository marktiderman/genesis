---
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-chat": patch
---

Jumping to a row in a thread, settled. No prop changes.

- `NativeThreadList`: the reader's touch wins. A drag or a fling during a jump cancels the tries still queued (also the second try at the newest row), so nothing snaps back.
- `NativeThreadList` and `ThreadList`: following new rows comes back on after a jump that moved nothing (a short thread).
- A row is gone when, once `onLoadUntil` has settled or failed, no row answers to its id. What's drawn counts, not what a cache holds: a jump to a message another view has cached, but this thread doesn't draw, loads and then says it's gone. A deleted message's tombstone is a row, so it's found.
- genesis-chat's native thread: a load that failed says so, and no longer also says the message is gone.
- For the record, from the release that added `jumpId`: `<testID>-earlier-loading` on chat's list became `<testID>-list-earlier-loading`.
