---
"@marktiderman/genesis-cli": patch
---

`genesis upgrade` no longer refuses the lock `genesis init --template native` writes: the app-folder substitution init records (`REPLACE_WITH_APP_FOLDER` → `src`) is allowed, with a plain relative path (no `..`, not absolute), and applied to every file the upgrade refreshes or adds, as init does.
