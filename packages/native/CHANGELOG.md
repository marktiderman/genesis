# @marktiderman/genesis-native

## 0.2.0

### Minor Changes

- 581f319: The updates block, `@marktiderman/genesis-native/updates`: `createUpdates({ platform, application, updates, policy, storage, appState, openURL })` and `<GenesisNativeApp updates={updates}>` (leave the prop out to turn it off).

  - **Force upgrade**: a minimum store version per platform, compared with `expo-application`'s installed version, shows a blocking screen with a store link and "Check again". A minimum without a store link forces nothing.
  - **Maintenance**: a live maintenance flag shows a blocking screen with "Try again".
  - **Update banner**: expo-updates is checked on launch and on coming to the front; a downloaded update for this runtime version shows a banner that reloads only on tap, and never while `useBlockReload(true)` is mounted or `canReload()` says no.
  - **What's new**: release notes once per version, remembered in storage; never on a fresh install.
  - **Version signature** (`useVersionSignature`) for an About row and support reports, and **channel switching** for test builds, off unless `channels: { enabled: true }`.
  - **Policy sources**: `staticPolicySource` and `supabasePolicySource`, cached on the phone. It fails open: no answer, a timeout (3 s behind the splash), a malformed version, a cache older than 7 days or dated in the future never blocks, and a cached maintenance flag never blocks a cold start.

  Each renderer is a slot of `GenesisNativeApp` (`forceUpgrade`, `maintenance`, `updateBanner`, `whatsNew`), a primitive (`ForceUpgradeScreen`, `MaintenanceScreen`, `UpdateBanner`, `WhatsNewSheet`) and a hook. The `updateBanner` slot now receives `{ reload, dismiss, canReload, blocked, reloading }` and renders only with the `updates` prop (it was a placeholder that rendered nothing by default). `expo-updates` and `expo-application` are passed in, never imported; `react-native-safe-area-context` is a new peer, for the banner. Blocking screens are drawn over the screens, which stay mounted.

  `@marktiderman/genesis-supabase` ships `migrations/0002_genesis_app_release_policy.sql`: `public.app_release_policy`, one row per app, row level security on, `select` for anon and authenticated only (granted and revoked by name), written only by the service role, with check constraints that keep malformed versions, links and notes out and require a store link with each minimum version, and a pgTAP test. The README's leftover merge markers are resolved.

  Features: app-updates, native-app-shell

### Patch Changes

- a3ce5bf: New package, `@marktiderman/genesis-native`: `<GenesisNativeApp>`, one root above an Expo app's screens. It runs ordered, run-once boot steps behind the splash (a per-step timeout, a retry that waits for a timed-out run, a minimum). It shows a fatal screen with "Try again" for a failed boot, a render error or a fatal global error, with a last-resort screen above every provider. Unhandled promise rejections on Hermes and every caught error reach `onError`. It keeps a TanStack Query client that works offline, and reads the Supabase session without hanging offline (it falls back to the stored session). It releases a deep link held across a sign-in. With `@marktiderman/genesis-native/persist` it saves chosen query-key roots to async storage, scoped to the signed-in user, with a 24-hour max age and an app-version buster, and clears them whenever the user changes. `boot`, `fatal`, `errorBoundary`, `signedOut` and `updateBanner` are slots. Each part is also exported on its own, with `normalizeLink` for expo-router's `+native-intent` and `createHydrationGate` for persisted stores. The umbrella re-exports it as `@marktiderman/genesis/native-app` and `/native-app/persist`.

  Features: native-app-shell

- Updated dependencies [e649267]
- Updated dependencies [47b13ff]
- Updated dependencies [954fb55]
- Updated dependencies [a38a00f]
  - @marktiderman/genesis-ui-native@2.2.0
  - @marktiderman/genesis-design-system@1.4.1
