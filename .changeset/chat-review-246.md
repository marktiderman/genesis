---
"@marktiderman/genesis-chat": patch
---

Search no longer shows members a hidden message's voice or video transcript (observers find hidden messages, as they read them). The runner sends the moderator every photo of a message, in order, not the first four. The link unfurler's HTML parsing runs in linear time on a hostile page. `useConversation` returns `conversationLoading`, and the web composer waits on it, so a conversation that settles to nothing shows "can't post" instead of loading forever.
