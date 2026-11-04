---
"@marktiderman/genesis-chat": minor
---

ChatThreadScreen is built on genesis-ui-native's `NativeThreadList`: the same oldest-first, bottom-anchored list, now with one implementation of following the bottom, keeping its place while earlier messages load, and going to a message (`jumpTo`). What changes for a person: "Load earlier messages" says it's busy while it loads, the thread shows cached messages while it refreshes instead of a skeleton, and messages sit 12pt from the screen's edges, with a rounded highlight on the message a jump lands on.

Test IDs under the list moved with it: `<testID>-earlier` is now `<testID>-list-earlier`, and `<testID>-loading` is now `<testID>-list-loading`. Update any end-to-end flows that tap or wait on them.

Deprecated, to be removed in a later minor: `useJumpToMessage` and `rowIndexOf` (use NativeThreadList's `jumpTo`/`jumpId`, or `useThreadJump`), and `threadListMode`, `nearBottom` and `AT_BOTTOM_POINTS` (use genesis-ui-native's `threadListMode`, `threadNearBottom` and `THREAD_AT_BOTTOM_POINTS`).
