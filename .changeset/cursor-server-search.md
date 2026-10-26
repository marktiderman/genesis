---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
---

ResourcePage `pagination="cursor"` now searches, sorts and filters on the server, as `pagination="server"` already did. Before, the toolbar's search, the status filter and a header sort worked only on the rows already loaded, so a match on an unloaded page never showed.

- **What happens now:** each change restarts from the first page with the server's count, and search waits for a pause in typing.
- **Search box:** it shows only when the list has `searchFields`, since the server needs to know which columns to match.
- **`useResourceTable`'s `total`:** in cursor mode it's the server's count of matches.

Cursor lists sort on the server only. Column headers aren't client-sortable there, since a header sort would reorder just the loaded rows, in an order the next page disagrees with. A URL sort on a computed column is ignored. A new search, sort or filter keeps the loaded rows on screen until it lands (core: `useInfiniteResource({ keepPreviousData })`). A shared link starts from its search and sort in one request.
