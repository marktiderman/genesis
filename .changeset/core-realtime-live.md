---
"@marktiderman/genesis-core": minor
---

Live updates (realtime):

- **`DataProvider.subscribe?(resource, params, callback)`** returns an unsubscribe function. The callback gets `{ type: "created" | "updated" | "deleted", id? }`, or `{ type: "changed" }` when changes may have been missed. New types: `ResourceChangeEvent` and `SubscribeParams`. `ProviderCapabilities.realtime` reports which resources it serves.
- **The Supabase provider** serves it through Supabase Realtime `postgres_changes`. It is opt-in per resource (`resources[name].realtime: true`) or for several at once (the `realtime` option: `true`, a list, or a test). It opens one channel per subscription and removes it on unsubscribe. Events carry only the row's id. The minimal client shape gains an optional `channel()` and `removeChannel()`, and supabase-js is still not a dependency.
- **`useResource({ live: true })` and `useOne(resource, id, { live: true })`** subscribe while mounted and refetch the resource's cached reads on events, once per burst (`live: { debounceMs }`, default 250). Payloads are never written to the cache, and pending optimistic and undoable writes stay applied over the refetch. While the tab is hidden, reads are only marked stale.

The README covers setup: the `supabase_realtime` publication, RLS, what delete events reveal, and cost.
