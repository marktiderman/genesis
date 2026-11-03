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
- `loading` (a skeleton), `updating` (an "Updating…" line), `firstUnreadId`, and `jumpTo` with `onLoadUntil` (through the new `useThreadJump`, promoted from chat's jump: it waits for the first page, highlights the message, and says when one can't be found);
- the send states `pending`, `paused` and `conflict`, with `onDiscard`;
- message `tone` (`MessageTone`; an internal note says so to VoiceOver), composer `modes`, `sendingLabel`, `above` and `trailing`, and a "Jump to latest" pill;
- the slots `event`, `unreadDivider` and `headerRegion`.

`GenesisModules` takes `keyboardAvoidingView` (react-native-keyboard-controller's), which ThreadPage uses with `automaticOffset`, so the composer follows the keyboard frame by frame wherever the page sits. The starter passes it. The optional peer react-native-keyboard-controller is now `>=1.21.0` (for `automaticOffset`).

**Behaviour changes for existing ThreadPage screens:**
- ThreadPage no longer uses the app's `KeyboardScrollProvider` (a virtualized list can't sit inside a scroll view). It sits in the keyboard module (with `automaticOffset`; `keyboardVerticalOffset` is extra space there), or React Native's `KeyboardAvoidingView` (`keyboardVerticalOffset` defaults to 100 on iOS, as before), under the testID `<testID>-keyboard`. The `-scroll` and `-kav` testIDs are gone.
- A new message scrolls into view only when you're at the bottom; up the thread, a "Jump to latest" pill shows instead (it used to always scroll to the newest).
- `header` now renders above the "Load earlier" button, in the list.
- `ThreadMessage.status` takes three more values (`pending`, `paused`, `conflict`): a custom `slots.message` with an exhaustive `switch` on it needs the new cases.
- The composer's input stays editable while a message sends (the keyboard stays up); a second send is still blocked.
- Earlier pages also load by themselves near the top, so `onLoadEarlier` can fire without a tap.
- With FlashList, rows are recycled, so state inside a custom `slots.message` component must be keyed by the message.
- The default send button is now a 44pt round button (it was a small "Send" button).
- Read receipts skip messages that are pending, paused or in conflict.

A new doctor rule, `threads-use-thread-list` (warn, native, newOnly), flags a hand-built inverted or bottom-started FlatList/FlashList in a screen that doesn't render ThreadPage, NativeThreadList or ChatThreadScreen.

Features: inbox-thread
