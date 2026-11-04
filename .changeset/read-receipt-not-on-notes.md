---
"@marktiderman/genesis-core": patch
---

`readReceiptFor` skips internal notes: the other side never sees one, so it can't have read it.
