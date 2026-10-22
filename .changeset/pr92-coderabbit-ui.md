---
"@marktiderman/genesis-ui": patch
---

Release #92 review fixes:

- `ResourcePage` (client table view): a header sort is the page's sort, so `urlState` writes it to `sort`, and a link's `sort` shows in the table header on load. `DataTable` takes an optional controlled `sort` / `onSortChange` (new `DataTableSort` type) for this.
- `useResourceUrlState` reads `page` only as a positive safe integer; a page of hundreds of digits (`Infinity`) is ignored.
