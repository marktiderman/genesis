---
"@marktiderman/genesis-cli": minor
---

`withGenesis` writes a fuller iOS privacy manifest. Required-reason APIs now cover React Native (FileTimestamp C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1), Expo (expo-file-system's FileTimestamp 0A2A.1 and 3B52.1 and DiskSpace E174.1 and 85F4.1, expo-constants' UserDefaults CA92.1), expo-updates, expo-application and expo-notifications, each copied from the package's own PrivacyInfo.xcprivacy, beside async-storage. It sets `NSPrivacyTracking: false` and `NSPrivacyCollectedDataTypes` from the Genesis blocks the app uses (`PRIVACY_BLOCKS`: `account` from genesis-supabase, `observability` from genesis-native with Sentry, `push` from genesis-native with expo-notifications), unioned per type. An app picks the blocks, or lists everything it collects, in genesis.config.json `privacy` (`blocks`, `collects`, `tracking`) or the plugin's `privacy` option; a misspelt data type, purpose or block fails the config. The app's own manifest entries always win.

Features: expo-config-plugin
