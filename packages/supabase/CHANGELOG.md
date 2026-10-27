# @marktiderman/genesis-supabase

## 0.7.0

### Minor Changes

- 18a5a4f: Migration `0014_genesis_feature_registry_hardening` (feature-mirror block) changes behaviour 0.6.0 shipped in 0008: server code is told apart from a person by the request's role (`current_setting('role')`), not by `request.jwt.claims`, so a session that switches to `authenticated` without claims is no longer treated as server code; `feature_shipped` answers a signed-in person only for customer-facing features; a flag that leaves the registry loses its `platform_value`; and `feature_entitlements` gets an index on `feature_id` for active rows. The docs now say to sync with the build time, not the time a deployment started.
- a211c61: New migration `0009_genesis_owner_access.sql` and the `owner-access` block. It defines the owner-access contract that Genesis blocks with owned rows call in their policies.
  - `private.genesis_owner_readable()` and `private.genesis_owner_allows(tenant, person_id, team_id, organization_id, action)` wrap the app's hooks, `genesis_readable_owners` and `genesis_owner_can`.
  - They fail closed: a missing or broken hook, no signed-in person, a null tenant or an unknown action means no.

  A pgTAP test sits beside the migration.

  Features: owner-access

## 0.6.2

### Patch Changes

- Updated dependencies [7cdf0fe]
  - @marktiderman/genesis-features@0.6.0

## 0.6.1

### Patch Changes

- Updated dependencies [bc5a348]
  - @marktiderman/genesis-features@0.5.0

## 0.6.0

### Minor Changes

- 85e23e1: Migration `0008_genesis_feature_registry` (block `feature-mirror`, needs `tenant-features`): the feature registry mirrored into the database on deploy (`features`, `feature_flags`, `sync_feature_registry`, never backwards), `feature_entitlements`, per-tenant `tenant_flag_values`, SQL `feature_on(tenant, feature)` for row security (shipped and, when paid, entitled), and `feature_gate_state(tenant)` for members. Client helpers `syncFeatureRegistry` and `featureGateState`. Platform-wide flag values (`feature_flags.platform_value`) act as a kill switch over tenant values. Requests are judged by their role: an authenticated request without a person is refused, never treated as server code.

### Patch Changes

- Updated dependencies [773e809]
  - @marktiderman/genesis-features@0.4.1

## 0.5.0

### Minor Changes

- 0435b05: Background jobs: `migrations/0007_genesis_jobs.sql` and `@marktiderman/genesis-supabase/jobs`.

  - **Queue.** `genesis_jobs` takes:
    - enqueues with an idempotency key;
    - claims with `SKIP LOCKED` and leases (a lease that runs out redelivers the job; a job that keeps dying fails as `lease_expired`);
    - settles (done, retry, failed);
    - cancel and a 14-day purge.
  - **Schedules.** `genesis_schedule_job(name, cron, job)` calls the app's job route through pg_cron and pg_net, with the URL and the secret read from Vault each time. Each request is signed for its job, and never carries the secret. Schedules are cron jobs named `genesis-job:<name>`.
  - **Server.** `enqueueJob`, `runJobs` (handlers by kind, jittered backoff, `PermanentJobError`; never throws for one job or for a failed settle), `createJobsHandler` (one route; requests signed per job for five minutes, or the bearer secret; the previous secret is accepted during a rotation) and `signJobRequest`.
  - **Block.** `jobsBlock`.

### Patch Changes

- Updated dependencies [d67b516]
  - @marktiderman/genesis-features@0.4.0

## 0.4.0

### Minor Changes

- 8c27421: Adds `sql/testing/genesis_testing.sql`, a pgTAP kit that checks an app's own schema keeps the Genesis data rules: refused writes, server-owned columns, guards that let system work through (signed out, bypass settings, ON DELETE SET NULL), private values never leaking through reports, and row counts per user. It uses shared owner, staff, client and stranger fixture ids.

### Patch Changes

- ca03900: genesis_testing: `never_shows` also finds a marker in the escaped form JSON writes it (quotes, backslashes), and `allows_system_paths` splits each setting on its first `=`, so a value may contain `=`.

## 0.3.1

### Patch Changes

