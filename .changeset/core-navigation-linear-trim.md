---
"@marktiderman/genesis-core": patch
---

`isPathActive`'s path normalising trims trailing slashes in one linear pass instead of a regex that could slow down on a path of many slashes. Same results.
