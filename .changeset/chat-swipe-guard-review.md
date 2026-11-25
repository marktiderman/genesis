---
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-chat": patch
---

Review fixes to the swipe row's press guard and the Messages look.

- **ui-native, `NativeSwipeRow`:**
  - A plain tap presses at once, as before; only while a drag is still reported does a press wait a frame (gesture-handler can report one just after the release). Synchronous press tests pass again.
  - The guard applies only to a row that swipes: a row with no actions on a side, or without gesture-handler, is untouched.
  - The touch's start is read from a wrapper view around the row, `<testID>-touch`, which never takes the touch.
  - The row element (NativeSwipeRow's child, or the element a menu wrapper holds, within five levels) carries the `onPress`; in development a hint says when none is found.
- **chat:**
  - A bubble's tail is drawn behind it (`ChatBubbleShape`, `MessageBubble`), so it never covers the first letters at the bottom corner (the peek's "It did" read "!t did").
  - The reply arrow hides again when a drag is cancelled (`onSwipeableWillClose`).
