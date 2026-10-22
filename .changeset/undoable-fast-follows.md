---
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-ui": patch
---

**Undoable / optimistic writes: review fixes from #106.** Only the opt-in `optimistic` / `undoable` paths change; `pessimistic` is untouched.

- **Undo outlives the form.** Pending writes now belong to the `QueryClient`, not to the hook. A dialog that closes on success (or any unmount) no longer sends its waiting write at once, so its Undo toast still works; the write goes out when the delay ends.
- **Writes on one record compose.** They are sent in order, one after another. Undoing (or a failure of) an earlier edit takes only its own fields out of the cache, and a later pending edit that kept those values (a form opened from the patched cache) has them put back before it is sent, so undone values are never sent. A later edit that cannot be fixed (form-shaped values) is dropped and reported through `onError`. Sending a later write first sends the earlier ones still waiting.
- **Refetches keep the patch.** Pending patches are re-applied to any list or detail data that lands in the cache (a refetch, a new page, filter or search), so a deleted row no longer comes back during the undo window. Fetches in flight are no longer cancelled, and invalidation no longer waits for pending writes (a write that never settled used to block it).
- **Page unload.** Waiting writes are sent on `beforeunload` and `pagehide` with `keepalive: true` in their params (new optional `keepalive` on `CreateParams` / `UpdateParams` / `DeleteParams`, and `keepaliveWrites` in `ProviderCapabilities`). The "Leave site?" prompt shows only while a write is sent without that guarantee.
- **Late failures** reach the form (field errors, unsaved again) only while it is mounted, visible and still shows what it saved; otherwise only `onError`. New `useResourceForm` option `visible` (ResourceForm passes `open`).
- **Supabase errors:** a unique index on `lower(email::text)` maps to `email`; an unreadable unique key gets "This value is already in use." instead of the raw database text.
- **genesis-ui:** `showUndoToast` and `showWriteErrorToast` are exported from `/data`.
