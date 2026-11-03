---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-studio": minor
---

A save that meets someone else's change now asks the person instead of only showing an error: their value beside yours, then "Keep mine" or "Take theirs". Features: data-offline.

- **genesis-core:**
  - `writeConflict(error, mine)` turns a `conflict` `DataWriteError` into a `WriteConflict`: `theirs`, `mine`, the `fields` that differ, and `currentVersion`.
  - `WriteState` (`pending`, `sending`, `paused`, `failed`, `conflict`) is the one shape for where a write stands.
  - `useResourceForm` returns `conflict`, `keepMine()` (the same values again, at the version the conflict reported), `takeTheirs()` and `dismissConflict()`.
  - `ExecuteWriteArgs.expectedVersion` names the version a write is checked against.
- **genesis-ui:** `ConflictSheet`, from `/data`. `ResourceForm` and `RecordView`'s settings sections open it on a conflict. New `conflict` messages.
- **genesis-ui-native:** `NativeConflictSheet`, from `/data`. `NativeRecordView`'s settings sections open it on a conflict.
- **genesis-studio:** the record panel's edit conflict opens `ConflictSheet` (theirs beside yours) instead of replacing what was typed. Needs genesis-core 2.10.
