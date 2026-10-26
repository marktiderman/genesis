---
"@marktiderman/genesis-core": patch
---

Sourced resources: `writeColumns` (and, without it, updates that send only the table row's columns) so a view's read-only columns never reach the table; keyless views list again; docs say a source view must be `security_invoker` and a function `security invoker`, or the read bypasses RLS.
