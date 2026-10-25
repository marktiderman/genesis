---
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-cli": patch
---

Fixes from an end-to-end run of the native starter on an iOS 26 simulator.

- `NotificationsPage`: the empty state sat under the large-title header, behind the Dynamic Island. It is now in a scroll view with `contentInsetAdjustmentBehavior="automatic"`, as the list is, so iOS insets it below the header and above the tab bar; pull to refresh works on it too.
- `SettingsSubPage`: with `KeyboardToolbar`, the toolbar floated about a tab bar's height above the keyboard, and with the keyboard closed it showed above the tab bar. The keyboard-scroll layout no longer pads its bottom edge (the toolbar sticks to the keyboard from that edge); the scroll view's automatic inset keeps the last field clear instead.
- Starter: `genesis-starter://check-in?gym=hilltop`, the link the check-in screen documents, opened Home. The link map now has `/check-in` (with `features.checkIn` on).
