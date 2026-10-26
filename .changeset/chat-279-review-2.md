---
"@marktiderman/genesis-chat": patch
---

- `refetchConversation` (and so `refetchAccess`, the offline Retry) refetches the conversation, topics, availability, members, role and pins, never the message lists: a refetch had replaced loaded history and merged live messages with one fresh page.
- The web inbox previews a message that is only an app card by its kind's `label`, else its title, as native does: both use the same previews module (`src/react/previews.ts`).
- `ChatVideoRecorder`'s `videoUpload` says it must match the provider's (or the provider needs a `hostedUpload`).
