---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-supabase": minor
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
---

Versioned writes: two people editing the same record no longer silently overwrite each other. The second save, made on the copy read before the first, comes back as a `conflict`. Features: data-offline.

- **genesis-core, Supabase provider:** a resource's `version: { field, kind: "integer" | "timestamp" }` rule checks every update and delete against `expectedVersion` (`where id = … and version = …`).
  - When no row matches, the row is read back. At another version it's `conflict`, with `error.current` and `error.currentVersion`; at the same version it's `forbidden`; when it isn't visible it's `gone`.
  - The submitted version is never written.
  - `capabilities(resource)` reports `versionedWrites: true` and the new `version` (`VersionField`).
  - An `update` override gets `{ expectedVersion }` as a third argument when a version is checked; overrides called without one are unchanged.
  - Recycle-bin tables check the version before the delete.
- **genesis-core, hooks:**
  - `useResource` and `useResourceForm` send the version of the row the change was made on, through `SendContext.expectedVersion`: an edit form's opened record (`ExecuteWriteArgs.base`), else the row cached when the write was made. A write made behind another on the same record is checked against the version that one committed at.
  - After a save they put the new version into every cached copy, so a second edit is checked against it.
  - A resource without the rule, a row that wasn't read first, or a provider without capabilities is sent unchecked, as before. A versioned resource whose rows don't carry the version column is reported once through `reportError`.
  - A timestamp version is compared as an instant (to the microsecond), and a conflict's `error.current` is read through the resource's `source` and `select`.
- **genesis-ui, genesis-ui-native:** `RecordView`'s settings sections send the version of the row they show.
- **genesis-supabase:** migration `0019_genesis_version_bump.sql` (with a pgTAP test), the `versioned-writes` block and `versionedWritesBlock`. `genesis_version_bump('col')` advances the column by one on every update, whatever the update wrote, and refuses a column that isn't an integer.
