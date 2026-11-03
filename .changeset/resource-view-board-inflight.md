---
"@marktiderman/genesis-ui": patch
---

Board mode: two moves of one card sent before the board re-renders (a fast Alt+→ Alt+→) no longer both go through; the second is turned away while the first saves. `KanbanBoard`'s `canMoveItem` is documented as whether an item can be moved at all; a move that should wait is refused from `onMoveItem`, so keyboard focus stays on the card's handle.
