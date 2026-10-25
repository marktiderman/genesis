# @marktiderman/genesis-supabase

## 0.2.0

### Minor Changes

- e649267: From review of the Account block.

  `completeOAuthRedirect` passes `sb_flow_id` to `exchangeCodeForSession` and returns `redirectType` (`"recovery"` after a password reset). A redirect error's `message` is now fixed copy chosen by its code; the redirect's own `error_description` is only on the new, untrusted `GenesisAuthError.providerMessage`. `redirectParams` reads keys such as `constructor`.

  `signInWithApple` returns Apple's `authorizationCode`, which a server needs in order to revoke the Apple tokens on deletion; the README documents that step under "Not covered yet". It refuses a digest that isn't lowercase hex (`bad_digest`), and keeps `fullName` on the error result.

  `delete_my_account()` now:
  - refuses an aal1 session when the person has a verified MFA factor (`42501`);
  - runs `private.genesis_before_account_delete(uuid)` first when an app defines it, and maps a refusal from it to `GA001`;
  - comes with `private.genesis_require_recent_sign_in(interval)`, which an app can call from that hook to require a recent sign-in (`GA002`).

  The migration header is corrected: Supabase documents that a person who owns Storage objects can't be deleted (`23503`), and the comment about blanket grants is fixed.

  `AppleSignInButton` ignores a second tap while a sign-in is open, reports disabled and busy on the button itself, and its `label` and `height` docs are corrected.

  Features: account

- 47b13ff: The Account block, native first. `@marktiderman/genesis-supabase/native` adds `signInWithApple(client, AppleAuthentication, { digest })` (availability check, name and email scopes, a SHA-256 hashed nonce, `signInWithIdToken`; closing Apple's sheet is `{ canceled: true }`, and the full name Apple shares on the first sign-in comes back to save) and `completeOAuthRedirect(client, url)` (exchanges a PKCE `code`, or returns the redirect's `error` as a typed `GenesisAuthError`). `@marktiderman/genesis-supabase` adds `deleteMyAccount(client)` and ships `migrations/0001_genesis_account_deletion.sql` (`public.delete_my_account()`, security definer, `search_path = ''`, executable by `authenticated` only) with a pgTAP test. `@marktiderman/genesis-ui-native` adds `appleProvider()` and `AppleSignInButton`, which draw Apple's own button on iOS and nothing elsewhere; `AuthScreen` skips `null` providers and `SocialAuthProvider` takes a `render` for a provider's own button.

  Features: account

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

- a38a00f: Fixes found by building the native starter (`apps/genesis-rn-starter`, Expo SDK 58 / React Native 0.88) on the packages.

  - `@marktiderman/genesis-ui-native`: `AppleButtonModuleLike`'s button now types `style` as a `ViewStyle`, so the real `expo-apple-authentication` module can be passed to `appleProvider` and `AppleSignInButton` under strict TypeScript (with `unknown` it was refused). `ScreenContainer` compiles against React Native 0.88, which dropped `translucent` and `backgroundColor` from `StatusBar`'s props (Android is always edge to edge there); they are still passed for earlier versions. `NativeTextarea`'s `rows` is documented (the generated docs showed React Native's Android-only `rows` description for it).
  - `@marktiderman/genesis-design-system`: `./presets/*` and `./providers/native` gain a `default` export condition, so a CommonJS loader (NativeWind's Tailwind v3 config loader, Metro) resolves them; before, `tailwind.config` importing `presets/tailwind` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  - `@marktiderman/genesis-cli`: the doctor's `store-readiness` rule counts export compliance and the privacy manifest as set when the Expo config lists this package's own config plugin, which sets them (unless its `exportCompliance` / `privacyManifest` option is `false`, and the manifest only when a dependency needs one). Apps on `withGenesis()` no longer get those two warnings. In a dynamic config, only `withGenesis(` or the package's name outside an `import` / `require` counts as listing the plugin.
  - `@marktiderman/genesis-supabase`: the README had merge-conflict markers between the Account section and "Choices, and why"; both sections are kept.

  Features: native-starter

## 0.1.1

### Patch Changes

- e91765c: From review: `keychainStorage` queues reads with writes (a read could see the old generation disappear mid-read), lets every chunk write settle before reporting a failure (so a late write can't outlive the sweep), and removes chunks before the manifest. `refreshWhileActive`'s unsubscribe also stops auto-refresh. `wipeSessionOnReinstall` removes every indexed PKCE flow verifier and the index. `defineFeatures` skips schema-invalid entries in its relation checks instead of throwing, and `statusOn` treats `node` in `apps` as the `server` platform. `SettingsPage` rows are transparent so the theme-role cell color shows.

  Features: supabase-kit, feature-registry, native-components

- d7b0389: The native `GenesisThemeProvider` takes `syncNativeAppearance`: on the root provider it passes an in-app light or dark choice to `Appearance.setColorScheme`, so iOS system colors and native controls follow it, not only Genesis tokens; "system" and unmounting hand it back to the OS ("unspecified", or "auto" on React Native 0.87+). The react-native-keyboard-controller peer range starts at 1.11 (KeyboardAwareScrollView). `KeyboardScrollProvider` lets an app supply react-native-keyboard-controller's `KeyboardAwareScrollView` once; `AuthScreen` and `SettingsSubPage` use it, and fall back to `KeyboardAvoidingView` without it. `NotificationsPage` memoizes its date grouping. The genesis-supabase README explains the Keychain storage choice, the URL polyfill and where to call `refreshWhileActive`.

  Features: design-tokens, native-layouts, supabase-kit

- 6d72884: New package, `@marktiderman/genesis-supabase`: `createGenesisSupabase` (PKCE sign-in, a persisted session that refreshes itself, the storage you pass) and `must()`; on `/native`, `keychainStorage` (chunked Keychain storage whose writes switch over only when complete and run one at a time per key), `refreshWhileActive` and `wipeSessionOnReinstall`. It imports neither React Native nor Expo.

  Features: supabase-kit

- b02192c: From review: `keychainStorage` splits between characters (an emoji at a chunk boundary was corrupted) and counts UTF-8 bytes against `chunkSize`; a pending marker lets the next write or remove sweep chunks left by a write that was cut short. `must()` throws `SupabaseQueryError` with the database's `code`, `details` and `hint` (and the error as `cause`), and keeps `null` in its return type for `.maybeSingle()`. `wipeSessionOnReinstall` also removes the PKCE code verifier and the stored user. `createGenesisSupabase({ platform: "native" })` sets the native defaults. The supabase-js peer range is the tested `^2.118.0`.
