---
"@marktiderman/genesis-cli": patch
---

`genesis upstream check` and `export` also read a register at the app's root (`genesis-upstream.md`) when `docs/genesis-upstream.md` isn't there, and a `local` cell may list several paths, separated by commas or `<br>`. Each path is checked; a promoted entry names every copy still to delete.
