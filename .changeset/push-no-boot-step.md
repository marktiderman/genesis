---
"@marktiderman/genesis-native": minor
---

The push block no longer reads the notification permission behind the splash, so a slow notification service can't hold the boot. On iOS, expo-notifications' permission read waits for that service on Expo's one shared native queue, which can take 25–30 s on the first request after the phone starts. The session's Keychain read waited behind it, `genesis:session` timed out and the app opened on its fatal screen. `bootSteps` is now empty, and `PushRoot` reads the permission once the app is up. That read still holds Expo's queue while the service is slow, so an Expo call made in those seconds (signing in, which writes the session to the Keychain, or the image picker) waits for it, but the app no longer fails to open.

Overlapping permission reads now share one call: `PermissionStore.refresh()` returns the read already in flight instead of starting another, so `start()` and `setUser()` after the boot put one `getPermissionsAsync` on Expo's queue, not two. `refresh({ fresh: true })` starts a new read even while one is pending, and only the newest read (or the system prompt's answer) updates the state; the push block uses it when the app comes back to the front, so turning notifications on in Settings registers the device even if an older read was still pending.
