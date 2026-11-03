---
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-chat": patch
---

Web messaging, review follow-ups.

- **genesis-ui:**
  - `ThreadPage` and `InboxPage` show times once hydrated, in the viewer's time zone, so server-rendered HTML matches.
  - The thread's log is a tab stop, so keyboard users can scroll it. "Jump to latest" moves focus to the log before it goes away.
  - Rows don't re-render on each keystroke in the composer.
  - `InboxPage.onEndReached` asks once per page, and the new `hasMore={false}` stops it.
  - The README lists the props that are web only.
- **genesis-ui-native:** `InboxPage` marks a `selected` row (filled, and `selected` to a screen reader), as the web does.
- **genesis-chat:** the web thread, inbox and composer docs name their move onto genesis-ui's components. No behaviour change.

Features: inbox-thread
