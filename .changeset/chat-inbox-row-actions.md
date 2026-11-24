---
"@marktiderman/genesis-chat": minor
---

`ChatInboxScreen`'s rows get Messages' actions on the iOS standards' swipe (G1-315). Swipe right for Mark as Unread (or Read, full swipe) and Pin; swipe left for Hide Alerts and Delete (full swipe, after a confirmation, for you only: `deleteConversationForMe`). Archive moves to the long-press menu. All are screen reader actions too, and one that fails shows an alert (`actionFailed`). The new `useInboxActions()` hook (`/react`) runs them: it refreshes the inbox and badge, and Delete for me (up to the row's `lastSeq`) drops the conversation's cached thread, pins and search results, so the deleted history can't reappear on that device. New copy: `markUnread`, `hideAlerts`, `showAlerts`, `deleteConversation`, `deleteConversationTitle`, `deleteConversationBody`.
