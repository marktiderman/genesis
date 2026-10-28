---
"@marktiderman/genesis-ui-native": minor
---

NativeResourceView writes like the web ResourceView: form fields carry the contract's `nullable` and `hasDefault`, a create leaves an empty input of a known column out (so its default applies) and an edit clears it to null, while a text column that can't be null keeps `""`. Fields the contract says nothing about still send null. A `filter` value may be a list, sent as `in` and never saved by a create.