- c2dbc4f: The README marks migration 0005 (`genesis_push`) and the `genesis-push-send` function as superseded by `@marktiderman/genesis-notifications`, which adopts 0005's tables in place and replaces the sender. Both stay unchanged here for apps that run them. Moving: remove 0005's pgTAP test from the app (two of its assertions describe the old register and forget) and stop calling `genesis-push-send`.

  Features: push-sender, notifications

## 0.3.0

### Minor Changes

- 81144ed: Sign in with Apple token revocation on account deletion (App Store Review Guideline 5.1.1(v)). The package now ships `functions/genesis-apple-revoke/`, a Supabase Edge Function template (Deno) that exchanges a sign-in's authorization code at Apple's `/auth/token` with an ES256 client secret signed from `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY`, checks the code belongs to the caller's Apple identity, and keeps the refresh token server-side; and `migrations/0003_genesis_apple_token_revocation.sql` (private token and queue tables, a `before delete` trigger on `auth.users` that queues a login's tokens in the delete's transaction, and four `public` functions executable by `service_role` only) with a pgTAP test. The function revokes queued tokens at `/auth/revoke`, retrying with backoff; deletion never waits for Apple. `storeAppleToken(client, { authorizationCode, clientId })` sends the code after sign-in, and `deleteMyAccount(client, { revokeAppleTokens: true })` asks for the revocation straight after the delete. Neither throws on a revocation failure.

  Features: apple-token-revocation

- 4f1869d: `genesis add`, `genesis migrate`, `genesis upgrade` and `genesis init --template native`.

  - `genesis add <block>` adds a block from what its Genesis package declares (`package.json` `genesis.blocks`, or `defineBlock` declarations at a Node-safe `./blocks` export): installs its packages at the pinned release, copies its migrations in as new timestamped files with a checksum header, and its pgTAP tests, Edge Functions, skills and AGENTS.md fragment; writes Expo Router stubs for missing routes, adds its feature registry entry (or prints it), runs `features build` and prints what is left by hand. It never overwrites a file the app has. `--dry-run`, `--yes`, `--no-install`, `--list`.
  - `genesis migrate` copies new package migrations in after every existing one, and reports (never rewrites) a copy edited in the app or a package migration changed upstream; `--forward` writes a forward migration stub instead.
  - `genesis upgrade` moves every Genesis dependency to one release with the genesis-upgrade workflow's own bump (now shared: the workflow embeds `src/upgrade/bump-core.mjs`), runs codemods only for a declared breaking version (the registry is empty), refreshes the files Genesis owns in the app (`genesis.lock.json`) with a three-way decision and `git merge-file`, runs the doctor, and opens a pull request with `--pr`.
  - `genesis init <app> --template native` makes a new Expo app from the RN starter outside the monorepo: app-owned files only, renamed, `workspace:` deps pinned to the release, plain Metro config, the pnpm settings Metro needs, the eas, maestro and ci templates, and a `genesis.lock.json`. The CLI now ships the starter, the templates and a catalog of every package's block manifests in `dist/`. `init --native` is unchanged.

  `genesis-supabase` declares its `account` and `tenant-features` blocks in `package.json` (`genesis.blocks`: migrations, the `genesis-apple-revoke` function and its secrets, setup steps) and exports the declarations at `@marktiderman/genesis-supabase/blocks`. `genesis-native` declares `push` (migration 0005, the `genesis-push-send` function, the notification settings route), `app-updates` (migration 0002), `observability` and `devtools-overlay` the same way, with a test that each manifest says what its block declares.

