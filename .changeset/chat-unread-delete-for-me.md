---
"@marktiderman/genesis-chat": minor
---

Mark as Unread and Delete for me, as Messages has them (migration 0007). `setMySettings(id, { markedUnread })` marks a conversation unread for you only: it counts as one unread in the inbox, the badges and the push badge until you read it, and your read place (what senders see as "Read") never moves back. `deleteConversationForMe(id, seq?)` takes it out of your inbox, and its history out of your thread, search and pins, up to the message you saw (`seq`), until a new message you can read brings it back with only what came after; nobody else's view or read receipts change. Both are private to you (a new `member_state` table only you read) and refresh your other devices' inbox. Apply `0007_genesis_chat_unread_and_delete_for_me.sql` after 0006.
