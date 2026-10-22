---
"@marktiderman/genesis-core": patch
---

Release #92 review fixes:

- `useCapabilities` keys its cache by the provider as well as the resource, so swapping `GenesisProvider`'s `provider` (another tenant or store) asks the new provider instead of reusing the old one's answer.
- Supabase `onReadError` may be async: it is awaited and its rejection swallowed, then the original `DataReadError` is thrown, so a failing logger never leaves an unhandled rejection.
- Supabase `getList` refuses a `perPage` above `maxPerPage` with an `invalid` `DataReadError` (its `cause` names the cap) instead of silently serving a shorter page, which shifted later page boundaries and skipped or repeated rows.
