---
"@marktiderman/genesis-ui-native": patch
"@marktiderman/genesis-core": minor
---

`NativeRecordView` settings send only the fields the person edited, as the web `RecordView` does. The other fields follow the live row, so a stale draft can't overwrite someone else's change, and an edit back to the stored value isn't a change. Both compare through genesis-core's new `sameFormValue` (2 and "2", and null, undefined and "", are the same).
