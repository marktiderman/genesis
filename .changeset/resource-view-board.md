---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-studio": patch
---

Board mode for lists: `<ResourceView view={tasksView} mode="board" />` shows a view's rows as cards in a column per value of one field, and moving a card writes that field.

- **genesis-core:** a view's `board` block (`ViewBoard`): `field` (an enum or a yes/no field), `columns` (which values, in order; default the field's choices, then "No value" when it can be empty), `cardFields` and `limits` (work-in-progress limits by value). `defineView` checks every name and value; `boardProblems` and `boardChoices` check a screen's overrides the same way. `view.column(name)` resolves one field as a column preset would, for a card's fields.
- **genesis-ui:** `mode="board"` on ResourceView, drawn by the new `ResourceBoard` (`board={…}` overrides the view's block and adds `onSelect`, `renderCard`, `onMoveError`, `perPage`). Each column is one paged `getList` under core's list keys, inside the viewer's scope and the screen's filters. A move is the resource's own `update(id, { [field]: value })`, so the provider's write rules apply and a versioned resource's check refuses a stale move; a refused move leaves the card where it was and says why. `useBoardColumns` is the loader on its own, for boards over rows that aren't one view's. `KanbanColumn.limit` shows a column's count against its limit ("4 / 3") and says when it's over. The `lists-use-resource-view` doctor rule also accepts a KanbanBoard fed by `useBoardColumns`, and `genesis catalog` points a board at `mode="board"`.
- **genesis-studio:** the board loads through `useBoardColumns`, the same loader ResourceView's board uses. No change in what it shows.

Features: resource-view-board
