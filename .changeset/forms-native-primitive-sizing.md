---
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-forms-native": patch
---

`NativeButton` keeps a caller's `accessibilityState.busy` when `loading` is not set, so a screen reader hears "busy". The form's Button and answer field drop the primitives' fixed height and boxed-field classes, so they grow with the text size and keep the answer line.
