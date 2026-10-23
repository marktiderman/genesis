---
"@marktiderman/genesis-core": minor
---

Cursor (keyset) paging:

- **Contract.** `PaginationParam.cursor` is now `string | null`: `null` asks for the first page by cursor. `ListResult` gains `nextCursor?: string | null`, and `ProviderCapabilities` gains `cursorPagination`.
- **Supabase provider.**
  - Pages by keyset: the sort column, then the `orderKey` to break ties. The cursor is opaque base64 JSON.
  - Handles ascending and descending sorts and null sort values, and counts only the first page.
  - Refuses with a clear `invalid` error when there is no key, when sorting on an embedded field, when a cursor was made for another sort, and when the select leaves out the sort or key column.
  - Offset paging is unchanged.
- **`useInfiniteResource(resource, options)`.** Built on TanStack `useInfiniteQuery`. Returns `rows`, `total`, `fetchNextPage`, `hasNextPage`, `setSort`, `setFilters` and `setSearch`. It falls back to offset pages for providers without cursor paging.
- **Pending writes.** Optimistic and undoable writes are now also patched into every loaded page of `[resource, "infinite", …]` queries, and they survive refetches.
