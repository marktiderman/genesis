---
"@marktiderman/genesis-cli": minor
---

`withGenesis()`, an Expo config plugin: `plugins: ["@marktiderman/genesis-cli"]` (through the package's new `app.plugin.js`) or `import { withGenesis } from "@marktiderman/genesis-cli/expo"`. It suffixes ids and name per `APP_VARIANT` (development, preview, production) so the variants install side by side; sets `ios.associatedDomains` and an `autoVerify` Android intent filter from a new, validated `links` block in genesis.config.json; merges the iOS privacy manifest's UserDefaults reason (`CA92.1`) when async-storage or expo-secure-store is installed; and sets `usesNonExemptEncryption: false` and the fingerprint runtime policy unless the app already does. It reads only genesis.config.json, package.json and `APP_VARIANT`, so EAS fingerprints stay stable. `readGenesisConfig`, `validateLinks` and `GenesisConfigError` are exported; `DoctorConfigError` now extends `GenesisConfigError`, and `genesis doctor` rejects a malformed `links` block.

Features: expo-config-plugin
