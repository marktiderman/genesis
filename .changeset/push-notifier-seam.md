---
"@marktiderman/genesis-native": minor
---

The push block connects to `@marktiderman/genesis-notifications`. `createPush` takes `deviceCategories` (notification categories with action buttons, registered when the block starts through `setNotificationCategoryAsync`) and `randomUUID`. A `PushBackend` that sets `usesInstallationId` gets this install's id (made once, kept across sign-ins) as `register`'s fourth argument, so a server can move a token between logins only on the same phone; `supabasePushBackend` is unchanged. `notificationAction(response)` reads a tapped action button: its id, the typed text (`userText`), the link and the notifier's `notification_id`. `NotificationResponseLike` gains `userText`, `NotificationsModuleLike` an optional `setNotificationCategoryAsync`, and `PushErrorSource` `"categories"`.

Features: push, notifications
