---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-chat": minor
---

genesis-chat's web `ChatThread` and `ChatInbox` now sit on genesis-ui's `ThreadPage` and `InboxPage`, with chat's rows and composer in their slots. Their props are unchanged.

- `ThreadMessage` takes an optional `jumpId`: the id `jumpTo` names a message by, when that isn't its `id`. Both `ThreadPage`s honour it, and web `ThreadList` takes `jumpId`, as `NativeThreadList` already does.
- Web `InboxPage`: Home and End go to the first and last rows. Web `ThreadList` no longer chains its scroll to the page around it.
- What a chat reader sees change on the web: the pill says "Jump to latest" whenever they've scrolled up, instead of "New messages" only when one arrived. A message of yours from another device no longer pulls them to the bottom; what they send here still does. A jump that can't load says the load failed, not that the message is gone. Inbox rows have dividers. `ChatInbox` shows cached rows when a refresh fails, instead of the error.
- Test ids: `genesis-chat-scroller` is `genesis-chat-thread-page-messages`, `genesis-chat-announcer` is `genesis-chat-thread-page-messages-announcer`, `genesis-chat-new-pill` is `genesis-chat-thread-page-jump-latest`, and `genesis-chat-thread-loading` is `genesis-chat-thread-page-messages-loading`.

Chat now needs genesis-core 2.13.0 and genesis-ui 2.32.0.
