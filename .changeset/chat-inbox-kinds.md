---
"@marktiderman/genesis-chat": patch
---

The inbox and the unread badge take several kinds or leave some out: `inbox({ kinds, excludeKinds })`, `unreadTotal({ excludeKinds })`, `useInbox` and `useUnreadTotal`, backed by new `p_kinds`/`p_exclude_kinds` parameters on `genesis_chat.inbox` and `unread_total` (migration 0002). Messages can now leave support tickets out of both the list and the badge.
