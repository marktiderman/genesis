---
"@marktiderman/genesis-cli": patch
---

`genesis doctor`'s `release-lane-live` no longer reports "nothing starts a release" when the repository's own GitHub workflow (not `native-release.yml`) starts the release on a push to main. It is read as GitHub's trigger: quiet on `release.trigger: "github"`, the drift warning on `"eas"`.
