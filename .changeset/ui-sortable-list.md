---
"@marktiderman/genesis-ui": minor
---

Add `SortableList` (`@marktiderman/genesis-ui/sortable-list`): a controlled list the user can rearrange by dragging a handle, from the keyboard (Space to pick up, arrows/Home/End to move, Space to drop, Escape to cancel, Alt+arrow for one step), or through `moveUp`/`moveDown`/`moveTo` in the render context for a row menu. Every move is announced in a polite live region, and a rejected `onReorder` leaves the order unchanged.
