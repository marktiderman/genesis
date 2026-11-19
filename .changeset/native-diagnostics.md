---
"@marktiderman/genesis-native": minor
---

- `versionSignature({ buildMetadata })` and `createUpdates({ buildMetadata })`: the commit, OTA number and release the app stamps into its bundle at publish time. The signature carries `commit`, `otaNumber` and `release` (null without it; optional on the type, so signatures made by hand still type-check), and its text names them. The one-line `short` is unchanged. `BuildMetadata` is exported from `/updates`.
- The devtools overlay has a `devtoolsDiagnostics` slot beside "Copy debug info" (`{ debugInfo, close, copy }`), which genesis-support fills with "Send diagnostics" when `createSupport` is given `diagnostics`.
