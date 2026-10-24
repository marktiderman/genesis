---
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-features": patch
---

One Genesis config per app. `genesis features` reads its settings from the `features` block of `genesis.config.json`, beside `doctor`, so an app keeps its Genesis settings in one file. package.json's `"genesisFeatures"` still works; when both exist, `genesis.config.json` wins, and the command line wins over both.

Features: feature-registry, cli-doctor
