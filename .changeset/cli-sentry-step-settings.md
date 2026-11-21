---
"@marktiderman/genesis-cli": minor
---

Setup: the `sentry` step saves the organization and the DSN as the settings `observability.sentryOrg` and `observability.sentryDsn` (genesis-native declares them) in one write of genesis.config.json, which installed apps read from their next build or update (a change on the in-app Settings screen applies with none). A step may now save several settings in that one write. `settings_propose` checks a value against the key's whole declaration, its `pattern` and whole-number rule included.
