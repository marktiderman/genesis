---
"@marktiderman/genesis-ui": patch
---

- **KanbanBoard focus:** when a move saves but the caller keeps the card where it was, the board stops waiting to put focus back. A later move of that card by someone else can no longer pull focus to it.
- **Embedded ResourcePage:** sorting by a column header no longer brings up the filter row. Only a search or a status filter counts as filtering.
