---
"@marktiderman/genesis-forms-native": patch
"@marktiderman/genesis-ui-native": patch
---

`FormFocus` no longer uses `InputAccessoryView`, which React Native 0.88 deprecates (Metro warned on every form with a number or phone question). With the app's keyboard toolbar (`keyboardToolbar` on `GenesisNativeApp`, react-native-keyboard-controller's `KeyboardToolbar`), the bar above the keyboard hides its arrows and its done button says Next (or Send) and moves the step on; without one, the form's own Next button stays in view. `KeyboardToolbarProps` in genesis-ui-native now lists the optional `showArrows`, `doneText` and `onDoneCallback` Genesis may pass (all `KeyboardToolbar`'s own).

`InboxPage` lets a tap in its header land while the keyboard is up (`keyboardShouldPersistTaps="handled"`): the idea board's first tap on "Suggest" pressed nothing and only closed the keyboard.

Features: forms-native, inbox-thread
