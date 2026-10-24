---
"@marktiderman/genesis-studio-server": minor
"@marktiderman/genesis-cli": minor
---

`@marktiderman/genesis-core` is now a peer dependency at `^1.6.0` (studio-server had it as a
dependency at `^1.3.0`), as it is for `genesis-studio`: an app's lockfile can no longer keep an
older core nested under studio-server while the app runs a newer one. `genesis-cli` loads
studio-server, so it declares the same peer. Apps already depend on genesis-core; any `^1.6.0`
release satisfies both.
