---
"@marktiderman/genesis-core": patch
---

Supabase provider follow-ups to #96:

- An unsorted page is ordered by the key column, so pages come back in a stable order.
- New per-resource `nounPlural` for list messages ("categories", not "categorys").
- `readFailureMessage` takes an optional plural.
