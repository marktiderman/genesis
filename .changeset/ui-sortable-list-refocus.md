---
"@marktiderman/genesis-ui": patch
---

SortableList: a keyboard pick-up no longer stays stuck after a cancel or drop, focus stays on the row's own button (or the handle) when a move — or a rejected move's revert — puts the row elsewhere, and two moves in the same tick send one `onReorder`. Rows also disarm on `contextmenu` and window blur, and `SortableListReorder` is exported from the package root.
