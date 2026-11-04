---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": patch
---

`usePersistedUiState(key, initial, { parse, serialize })` (`@marktiderman/genesis-core/hooks`) keeps a piece of UI state in the app's storage adapter: SSR-safe with no hydration flash, in step across every hook on the key and across tabs, never writing the default, and keeping a value storage refused while mounted. A `null` key is plain state. genesis-ui's AppShell (collapsed sidebar, options), PageHeader (options), DataTable (column visibility, order, widths), InboxLayout (context panel), `useSavedViews` and `useViewPreference` now use it, each under its existing storage key, so saved choices carry over; they also follow the storage adapter `GenesisProvider` is given instead of reading localStorage directly.
