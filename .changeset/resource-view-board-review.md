---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-studio": patch
---

Board mode, from its review:

- A move narrows by the screen's own `can` as well as the view's guard, and the screen's `resourceOptions` (`invalidates`, `onError`, `onUpdateSuccess`) apply to it. A move stays pessimistic.
- A card either guard refuses has no handle or menu and can't be dragged (the new `KanbanBoard` `canMoveItem`), instead of being refused after the drop.
- While a card's move is saving the card is dimmed and a second move of it is turned away, so it is never sent from the column it is leaving.
- A yes/no board filters its columns by `true` and `false`, not the strings (`useBoardColumns` `toValue`).
- A row that shows on two loaded pages of a column is drawn once (`useBoardColumns` `getKey`). Studio's board passes it too.
- A bad screen `board={…}` override warns in development and shows the view's own block, instead of throwing.

Features: resource-view-board
