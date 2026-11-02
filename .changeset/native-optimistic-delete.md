---
"@marktiderman/genesis-core": patch
---

Fix an optimistic or undoable write throwing "undefined is not a function" on React Native. The page-unload listeners a waiting write adds were guarded only by `typeof window !== "undefined"`, but React Native's global `window` has no `addEventListener` on Hermes, so a `NativeResourceView` delete (swipe or row sheet) failed before the provider's `deleteOne` was called. Core now adds those listeners only where `window` can take them (`pageWindow()`), and the same guard covers `useDraft` and `useUnsavedChangesGuard`. The web keeps its `beforeunload` / `pagehide` handling unchanged.
