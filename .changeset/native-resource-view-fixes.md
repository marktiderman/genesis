---
"@marktiderman/genesis-ui-native": patch
---

NativeResourceView fixes:
- An open edit sheet diffs a save against the values it opened with, so a field someone else changed while it was open isn't sent back.
- Pages that `maxPages` drops from the front load back when the list reaches the top (`onStartReached`), and the rows on screen keep their place (`maintainVisibleContentPosition`). `useNativeResourceView` returns `loadPrevious`, `hasPrevious` and `loadingPrevious`.
- A create form leaves out the fields the screen's `filter` fixes, since the filter's value is what's saved.
