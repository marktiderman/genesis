---
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
---

`RecordView`'s and `NativeRecordView`'s settings sections save through the resource's write path (`useResource`'s `update` with `{ expectedVersion }`) rather than calling the provider directly. The version a save starts from is unchanged: the row the edit started on, and after a save, the version that save left. What changes is that the version a save commits now goes into every cached copy of the row, and a save sent while another of the same record is in flight is checked against the version that one commits. So a board move or list edit of the record right after a settings save is no longer refused as a conflict with that save.

Features: data-offline
