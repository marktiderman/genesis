---
"@marktiderman/genesis-ui-native": minor
---

ThreadPage is rebuilt on two new atoms that apps can also use on their own.

**`NativeThreadList`** is a bottom-anchored conversation list:
- oldest first, not inverted;
- holds its place while earlier messages load, both by themselves near the top and with the "Load earlier" button;
- follows the newest message only while you're at the bottom;
- goes to a message (`jumpTo`, with `onLoadUntil`) and announces it;
- uses FlashList v2's chat mode when the app passed `list`, else FlatList.

**`NativeComposerBar`** is the composer:
- grows as you type, up to `maxLines`;
- has a 44pt send button, which shows its label when no icon set is available;
- takes `modes` with a tone, where `internal` tints the bar;
- has `leading`, `trailing` and `above` slots.

ThreadPage adds:
- event rows (`kind: "event"`);
- `firstUnreadId`, `jumpTo` and `onLoadUntil`, and `refreshing`;
- the send states `pending`, `paused` and `conflict`, with `onDiscard`;
- message `tone`, composer `modes`, and a "Jump to latest" pill;
- the slots `event`, `unreadDivider` and `headerRegion`.

`GenesisModules` takes `keyboardAvoidingView` (react-native-keyboard-controller's), which ThreadPage uses so the composer follows the keyboard frame by frame. The starter passes it.

**Behaviour changes for existing ThreadPage screens:**
- ThreadPage no longer uses the app's `KeyboardScrollProvider` (a virtualized list can't sit inside a scroll view). It sits in the keyboard module, or React Native's `KeyboardAvoidingView`, under the testID `<testID>-keyboard`. The `-scroll` and `-kav` testIDs are gone.
- Earlier pages also load by themselves near the top, so `onLoadEarlier` can fire without a tap.
- With FlashList, rows are recycled, so state inside a custom `slots.message` component must be keyed by the message.
- The default send button is now a 44pt round button (it was a small "Send" button).
- Read receipts skip messages that are pending, paused or in conflict.

The doctor's `lists-use-native-resource-view` rule no longer flags a screen that renders ThreadPage, NativeThreadList or ChatThreadScreen.

Features: inbox-thread
