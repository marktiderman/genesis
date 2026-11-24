---
"@marktiderman/genesis-ui": minor
---

`InboxRowMenu`: a row's actions as the web offers them, a More button opening a menu (destructive items in red). It's the twin of the phone's swipe and long-press menu. InboxPage's default row draws it, and a row of your own (the `row` slot) draws it the same way. Each item is `<testID>-action-<id>`, unchanged. An action a guard refused (`reason`) stays in the menu, dimmed, with its reason beneath it and in its accessible name (`Delete: <reason>`), as on the phone; choosing it runs its `onPress`, which explains instead of acting.

`InboxPage` draws an `InboxItem`'s `muted` and `pinned` as on the phone: a bell-slash and a pin beside the time (one group at the row's end), the unread count or dot in gray when muted, and both said to a screen reader after the title (`mutedLabel`, default "Alerts off"; `pinnedLabel`, default "Pinned").
