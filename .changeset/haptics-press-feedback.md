---
"@marktiderman/genesis-ui-native": minor
---

Haptics and press feedback. `GenesisModules.haptics` takes `expo-haptics` (`import * as`), and `useHaptics()` plays a named haptic through it (`light`, `medium`, `heavy`, `select`, `success`, `warning`, `error`; `playHaptic(module, kind)` outside React): it never throws or rejects, and without the module it does nothing. `usePressFeedback({ haptic })` gives a pressable of your own the shared feel: it shrinks while held on the motion tokens' `press` duration and springs back on `snappy`, or dims under Reduce Motion, with `select` ticking on press-in and other haptics playing on `confirm()` from `onPress`. `NativeButton` takes an optional `haptic` (`select` ticks on press-in, as in `usePressFeedback`), and `NativeComposerBar`'s send button now presses in and taps `light` when a message sends (with the module given). A new doctor rule, `haptics-use-genesis`, warns on new code (not tests) that calls expo-haptics' `impactAsync`, `selectionAsync` or `notificationAsync` directly.

Features: motion-kit
