---
"@marktiderman/genesis-ui": minor
---

DataTable runs on TanStack Table, and every existing prop keeps working:

- **Typed sorting:** numbers, dates and booleans sort by value. Before, everything sorted as text, so "100" came before "2". Ties keep the items' order.
- **Virtualization:** `virtualize` (or `{ height, estimateRowHeight }`) renders only the rows in view for an unpaged table (`pagination={false}`). Row keyboard movement scrolls the next row into view.
- **Pinning:** `pinnedColumns={{ left, right }}` keeps columns in view when scrolling sideways, and the selection and actions columns pin with them. `stickyFirstColumn` is now shorthand for pinning the first column left.
- **Reordering:** drag a header, or press Alt+←/→ on its sort button. `columnOrderKey` keeps the order per device, and the Columns menu's "Reset to defaults" restores it. `reorderableColumns={false}` turns it off.

`@tanstack/react-table` and `@tanstack/react-virtual` are now dependencies. `react-virtual` was an optional peer before.
