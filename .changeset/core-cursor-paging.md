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
- **Load more de-duplicates rows.** `useInfiniteResource` shows a row once if it moved into a later page.
- **Look-ahead row fits under max-rows.** A cursor page is at most `maxPerPage - 1` rows, so PostgREST's `max-rows` never drops the extra row that tells whether a next page exists.
- **Search with reserved characters.** Search terms are quoted, so commas, dots and parens in a search work, including inside the keyset filter.
- **`useOne({ live })` sees deletes.** The Supabase channel for one record is no longer filtered on the server, where Realtime would drop DELETE events; the id is matched on arrival instead.
- **Pending writes.** Optimistic and undoable writes are now also patched into every loaded page of `[resource, "infinite", …]` queries, and they survive refetches.
