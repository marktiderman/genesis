---
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-native": minor
"@marktiderman/genesis-support": minor
---

`genesis build-stamp` writes `build-metadata.json` (version, git commit and branch, build time, channel) for the app to pass as `buildMetadata`. `BuildMetadata` gains `version`, `channel` and `builtAt`: the version signature (and so the devtools overlay) names when and for which channel it was built, and `nativeSections` puts `builtAt` (and the stamped version and channel when the binary gives none) in the dump's `build`.
