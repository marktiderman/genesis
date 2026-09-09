---
"@marktiderman/genesis-ui": patch
---

`ResourcePage` requires `total` as well as `perPage` when `onPageChange` is supplied.

`total` omitted was the second door into the room `perPage` omitted opened.
`displayTotal` falls back to `0`, so the range span read "No records" and
`Next` stayed disabled while `page.data` rendered rows directly below it. A
surface that says "no records" above visible records is a lie, not a degraded
view.

The pager now refuses to render when either prop is missing. It shows a
`role="alert"` message naming the missing prop or props
(`data-testid="resource-page-pagination-error"`) and logs once per mount. Rows
still render. Nothing that already passes both props changes.
