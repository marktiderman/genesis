---
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-chat": patch
---

- **ui-native:** `useThemeRoles().onPrimary` reads on every tint, a named colour too: `tint: "white"` now gives black text, resolved through `processColor`. Before, it fell back to the scheme's token, white on white. A fully transparent tint still takes the token.
- **ui-native:** `InboxPage` builds a row's swipe, long press and screen-reader actions from the row after the page's `slotProps.row`, so actions given there reach all three; an `actionProps` given there is laid over the generated one, key by key, so a long press of its own keeps the row's screen-reader actions.
- **chat:** `useConfirmDialog` gives focus back to the control that asked when its dialog closes (a second question asked while it is open keeps the first control). It takes a second, optional argument, `fallbackFocus`, for when that control is gone. `ChatInbox` passes the row whose menu asked, so Cancel goes back to that row, else the list's tab stop. Its row stays until the delete and the refetch come back, so `ChatInbox` also moves focus to the list's tab stop when that row goes, and a confirmed Delete leaves focus in the list (on the list itself once the last conversation is gone).
