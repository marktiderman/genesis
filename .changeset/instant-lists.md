---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-native": minor
---

Lists and records open at once from the device, then refresh. Features: data-offline.

- **genesis-core, new `/offline` entry:** the `LocalCache` contract with `memoryLocalCache` and `indexedDbLocalCache` (the web, plain IndexedDB), and `persistOffline({ cache, resources, buster, maxAge? })`.
  - It keeps the listed resources' reads, each record stored once.
  - It saves only reads a fetch returned, never an optimistic change.
  - It restores them into the QueryClient marked with when they were fetched, so screens refetch, and never over a newer read.
  - Buckets are keyed to the person and workspace with `cacheScope(userId, workspace)`.
- **genesis-core, `GenesisProvider`:** new `persist` and `persistScope` props. Saved reads are restored before the first render, which waits at most 400 ms, and new reads are saved as they arrive.
- **genesis-native, new `/offline` entry:** `sqliteLocalCache({ db })` on expo-sqlite, plus `persistOffline` and `cacheScope`, for `GenesisNativeApp`'s `persist`. Its genesis-core floor is 2.12.
- **Deprecated:** `persistQueries` and `createQueryPersistence` (`/persist`). Use `persistOffline` with `sqliteLocalCache` (docs/MIGRATION.md). They're removed in the next major.
- **TanStack Query:** the workspace resolves one `@tanstack/query-core`, and `check:single-query-core` (in `lint:genesis`) keeps it that way.
