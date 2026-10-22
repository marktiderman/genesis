---
"@marktiderman/genesis-core": patch
---

Release #92 review fixes (round 3):

- Undoable writes check `undo` through the same provider-scoped capabilities cache as `useCapabilities` (`capabilitiesQueryKey`), so a swapped-out provider's answer never offers undo.
- Supabase `getList`'s retry for a view without `id` only fires for that resource's own key column (`column "id" does not exist` or `column <table>.id does not exist`), not a related table's `id` or another column, so a real error is no longer read as an id-less view.
