---
"@marktiderman/genesis-cli": patch
---

`genesis introspect` now follows the app's `doctor.contracts` settings (`out`, `schemas`, `databaseEnv`) when no flag is given, so it rewrites the contract the doctor checks instead of writing `resources.genesis.ts` into the current folder. Flags still win; a `--config` option names another config file.
