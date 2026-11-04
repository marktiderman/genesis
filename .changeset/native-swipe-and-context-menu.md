---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui-native": minor
---

`NativeSwipeRow`: a row's actions behind a swipe, on the app's `GenesisModules.swipeable` (`ReanimatedSwipeable`); without the module, just the row. `InboxSwipeAction` takes `side` (`leading` or `trailing`, the default). `InboxPage`'s `swipeable` slot defaults to it.

`NativeContextMenu`: what a long press opens, a sheet of actions with Cancel. An action runs once, after the sheet has gone. `InboxPage` (one menu for the page, `<testID>-menu`) and `NativeComposerBar`'s `sendActions` open it instead of the system alert. `NativeSheet` takes `onDismissed`. `NativeResourceView` still uses `showInboxActions`.
