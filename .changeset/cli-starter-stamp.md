---
"@marktiderman/genesis-cli": patch
---

`genesis init --template native` gives the new app the starter's build stamping: its scripts run `genesis build-stamp` before bundling, typechecking and testing, EAS builds stamp and check it (`eas-build-post-install`, with `GENESIS_CHANNEL` in each eas.json profile), every release lane stamps before `eas update`, and `build-metadata.json` is git-ignored. The starter's own stamp is no longer packed or copied.
