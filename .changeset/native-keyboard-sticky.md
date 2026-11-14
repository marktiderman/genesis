---
"@marktiderman/genesis-native": minor
---

Features: native-layouts
`GenesisNativeApp` takes `keyboardSticky` (react-native-keyboard-controller's `KeyboardStickyView`), which keeps FormPage's Save / Cancel bar above the keyboard. Like `keyboardToolbar`, it needs `keyboardScroll`, and says so in development without it.
