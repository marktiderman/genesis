---
"@marktiderman/genesis-chat": patch
---

genesis-chat's native `threadListMode`, `nearBottom`, `AT_BOTTOM_POINTS` and `useJumpToMessage` are deprecated: genesis-ui-native's `threadListMode`, `threadNearBottom`, `THREAD_AT_BOTTOM_POINTS` and `useThreadJump` replace them, and ChatThreadScreen moves onto NativeThreadList next. `ChatThreadScreen` now also uses the app's `GenesisModules.keyboardAvoidingView` when chat's own `keyboardAvoidingView` isn't passed, so the module is passed once. Nothing else changes.

Features: inbox-thread
