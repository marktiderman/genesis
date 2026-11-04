---
"@marktiderman/genesis-support": patch
---

`cleanRoute` drops the query and fragment with one search, so a route made of many `#` characters no longer takes quadratic time.
