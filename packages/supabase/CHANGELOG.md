# @marktiderman/genesis-supabase

## 0.1.1

### Patch Changes

- e91765c: From review: `keychainStorage` queues reads with writes (a read could see the old generation disappear mid-read), lets every chunk write settle before reporting a failure (so a late write can't outlive the sweep), and removes chunks before the manifest. `refreshWhileActive`'s unsubscribe also stops auto-refresh. `wipeSessionOnReinstall` removes every indexed PKCE flow verifier and the index. `defineFeatures` skips schema-invalid entries in its relation checks instead of throwing, and `statusOn` treats `node` in `apps` as the `server` platform. `SettingsPage` rows are transparent so the theme-role cell color shows.

  Features: supabase-kit, feature-registry, native-components

- d7b0389: The native `GenesisThemeProvider` takes `syncNativeAppearance`: on the root provider it passes an in-app light or dark choice to `Appearance.setColorScheme`, so iOS system colors and native controls follow it, not only Genesis tokens; "system" and unmounting hand it back to the OS ("unspecified", or "auto" on React Native 0.87+). The react-native-keyboard-controller peer range starts at 1.11 (KeyboardAwareScrollView). `KeyboardScrollProvider` lets an app supply react-native-keyboard-controller's `KeyboardAwareScrollView` once; `AuthScreen` and `SettingsSubPage` use it, and fall back to `KeyboardAvoidingView` without it. `NotificationsPage` memoizes its date grouping. The genesis-supabase README explains the Keychain storage choice, the URL polyfill and where to call `refreshWhileActive`.

  Features: design-tokens, native-layouts, supabase-kit

- 6d72884: New package, `@marktiderman/genesis-supabase`: `createGenesisSupabase` (PKCE sign-in, a persisted session that refreshes itself, the storage you pass) and `must()`; on `/native`, `keychainStorage` (chunked Keychain storage whose writes switch over only when complete and run one at a time per key), `refreshWhileActive` and `wipeSessionOnReinstall`. It imports neither React Native nor Expo.

  Features: supabase-kit

- b02192c: From review: `keychainStorage` splits between characters (an emoji at a chunk boundary was corrupted) and counts UTF-8 bytes against `chunkSize`; a pending marker lets the next write or remove sweep chunks left by a write that was cut short. `must()` throws `SupabaseQueryError` with the database's `code`, `details` and `hint` (and the error as `cause`), and keeps `null` in its return type for `.maybeSingle()`. `wipeSessionOnReinstall` also removes the PKCE code verifier and the stored user. `createGenesisSupabase({ platform: "native" })` sets the native defaults. The supabase-js peer range is the tested `^2.118.0`.
