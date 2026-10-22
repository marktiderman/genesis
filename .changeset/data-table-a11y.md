---
"@marktiderman/genesis-ui": minor
---

DataTable works by keyboard and screen reader:

- A sortable header is a real button (Tab, then Enter or Space; Shift adds a secondary sort), and its cell carries `aria-sort`.
- With `onRowClick`, rows are tab stops: Enter or Space opens one, ↑/↓ (or j/k) and Home/End move between rows, and x toggles selection when `selectable`. Keys typed into a control inside a row stay there.
- New `keyboardNavigation` prop (default true) turns the row keys off.

ResourcePage passes its `keyboardNavigation` through, so table view is keyboard-navigable too.
