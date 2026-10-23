---
"@marktiderman/genesis-ui": minor
---

`ResourcePage` takes `pagination="cursor"` in `resource` mode. It loads `resourceOptions.defaultPerPage` rows (or the stored page size), and a "Load more" button appends the next page. It pages by cursor where the provider serves it and by offset otherwise. `useResourceTable` returns the same thing as `loadMore: { hasMore, loading, load }`. Offset paging stays the default.
