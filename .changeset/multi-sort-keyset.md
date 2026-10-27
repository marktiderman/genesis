---
"@marktiderman/genesis-core": minor
---

Sort by several fields. `useInfiniteResource` takes `defaultSorts` and returns `setSorts`; it sends them as `ListParams.sorts`, with the first also as `sort` for providers that sort by one field. The Supabase provider now reports `multiSort` and orders by every sort column and then the key, in offset and cursor paging alike. Its keyset cursor holds every sort column's value and handles mixed directions and nulls one column at a time, the same way as before. A sort on the key ends the list and sets the key's order. One-column cursors keep their shape. The mock provider sorts by `sorts` too.

Features: supabase-provider, resource-page
