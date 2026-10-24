---
"@marktiderman/genesis": minor
"@marktiderman/genesis-cli": minor
---

One Genesis version per app. `@marktiderman/genesis` writes `dist/versions.json` with the exact version of every public Genesis package in its release, exported as `@marktiderman/genesis/versions.json`, and re-exports the features registry as `@marktiderman/genesis/features`. `genesis doctor` gains `version-skew`: in an app with the umbrella installed, it warns for each installed Genesis package on a different version than the release lists (raise it to an error with `rules`).

Features: umbrella, cli-doctor
