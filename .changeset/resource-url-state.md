---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-core": minor
---

A list's state can live in the URL:

- `useResourceUrlState({ searchParams, params? })` reads and writes the open record (`id`), page, sort (`field:asc`) and search (`q`) through any `SearchParamsAdapter`: the browser's, React Router's or TanStack Router's. Opening a record adds a history entry, so Back closes it. Page, sort and search replace the entry, and default values leave the URL.
- `ResourcePage` takes `urlState` (an adapter, or `{ searchParams, params }` to rename keys):
  - A copied link reopens the same record with the same search and sort.
  - With `pagination="server"` it also restores the page.
  - A server-controlled page owns its own page, sort and search, so it uses the hook directly.
- genesis-core: `useResource` gains `defaultPage` and `defaultSearch` for starting where a restored URL says.
