---
"@marktiderman/genesis-ui": minor
---

List options, opt-in except the fix below.

- `ResourceViewDefaultsProvider sizeColumns`: each table column gets a width for what it shows (a badge 130px, a number 96px, a date 120px, other text 140px), the record's name column takes the spare width, and the table keeps room for every column, scrolling sideways below that. Unset, columns share the width as before.
- `DataTable minWidth`: the narrowest the table may be before it scrolls sideways. `"auto"` is each column's pixel width plus 200px for each column without one; a number is that many pixels.
- `ResourcePage compactWhenShort` (and `ResourceView`): an embedded list with ten rows or fewer and nothing filtering it drops its search and sort row, Columns bar and pager. Past ten rows, or while anything filters it, they come back.
- `pagerJumps` on `ResourcePage`, `DataTable` and `ResourceViewDefaultsProvider`: first and last page buttons, "Page n of m" in the table's own pager, and "Previous page" / "Next page" as the arrows' names; on a phone the page pager shows only the arrows. New messages: `page.first`, `page.last`, `page.previousPage`, `page.nextPage`.

Fix, on by default:

- A `DataTable` cell keeps what it draws inside its column (`overflow-hidden`; inline editors excepted). Under the table's fixed layout, a long value in a custom-rendered column (an email of 226px in a 122px column) was drawn over the next column's text. The ellipsis on one line stays `clipCells`.
