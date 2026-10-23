---
"@marktiderman/genesis-studio-server": minor
---

`@marktiderman/genesis-core` is now a peer dependency (it was a dependency at `^1.3.0`), as it is
for `genesis-studio`: an app's lockfile can no longer keep an older core nested under
studio-server while the app runs a newer one. Apps already depend on genesis-core; one at
`^1.6.0` satisfies this release.
