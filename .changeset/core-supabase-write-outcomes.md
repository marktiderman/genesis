---
"@marktiderman/genesis-core": minor
---

**`createSupabaseProvider` is safe to use directly under Supabase RLS.** Additive; a **minor**.

- **Zero rows is a typed failure.** `update` and `deleteOne` now ask for the affected rows instead of ending in `.single()`. When RLS skips the row, the provider reads it back and throws `DataWriteError("forbidden")` (still visible) or `DataWriteError("gone")` (no longer visible), instead of PostgREST's cryptic `PGRST116` error.
- **Write errors are typed.** Every create/update/delete error is a `DataWriteError` whose outcome comes from its Postgres/PostgREST code (`42501` forbidden; `22***`/`23***` such as `23505`, `23503` invalid; `PGRST301`–`303` unauthenticated; `PGRST116` gone; else error). The code stays on `error.code` and the raw error is the `cause`. New helpers: `writeOutcomeFromCode`, `toDataWriteError`. Reads are unchanged.
- **Recycle-bin tables:** `createSupabaseProvider(client, { binTables })` (or per-resource `deleteMode: "bin"`). A delete succeeds when the row leaves the caller's view and is `forbidden` when it is still visible.
- **Per-resource rules** (`resources: { [name]: … }`): `prepare(values, context)` before every write, `create` and `update` overrides (e.g. RPCs; an `update` that returns nothing is read back and reported as `forbidden`/`gone`, never as saved), `toFormValues(row)`, `invalidates`, and `noun` for messages.
- **Write events and invalidation:** `onWrite(event)` after every committed write (its failure never fails the write). New optional `DataProvider.invalidates(event)` and `DataProvider.toFormValues(resource, row)`: `useResource` and `useResourceForm` invalidate the provider's related keys after their writes, and `useResourceForm` starts edit forms from `toFormValues`. Both hooks also take an `invalidates` option.
- `GenesisProvider` takes an optional `queryClient`, so an app can share its existing cache; documented alongside `DataProviderRoot`.
- `DataWriteError` gains an optional `code`, and `DataWriteErrorOptions` gains `code` and `cause`.
- New `packages/core/README.md`.

Behavior note: a zero-row update or delete through `createSupabaseProvider` already threw; it now throws a `DataWriteError` (still an `Error`) with a clear outcome and message.
