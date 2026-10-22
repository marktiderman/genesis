---
"@marktiderman/genesis-ui": patch
---

Release #92 review fixes (round 3):

- `DataTable` keeps the roving tab stop on a rendered row when the focused row scrolls out of a virtualized window, so Tab still reaches the table.
- `DataTable` ignores a sort on a column it doesn't have (no TanStack error on every render); `ResourcePage` passes only its table's columns as the header sort, while a sort on another field still orders the rows.
- `ResourcePage`: a failed unconfirmed `onDelete` falls back to the toast when `resourceOptions.onError` itself throws, instead of an unhandled rejection.
- `ResourcePage` with server-controlled `data`: a linked `?id=` that isn't on the current page is no longer shown as "Record not found".
- The `pagination="client"` truncation warning and `clientRowLimit` docs say to stay at or under the provider's `maxPerPage`.
