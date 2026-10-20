---
"@marktiderman/genesis-studio": minor
"@marktiderman/genesis-ui": minor
---

**The Data Studio looks and works like Airtable.**

- **studio:** tables are tabs across the top, and Grid, Board and Calendar are views on the left, alongside saved views. The spreadsheet grid is the default view:
  - The field that names a row comes first.
  - Each column header has an icon for its type.
  - Choices show as colored pills (status words in their meaning's color), links as chips, and yes/no as checks.
  - Each row has a number, a checkbox for bulk actions, and an open button.
  - An **Add a record** row sits under the grid, and the footer shows the record count.
  - **Hide fields** is remembered per table.
  - The session's edits fold into one line under the workspace.
  - The default page size is now 50.
  - The old Table view (`?view=sheet` still opens the grid) is replaced by the grid.
- **ui:** `SheetGrid` gains, all opt-in: a column `icon` and `align`, a pinned `rowHeader` column, a `footer` row, and an `empty` message. The active cell is outlined only while the grid has focus.
