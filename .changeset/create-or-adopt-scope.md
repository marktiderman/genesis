---
"@marktiderman/genesis-core": minor
---

`createOrAdopt` takes `scope`: extra filters on the adopt lookup for a partial unique index (e.g. `deleted_at is null`, `kind = 'worksheet'`), so the row adopted is the one the index actually covers.
