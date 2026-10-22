---
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-ui": patch
---

- Supabase provider: a per-resource `searchFields` sets the columns a search covers. `[]` makes `capabilities(resource).search` false, so a UI hides the search box.
- ResourcePage: a caller's unconfirmed `onDelete` that rejects is reported to `resourceOptions.onError` or shown as a toast, instead of becoming an unhandled rejection.
