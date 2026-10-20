---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
---

**Data Studio P3 contract, and a movable KanbanBoard.** Additive; a **minor**.

- **genesis-core:**
  - New optional `DataProvider` methods: `runAction` (a row action at the row's version), `comments` and `addComment`.
  - New types `RowAction` and `RecordComment`. `ResourceSchema.actions` lists the row actions the user may run. `ResourceAccess` gains `comment` and `reasons.comment`. `ProviderCapabilities` gains `actions` and `comments`.
  - `FieldSchema.label`: what a person calls the field.
  - `AuditEntry.action` may now be `"run"`, with `rowAction` naming the action. Code that switches on `action` exhaustively should add the case.
- **genesis-ui:** `KanbanBoard` gains, all opt-in:
  - `getKey`, for stable card keys.
  - `onMoveItem`: cards drag between columns, and each card gets a **Move to** menu that does the same from the keyboard.
  - `getItemLabel`, which names the card in that menu.
  - `KanbanColumn.total` (the badge shows it when a column is paged) and `renderColumnFooter` (e.g. **Load more**).
