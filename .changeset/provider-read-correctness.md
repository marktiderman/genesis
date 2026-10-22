---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
---

The Supabase provider's reads are stable and fail in plain words:

- **Stable paging:** a sorted list also orders by the key column (`id`), so rows with equal sort values keep one order and none repeats or is skipped between pages. `resources[name].orderKey` names another column; set it to `false` for a table or view without `id`.
- **Safe read errors:** `getList`, `getOne` and `getMany` throw a `DataReadError`, a new export. Its `outcome` is `unauthenticated`, `forbidden`, `gone`, `invalid` or `error`. Its `message` is a sentence users can see ("These tasks couldn't be loaded."). The store's raw error is its `cause`. A new `onReadError` option sees every failed read, for logging. `readOutcomeFromCode` maps store codes.
- **Page cap:** `maxPerPage` (default 1000) caps a page with a console warning, and `capabilities()` reports it. The provider now implements `capabilities()`: search, sort, the filter operators it serves, create and delete. It reports no bulk, versioned or multi-sort writes.

ResourcePage shows a `DataReadError`'s message in its error panel when `errorMessage` isn't set.

Behaviour change: a sorted `getList` adds `.order("id")`. A resource without an `id` column needs `orderKey: false`. Read errors used to be thrown as plain `Error`s carrying the raw message.
