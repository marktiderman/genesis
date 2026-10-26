---
"@marktiderman/genesis-chat": patch
---

Typing and recording signals are dropped until a conversation's live channel has joined, so supabase-js no longer falls back to REST and warns. The "New messages" line uses your read place as fetched for this opening, never a cached one from an earlier visit.
