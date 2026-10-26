---
"@marktiderman/genesis-chat": patch
---

The access Retry (`refetchAccess`, also `refetchConversation`) refetches every lookup of a conversation, so the away line and the rest recover too. Migration 0003 also broadcasts any change to a message's moderation, however it's made, so a hidden message updates live.
