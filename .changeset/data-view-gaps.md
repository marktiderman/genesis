---
"@marktiderman/genesis-ui": minor
---

Props for the parts apps hand-rolled around ResourcePage and DataTable:

- `DataTableColumn.width` takes a number (px), applied through a `<colgroup>` so the other columns share the rest. A px string (`"180px"`) does the same; other strings stay class names (`"12rem"` no longer becomes 12px). Long headers truncate, with the full text as their title.
- `DataGrid` `onItemClick` / `getItemLabel`: each card or list row becomes one keyboard-reachable button; clicks on controls inside it are left alone.
- `ResourcePage` `openOnCardClick` (custom cards open the detail) and `canEditItem` (no Edit/Delete for rows the user can't change). `ResourceColumnDef` passes `width`, `minWidth` and `defaultVisible` through to the table.
- `PageHeaderOptions.showTitle: false` keeps the actions row without the title block, for a list inside a tab.
- `AlertDialogAction` `variant="default"` for confirmations that aren't destructive; red stays the default.
