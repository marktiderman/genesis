---
"@marktiderman/genesis-ui-native": minor
---

`InboxPage` and `ThreadPage`, two generic conversation layouts in `SettingsPage`'s iOS inset grouped style.

`InboxPage`: unread dot or count, a short time, a preview and a status line, pull to refresh, paging and an empty state with an action. Swipe actions are always reachable as accessibility actions and on long press; the `swipeable` slot takes a gesture-handler wrapper for the swipe itself.

`ThreadPage`: messages with attachments, a read receipt, "load earlier", optimistic sending and retry, and a composer kept above the keyboard through `KeyboardScrollProvider` (or a `KeyboardAvoidingView` without it); `composer={null}` is read-only.

The React Native type stubs gain the props these use (`accessibilityActions`, `onAccessibilityAction`, `onPressIn` / `onPressOut`, `onContentSizeChange`, FlatList's `refreshControl` and `contentInsetAdjustmentBehavior`), and the test shim renders FlatList headers and footers and accessibility actions.
