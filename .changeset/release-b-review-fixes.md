---
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-forms-devtools": patch
---

- **ui-native:** `useThemeRoles().onPrimary` reads on every tint, a named colour too: `tint: "white"` now gives black text, resolved through `processColor`. Before, it fell back to the scheme's token, white on white.
- **ui-native:** `InboxPage` builds a row's swipe, long press and screen-reader actions from the row after the page's `slotProps.row`, so actions given there reach all three.
- **chat:** `useConfirmDialog` gives focus back to the control that asked when its dialog closes. It takes a second, optional argument, `fallbackFocus`, for when that control is gone. `ChatInbox` passes the list's tab stop, so a confirmed Delete leaves focus in the list.
- **forms-devtools:** the flow map's styles apply only inside the map (`FlowMapPanel` gives it the class `genesis-flow-map`), so another React Flow canvas in your app keeps its own look.
