---
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-native": minor
---

`withGenesis` writes a fuller iOS privacy manifest. Required-reason APIs now cover React Native (FileTimestamp C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1), Expo (expo-file-system's FileTimestamp 0A2A.1 and 3B52.1 and DiskSpace E174.1 and 85F4.1, expo-constants' UserDefaults CA92.1), expo-updates, expo-application, expo-notifications and @sentry/react-native, each from the package's own PrivacyInfo.xcprivacy (Sentry's from its privacy-manifest guide), beside async-storage. It sets `NSPrivacyTracking: false` and `NSPrivacyCollectedDataTypes` from the Genesis blocks the app uses (`PRIVACY_BLOCKS`: `account` from genesis-supabase, `observability` from genesis-native with Sentry, `push` from genesis-native with expo-notifications), unioned per type. An app picks the blocks, or lists everything it collects (any of Apple's 35 types), in genesis.config.json `privacy` (`blocks`, `collects`, `tracking`) or the plugin's `privacy` option; a misspelt data type, purpose or block fails the config, as does a tracking setting that contradicts the app's own `NSPrivacyTracking`. Without either, the plugin warns that only Genesis blocks are declared. The app's own manifest entries always win.

genesis-native's observability block now also declares "other diagnostic data" (Sentry's device and OS details, breadcrumbs and sessions) and, with `events`, analytics as a purpose of the user id, matching what the privacy manifest declares.

Features: expo-config-plugin, observability
