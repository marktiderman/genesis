---
"@marktiderman/genesis-ui": minor
---

`useResourceTable(options)` is ResourcePage's behaviour without its markup:

- rows from a `resource` or `data`;
- search, sort, status filter and paging, including server paging;
- selection;
- the open record, with its URL state and linked-record fetch;
- the built-in form and confirmed delete;
- the row and keyboard handlers.

It takes the same options as `ResourcePage` and is exported from `/data` and `/hooks` with its return type, `ResourceTableState`. `ResourcePage` is now this hook plus Genesis's markup, with no behaviour change. This is phase 4 of the data-layer plan.
