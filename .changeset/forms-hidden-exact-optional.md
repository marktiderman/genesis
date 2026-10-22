---
"@marktiderman/genesis-forms": patch
---

`f.hidden.string/number/boolean` now type `sensitive` as `sensitive?: true`, not `sensitive?: true | undefined`, so their specs type-check in `defineForm({ hidden })` under `exactOptionalPropertyTypes`. The build also compiles a consumer file against the published types with that flag on.
