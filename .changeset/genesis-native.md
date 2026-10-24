---
"@marktiderman/genesis-native": patch
"@marktiderman/genesis": minor
---

New package, `@marktiderman/genesis-native`: `<GenesisNativeApp>`, one root above an Expo app's screens. It runs ordered, run-once boot steps behind the splash (with a per-step timeout and a minimum), shows a fatal screen with "Try again" for a failed boot, a render error or a fatal global error (`onError` for reporting), keeps a TanStack Query client that works offline and saves chosen query-key roots to async storage (24-hour max age, app-version buster, cleared on sign-out), gates on the Supabase session (`useSession`) and releases a held deep link once signed in. `boot`, `fatal`, `errorBoundary`, `signedOut` and `updateBanner` are slots, and each part is exported on its own, with `normalizeLink` for expo-router's `+native-intent` and `createHydrationGate` for persisted stores. The umbrella re-exports it as `@marktiderman/genesis/native-app`.

Features: native-app-shell
