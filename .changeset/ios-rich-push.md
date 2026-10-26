---
"@marktiderman/genesis-native": minor
"@marktiderman/genesis-chat": patch
---

iOS rich push. `@marktiderman/genesis-native/rich-push-plugin` is an Expo config plugin that adds a Notification Service Extension. The extension attaches `data.image` and `data.senderAvatar` (https only; it always shows the notification, even when a download fails), and it turns `messages` pushes into Communication Notifications: the sender's photo is shown, and Focus treats them as messages. The plugin also sets the communication entitlement, `NSUserActivityTypes` and the extension's EAS app extension entry. `richPushMessage` (in `/push` and the React-free `/push-payload`) sets `mutableContent: true`, without which iOS never runs the extension. genesis-chat adds `chatPushPayload`, which builds a message push's category, thread, `mutableContent` and data (sender, group, photo; ids only with hidden previews). It is server safe, from the new `@marktiderman/genesis-chat/push` subpath.
