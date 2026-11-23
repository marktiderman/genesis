---
"@marktiderman/genesis-native": patch
---

The push block no longer reads the notification permission behind the splash, so a slow notification service can't hold the boot. On iOS, expo-notifications' permission read waits for that service on Expo's one shared native queue, which can take 25–30 s on the first request after the phone starts. The session's Keychain read waited behind it, `genesis:session` timed out and the app opened on its fatal screen. `bootSteps` is now empty, and `PushRoot` reads the permission once the app is up.
