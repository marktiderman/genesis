---
"@marktiderman/genesis-ui": minor
---

Board mode: a move that meets someone else's change opens `ConflictSheet`, showing their column beside yours. **Keep my version** sends the move again at the version their change left; **Take their version** (or closing the sheet) leaves the card where their row puts it. A screen with `onMoveError` still gets the conflict itself, and the sheet doesn't open. The board's columns scroll inside a strip, and a fade at either edge shows when there are more columns that way.

Features: resource-view-board
