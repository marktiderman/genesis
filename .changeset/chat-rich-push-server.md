---
"@marktiderman/genesis-chat": patch
---

The runner builds each push with `chatPushPayload`, so iOS shows chat pushes as Communication Notifications: the sender's name and photo (`resolveAvatar`, https only), the group name, `mutableContent`, the `messages` category, and the message ids. `createExpoDeliver` sends `mutableContent`, and the `chat.message` notification type renders `push: { ids, display, mutableContent }` for genesis-notifications (display values only when previews are shown).
