---
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-ui-native": patch
---

Native chat polish:
- Full emoji picker (`ChatEmojiPicker`, `ChatEmojiPickerSheet`): search, category tabs and a grid, with the person's recent emoji kept with their drafts (cleared on sign-out by `clearDrafts`). About 1,870 emoji are bundled from emojibase-data (MIT), with no network and no CDN, and written as keyboards type them, so a picked 👍 counts with the quick one. The long-press sheet has "+" beside the quick reactions, and the composer has an emoji button that types at the cursor.
- Photo viewer (`ChatPhotoViewer`): full screen on black instead of a white page sheet, swiping through the tapped message's photos, pinch and double-tap zoom, and swipe down to close. Share and Save to Photos appear when the app passes `modules.sharing` (expo-sharing), `modules.mediaLibrary` (expo-media-library) and `modules.downloadFile`. `ChatMediaViewer` now opens the same viewer.
- `ChatAutoRetry` / `useChatAutoRetry`: `retryAll()` runs when the app comes back to the front and, with `modules.netInfo`, when the connection comes back (messages the server refused for good, `permanent`, are left alone).
- The thread shows `ChatAccessError` with Retry (`refetchAccess`) in place of the composer when your role couldn't be read.
- genesis-ui-native: `NativeFullScreenModal` (full-screen media and camera content, dark by default), and the `smile` and `download` icons.
