---
"@marktiderman/genesis-cli": minor
---

The native starter runs on `@marktiderman/genesis-notifications`: the Notifications tab is the notifier's feed (`NotificationsFeed`, live over the person's realtime channel), Settings → Notifications has a switch per category and channel (`NotificationPreferences`), and the push block registers through `notificationsPushBackend` with this install's id and takes its categories and action buttons from the app's registry (`src/lib/notifications.ts`). It carries the notifications migration and its pgTAP test; 0005's pgTAP test is gone (the notifications migration supersedes the register and forget it describes), and `genesis init --template native` records the `notifications` block.

Features: native-starter, notifications
