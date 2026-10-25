---
"@marktiderman/genesis-native": minor
"@marktiderman/genesis-supabase": minor
"@marktiderman/genesis-ui-native": minor
---

The push block, `@marktiderman/genesis-native/push`: `createPush({ notifications, platform, projectId, backend: supabasePushBackend(supabase), categories, storage, appState, openSettings, links, hold, onOpen })`, a `defineBlock` block (`id: "push"`) for `<GenesisNativeApp blocks={[push]}>`. It contributes a Settings row (`useBlockSettings`, the permission as its subtitle), a bounded boot step that reads the permission, its route and its migration. `NativeAppSlots` gains `pushPrompt`.

- **Permission**: never asked at launch. `usePushPrompt().offer(reason)` shows a soft pre-prompt (the `pushPrompt` slot, default `PushPromptSheet`) only after a launch grace, while signed in and while the system can still ask, with a cooldown after "Not now" and a cap on how often; its "Turn on" brings up the system prompt.
- **Registration**: once permission is granted, the signed-in person's Expo push token is registered (`getExpoPushTokenAsync({ projectId })`), again when the OS rotates it, and forgotten on sign-out, account switch and deletion, even after the session has ended; a forget that fails offline is retried at the next start. No `projectId` is reported once, loudly.
- **Android channels**: `default` plus one per category, private on the lock screen, made before the permission prompt and the token.
- **Foreground and taps**: a foreground handler (`useSuppressNotifications` hides a screen's own kind), tap routing through `normalizeLink` and GenesisNativeApp's held link (the launching tap too, once), and the badge (`useBadge`).
- **NotificationSettings**: a `SettingsPage` with `permission`, `categories`, `quietHours` and `privacy` parts, each a slot and a hook (`usePushPermission`, `useNotificationCategories`, `useQuietHours`, `usePrivacyPreviews`); saved at once, put back when a save fails.

`@marktiderman/genesis-supabase` ships `migrations/0005_genesis_push.sql` (`push_devices`, `notification_preferences`, `push_receipts`, owner-only row level security, functions granted by name, `genesis_push_targets` honouring categories, time-zone-aware quiet hours and hidden previews) with a pgTAP test, and the `genesis-push-send` Edge Function template: Expo sends in batches of 100, neutral text for hidden previews, a receipt per ticket, a receipts poll, `DeviceNotRegistered` devices forgotten, and no token or content in its logs or answers.

`@marktiderman/genesis-ui-native`: `SettingsPageSection` takes `children`, rendered inside the section's group after its rows, so a pattern built on `SettingsPage` can put a replaced part in the same section. On iOS, `NativeTimePicker` and `NativeDatePicker` render the compact picker alone (it is its own button); the extra button beside it showed the value twice.

Features: push, push-sender
