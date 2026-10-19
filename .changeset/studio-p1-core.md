---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
---

**Data Studio P1 contract** (docs/DATA-STUDIO.md P1). Additive; a **minor**.

- **genesis-core:**
  - `ResourceSchema` gains `labelField`, `relations` (`ResourceRelation`: `one`, `many`, or `through` a junction) and `createFields`.
  - `ResourceAccess` gains optional `create`, `delete` and `history`, each with a reason in `reasons`.
  - `ProviderCapabilities` gains optional `multiSort`, `create`, `delete` and `history`.
  - `ListParams.sorts` sorts by several fields.
  - `DeleteParams.expectedVersion` version-checks deletes.
  - `CreateResult` and `DeleteResult` carry an optional `audit`.
  - New optional `DataProvider.history(resource, { id, limit })`.
- **genesis-ui:**
  - `ResourcePage` gains `capabilities` (`{ search?, sort? }`): a control the data source can't serve is hidden, not left to error (decision 9).
  - `DataFilters` gains `showSearch` and `showSort`.
  - `ResourceColumnDef.editable` and `accessor` now reach `DataTable` in client-side mode too.
