---
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-native": patch
"@marktiderman/genesis-notifications": patch
---

Docs. genesis-chat: the README covers `/native` (Beta: its screens and their main props), lists migration 0003 and names the push category `messages`. genesis-native: the rich push plugin's first-build steps for the Notification Service Extension (enable Communication Notifications on `<bundle id>.NotificationService`, then `eas credentials` to make its profile). genesis-notifications: a push carries a type's `push.ids` (and, with previews shown, `push.display` and `mutableContent`), and the Notification Service Extension works with it through genesis-native.
