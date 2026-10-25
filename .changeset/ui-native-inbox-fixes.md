---
"@marktiderman/genesis-ui-native": patch
---

`NativeRefreshControl` no longer throws inside `GenesisNativeApp`: its tint is the theme's `tint` role (`useThemeRoles`) rather than `useGenesisTheme` from `providers/native`, a context the shell never mounts. `InboxPage` uses it for pull to refresh, draws its empty and loading states in a scroll view so they sit below a large-title header (and can be pulled to refresh), and takes an `avatar` per row, between the unread dot or count and the text, with the separator starting at the text.