- 73fb1f5: Blocks: `defineBlock` and `resolveBlocks` in `@marktiderman/genesis-features/blocks` (free of zod; also re-exported from the root) declare a block by its FeatureId with what it requires and contributes (nav, Settings rows, routes, slot fills, migrations, skills, privacy), and resolve the enabled ones with requirement, cycle and conflict checks. The registry's `requires` checks now live in `graph.ts`, shared by both, with the same messages.

  `GenesisNativeApp` takes `blocks` (and `appFeatures`, for requirements that aren't blocks): their boot steps, roots and slot fills (under the app's own slots; an unknown slot name is an error), with `useBlocks` and `useBlockSettings` for the nav tree and Settings. A setup error in the shell now hides the splash, so the fatal screen shows. `createUpdates` now returns a block (`app-updates`) that contributes the version signature row (`versionRow` sets or turns it off); `updates={…}` works as before.

  `genesis-supabase` adds migration `0004_genesis_tenant_features.sql`: per-tenant feature switches with a reason and a change history, `set_tenant_feature` for the tenant's admins through an app-supplied `private.genesis_tenant_admin` hook (fails closed without it), `tenant_features_off` for members, `tenant_feature_settings` and `tenant_feature_history` for admins, and `private.tenant_feature_on` for SQL gates; with the client helpers `tenantFeatures`, `setTenantFeature`, `tenantFeatureSettings` and `tenantFeatureHistory`, and `accountBlock` and `tenantFeaturesBlock` declarations.

