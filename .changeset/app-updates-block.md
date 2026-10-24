---
"@marktiderman/genesis-native": minor
"@marktiderman/genesis-supabase": minor
---

The updates block, `@marktiderman/genesis-native/updates`: `createUpdates({ platform, application, updates, policy, storage, appState, openURL })` and `<GenesisNativeApp updates={updates}>` (leave the prop out to turn it off).

- **Force upgrade**: a minimum store version per platform, compared with `expo-application`'s installed version, shows a blocking screen with a store link and "Check again".
- **Maintenance**: a live maintenance flag shows a blocking screen with "Try again".
- **Update banner**: expo-updates is checked on launch and on coming to the front; a downloaded update for this runtime version shows a banner that reloads only on tap, and never while `useBlockReload(true)` is mounted or `canReload()` says no.
- **What's new**: release notes once per version, remembered in storage; never on a fresh install.
- **Version signature** (`useVersionSignature`) for an About row and support reports, and **channel switching** for test builds, off unless `channels: { enabled: true }`.
- **Policy sources**: `staticPolicySource` and `supabasePolicySource`, cached on the phone. It fails open: no answer, a timeout (3 s behind the splash), a malformed version, a cache older than 7 days or dated in the future never blocks, and a cached maintenance flag never blocks a cold start.

Each renderer is a slot of `GenesisNativeApp` (`forceUpgrade`, `maintenance`, `updateBanner`, `whatsNew`), a primitive (`ForceUpgradeScreen`, `MaintenanceScreen`, `UpdateBanner`, `WhatsNewSheet`) and a hook. The `updateBanner` slot now receives `{ reload, dismiss, canReload, blocked, reloading }` and renders only with the `updates` prop (it was a placeholder that rendered nothing by default). `expo-updates` and `expo-application` are passed in, never imported; `react-native-safe-area-context` is a new optional peer, for the banner.

`@marktiderman/genesis-supabase` ships `migrations/0002_genesis_app_release_policy.sql`: `public.app_release_policy`, one row per app, row level security on, `select` for anon and authenticated only (granted and revoked by name), written only by the service role, with check constraints that keep malformed versions, links and notes out, and a pgTAP test. The README's leftover merge markers are resolved.

Features: app-updates, native-app-shell
