---
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-ui-native": patch
---

Fixes from the release review of the native thread:

- The scheduled messages sheet scrolls (`NativeSheetScrollView`) once its list is taller than the
  sheet, so the later ones and their Cancel stay reachable.
- `ChatThreadScreen` opens at the "New messages" line itself, not the message under it (search
  results and pinned messages still go to the message). Showing another conversation or thread in
  the same screen forgets where you had scrolled away, so its messages don't count as new.
- `NativeThreadList openAt`: a move to the bottom (a send) drops any opening retry still queued, so
  it can't pull the list back; if the opening row goes before the list reaches it, the list opens
  at the newest rows.
- `InboxPage` gives a `formatTime` of the app's own the exact clock on every render; only the
  default formatter is cached by the minute.
