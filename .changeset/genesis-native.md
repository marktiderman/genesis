---
"@marktiderman/genesis-native": patch
"@marktiderman/genesis": minor
---

New package, `@marktiderman/genesis-native`: `<GenesisNativeApp>`, one root above an Expo app's screens. It runs ordered, run-once boot steps behind the splash (a per-step timeout, a retry that waits for a timed-out run, a minimum). It shows a fatal screen with "Try again" for a failed boot, a render error or a fatal global error, with a last-resort screen above every provider. Unhandled promise rejections on Hermes and every caught error reach `onError`. It keeps a TanStack Query client that works offline, and reads the Supabase session without hanging offline (it falls back to the stored session). It releases a deep link held across a sign-in. With `@marktiderman/genesis-native/persist` it saves chosen query-key roots to async storage, scoped to the signed-in user, with a 24-hour max age and an app-version buster, and clears them whenever the user changes. `boot`, `fatal`, `errorBoundary`, `signedOut` and `updateBanner` are slots. Each part is also exported on its own, with `normalizeLink` for expo-router's `+native-intent` and `createHydrationGate` for persisted stores. The umbrella re-exports it as `@marktiderman/genesis/native-app` and `/native-app/persist`.

Features: native-app-shell
