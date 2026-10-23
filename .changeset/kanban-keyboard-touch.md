---
"@marktiderman/genesis-ui": minor
---

KanbanBoard cards can now be moved by touch and from the keyboard, not only by mouse or the "Move to…" menu. Each movable card has a drag handle:

- On a touch screen, drag the handle to the column under your finger.
- From the keyboard, focus the handle and press Space or Enter to pick the card up. Use ←/→ (or Home/End) to choose a column, then Space or Enter to drop it, or Escape to put it back. Alt+←/→ moves the card one column without picking it up.

Every finished move, and every failed one, is announced in a polite live region. Focus follows the card to its new column.

This is the same engine as SortableList: native drag and drop plus a keyboard pick-up, with no new dependency. The live-region announcer is now shared between the two. `onMoveItem(item, toColumn)` is unchanged.