- 99af0cd: The push block, `@marktiderman/genesis-native/push`: `createPush({ notifications, platform, projectId, backend: supabasePushBackend(supabase), categories, storage, appState, openSettings, links, hold, onOpen })`, a `defineBlock` block (`id: "push"`) for `<GenesisNativeApp blocks={[push]}>`. It contributes a Settings row (`useBlockSettings`, the permission as its subtitle), a bounded boot step that reads the permission, its route and its migration. `NativeAppSlots` gains `pushPrompt`.

  - **Permission**: never asked at launch. `usePushPrompt().offer(reason)` shows a soft pre-prompt (the `pushPrompt` slot, default `PushPromptSheet`) only after a launch grace, while signed in and while the system can still ask, with a cooldown after "Not now" and a cap on how often; its "Turn on" brings up the system prompt.
  - **Registration**: once permission is granted, the signed-in person's Expo push token is registered (`getExpoPushTokenAsync({ projectId })`), again when the OS rotates it, and forgotten on sign-out, account switch and deletion, even after the session has ended; a forget that fails offline is retried at the next start. No `projectId` is reported once, loudly.
  - **Android channels**: `default` plus one per category, private on the lock screen, made before the permission prompt and the token.
  - **Foreground and taps**: a foreground handler (`useSuppressNotifications` hides a screen's own kind), tap routing through `normalizeLink` and GenesisNativeApp's held link (the launching tap too, once), and the badge (`useBadge`).
  - **NotificationSettings**: a `SettingsPage` with `permission`, `categories`, `quietHours` and `privacy` parts, each a slot and a hook (`usePushPermission`, `useNotificationCategories`, `useQuietHours`, `usePrivacyPreviews`); saved at once, put back when a save fails.

  `@marktiderman/genesis-supabase` ships `migrations/0005_genesis_push.sql` (`push_devices`, `notification_preferences`, `push_receipts`, owner-only row level security, functions granted by name, `genesis_push_targets` honouring categories, time-zone-aware quiet hours and hidden previews) with a pgTAP test, and the `genesis-push-send` Edge Function template: Expo sends in batches of 100, neutral text for hidden previews, a receipt per ticket, a receipts poll, `DeviceNotRegistered` devices forgotten, and no token or content in its logs or answers.

  `@marktiderman/genesis-ui-native`: `SettingsPageSection` takes `children`, rendered inside the section's group after its rows, so a pattern built on `SettingsPage` can put a replaced part in the same section. On iOS, `NativeTimePicker` and `NativeDatePicker` render the compact picker alone (it is its own button); the extra button beside it showed the value twice.

  Features: push, push-sender

- e930dda: Native Google sign-in. `@marktiderman/genesis-supabase/native` adds `signInWithGoogle(client, GoogleOneTapSignIn, { digest, randomNonce? })`: a fresh 32-byte nonce, its SHA-256 to Google through the Universal sign-in module's `authenticate({ nonce })`, a check that the ID token carries that hash (`google_nonce_missing` otherwise, before anything reaches Supabase), then `signInWithIdToken({ provider: "google", token, nonce })` with the raw nonce, as Supabase's Google guide describes. `@react-native-google-signin/google-signin` is an optional peer and is passed in, never imported. `@marktiderman/genesis-ui-native` adds `googleProvider({ onPress, label?, icon?, enabled? })` for `AuthScreen`'s `providers`. The Apple nonce docs no longer suggest `randomUUID`: the default is 32 random bytes.

  Features: account

- 0fd477c: Fixes from running the native starter on an iOS simulator.

  **PKCE uses S256 on React Native.** Hermes has no `crypto.subtle`, so supabase-js sent the PKCE challenge as `plain` (the verifier itself), and with no `crypto` at all made the verifier with `Math.random`. `createGenesisSupabase` takes `crypto` (`import * as ExpoCrypto from "expo-crypto"`), which installs `crypto.getRandomValues` and a SHA-256-only `crypto.subtle.digest` on `globalThis` from it, never replacing real WebCrypto. A PKCE client made with neither, on any platform, throws in development and logs an error in a release build. With the polyfill in place, `auth.getClaims()` always has the server check the token (`getUser`), because the polyfill can hash but can't verify a signature; supabase-js would otherwise try to verify asymmetric tokens locally and throw. `installWebCrypto`, `hasPkceCrypto`, `assertPkceCrypto` and `isDigestOnlyPolyfill` are on `/native`.

  **The keyboard moves the form.** `GenesisNativeApp` takes `keyboardProvider` (react-native-keyboard-controller's `KeyboardProvider`) and mounts it once around the app. `keyboardScroll`'s `KeyboardAwareScrollView` did nothing without it. It is read once, so an inline wrapper can't remount the app. In development, `keyboardScroll` without `keyboardProvider` logs an error. The ui-native `KeyboardScrollProvider` docs say it needs `KeyboardProvider` above it.

  **Genesis components are styled under NativeWind v4.** New `presets/nativewind` (`genesisNativewindPreset`): the Tailwind v3 preset plus the theme's role colors (`bg-primary`, `border-input`, `text-foreground`, `text-destructive`…, as `hsl(var(--…))`) and their variables, light on `:root` and dark under `prefers-color-scheme: dark`, with the same values as `themes/genesis.css`. With `presets/tailwind` alone, none of those classes were generated and `--radius` was never declared, so inputs had black square borders and primary buttons had no fill. The CLI's scaffolder writes the new preset into an Expo app's Tailwind config.

- 03e1fa0: The support block, with its data in the app's own Supabase.

  New package `@marktiderman/genesis-support` (first version published by hand, see docs/RELEASING.md "A brand-new package"):

  - Core: the feedback record (bug, idea, question or praise; message; version signature, route, platform, device; screenshots) behind `ContextCollector` and `FeedbackSink` seams; `createSupportClient` (the Supabase sink, the person's reports and replies, read receipts, signed screenshot URLs, the idea board with votes, "you asked, we shipped"); `createIntakeClient` / `createIntakeSink` for the wire contract over HTTP; a copy catalog; `defineSupportBlock` (`support-feedback`), which adds Send feedback and Help to Settings, its routes and migration 0006.
  - `/web`: `FeedbackPanel` and `FeedbackLauncher` from Genesis UI, tab screenshots with pen marks and hidden areas, pins on the page, and `mountSupportWidget`.
  - `/native`: `createSupport` for `GenesisNativeApp`'s `blocks`, `FeedbackForm`, `ScreenshotAnnotator` (pen and Hide, flattened with `captureRef`), shake to report, `SendFeedbackButton` for a devtools slot, and hooks that feed `InboxPage` and `ThreadPage`.

  `@marktiderman/genesis-supabase`: migration `0006_genesis_support.sql` with its pgTAP test (reports, screenshots in a private bucket with storage policies, staff replies with read receipts, ideas and one vote per person; staff through the app's `private.genesis_support_staff` hook; grants by name; rate limits), and three Edge Function templates: `genesis-support-intake` (the wire contract, as the caller), `genesis-support-notify` (a GitHub issue or a signed webhook per report, summary only) and `genesis-support-cleanup` (removes deleted screenshots through the Storage API).

  `@marktiderman/genesis-support` declares the block under `genesis.blocks` in its package.json, so `genesis add support-feedback` finds its migration, function templates, routes and steps.

### Patch Changes

- Updated dependencies [73fb1f5]
  - @marktiderman/genesis-features@0.3.0

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
