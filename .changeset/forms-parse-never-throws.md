---
"@marktiderman/genesis-forms": patch
---

`parseForm` no longer throws when an invalid value (an object whose `toString` is not a function) appears in an error message; it reports the issue instead.
