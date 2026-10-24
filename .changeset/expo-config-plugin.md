---
"@marktiderman/genesis-cli": minor
---

`withGenesis()`, an Expo config plugin: `plugins: ["@marktiderman/genesis-cli"]` (through the package's new `app.plugin.js`) or `import { withGenesis } from "@marktiderman/genesis-cli/expo"`. It suffixes ids and name per `APP_VARIANT` (development, preview, production) so the variants install side by side; sets `ios.associatedDomains` (`applinks:`, and `webcredentials:` unless `links.webcredentials` is `false`) and an `autoVerify` Android intent filter from a new, validated `links` block in genesis.config.json; declares the FileTimestamp reason `C617.1` in the iOS privacy manifest when `@react-native-async-storage/async-storage` is installed, as that package's own manifest does; and sets `usesNonExemptEncryption: false` and the fingerprint runtime policy unless the app already does. Running it twice changes nothing. It reads only genesis.config.json, package.json and `APP_VARIANT`; set `APP_VARIANT` as an EAS environment variable so `eas update` and fingerprint checks see the same value as builds (the README explains, and lists the per-variant web association entries).

`readGenesisConfig`, `validateLinks` and `GenesisConfigError` are exported, and `DoctorConfigError` now extends `GenesisConfigError`. `genesis doctor` reads genesis.config.json through the same loader, so it now exits 2 with a message on a malformed `links` block, and on a genesis.config.json that is valid JSON but not an object (an array, a string): that used to fall back to the default settings in silence, and now fails on purpose, because a config the doctor can't read should not pass as "no config".

Features: expo-config-plugin
