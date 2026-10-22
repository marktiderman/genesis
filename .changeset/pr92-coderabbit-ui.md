---
"@marktiderman/genesis-ui": patch
---

Release #92 review fixes:

- `ResourcePage` (client table view): a header sort is the page's sort, so `urlState` writes it to `sort`, and a link's `sort` shows in the table header on load. `DataTable` takes an optional controlled `sort` / `onSortChange` (new `DataTableSort` type) for this.
- `useResourceUrlState` reads `page` only as a positive safe integer; a page of hundreds of digits (`Infinity`) is ignored.
- `DataTable`: when the open column is `editable` or has a `render`, the row's open button sits beside the cell content (shown when focused, still the row's one tab stop) instead of wrapping it, so a rendered link or input is never nested in a button. The open button handles only its own keys, so typing j/k/x/Home/End/arrows in a cell editor is never swallowed.
