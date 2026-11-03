---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-studio": minor
---

A save that meets someone else's change now asks the person instead of only showing an error: their value beside yours, then "Keep mine" or "Take theirs". Features: data-offline.

- **genesis-core:**
  - `writeConflict(error, mine, { changed?, view? })` turns a `conflict` `DataWriteError` into a `WriteConflict`: `theirs`, `mine`, the `fields` this person changed that differ from theirs (a field their row doesn't carry counts as different), and `currentVersion`. Empty values, numbers and their text, dates and object key order compare as a person would.
  - `WriteState` (`pending`, `sending`, `paused`, `failed`, `conflict`) is the one shape for where a write stands.
  - `useResourceForm` returns `conflict`, `keepMine()`, `takeTheirs()` and `dismissConflict()`. What the person typed stays on the form until they save or take theirs, across an optimistic save's refetch too. Keep mine sends this person's changes at the version the conflict reported, with their values for every other field, and rejects with the reason if it fails for anything but a new conflict. After take theirs, the next save is checked against their version.
  - `ExecuteWriteArgs.expectedVersion` names the version a write is checked against.
- **genesis-ui:** `ConflictSheet`, from `/data`. `ResourceForm` (every layout, and after an optimistic save closed it, without a second toast) and `RecordView`'s settings sections open it on a conflict. It hides keep mine when there's no version to save at. New `conflict` messages.
- **genesis-ui-native:** `NativeConflictSheet`, from `/data`, announced as it opens. `NativeResourceForm` and `NativeRecordView`'s settings sections open it on a conflict; its words come from `messages.conflict`.
- **genesis-studio:** the record panel's edit conflict opens `ConflictSheet` (theirs beside yours) instead of replacing what was typed. Its genesis-core floor is now 2.11: upgrade genesis-core with genesis-studio.
