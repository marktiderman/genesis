---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
---

A sort can say where empty values go: `nulls: "first" | "last"` on `SortParam`, a view's `orderBy`, a link's `orderBy` and each of `slotProps.filters.sortOptions`. The Supabase provider passes it to both offset and cursor paging, and a cursor made for another placement is refused. Unset, nothing changes.

`useResource`'s `update` now fails when the provider returns no row (`DataWriteError` with outcome `forbidden`), in every mutation mode, before the write counts as committed. The Supabase provider already threw; this reaches a custom provider that returned `{ data: null }`. ResourceView's board no longer checks this itself.

A failed board move is no longer logged to the console as well as shown on the board, and a conflict the board's sheet shows no longer reaches the screen's `resourceOptions.onError`.

`usePersistedUiState`'s follow-ups: `createLocalStorageAdapter` warns once per key and operation rather than on every render, DataTable's column move writes to the current key when `columnOrderKey` changes, and AppShell's Reset clears its stored options.
