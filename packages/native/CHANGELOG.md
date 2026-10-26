# @marktiderman/genesis-native

## 0.4.3

### Patch Changes

- Updated dependencies [e35cabb]
- Updated dependencies [bc5a348]
  - @marktiderman/genesis-core@1.11.0
  - @marktiderman/genesis-features@0.5.0

## 0.4.2

### Patch Changes

- e1de4c1: - `native-screen-layout` counts a route as a screen through `NativeLoadingState` only when a full-screen loading state is all it renders (header options and fragments aside). A route that also renders other content, imports it, or uses `fullScreen={false}` still needs a Genesis layout.
  - Docs: `ScreenContainer`'s `loading` is for first loads (the body is unmounted while it's on); `loadingLabel` is visible and read aloud, so pass translated text; spread `notificationsPushPreferences` after your own keys.
- a85f1c7: Docs. genesis-chat: the README covers `/native` (Beta: its screens and their main props), lists migration 0003 and names the push category `messages`. genesis-native: the rich push plugin's first-build steps for the Notification Service Extension (enable Communication Notifications on `<bundle id>.NotificationService`, then `eas credentials` to make its profile). genesis-notifications: a push carries a type's `push.ids` (and, with previews shown, `push.display` and `mutableContent`), and the Notification Service Extension works with it through genesis-native.
- 48c4c90: README: an app with its own push `register` / `forget` takes its preferences from genesis-notifications' `notificationsPushPreferences(supabase)` instead of stubbing `loadPreferences` / `savePreferences`.
- Updated dependencies [e1de4c1]
- Updated dependencies [6f725f8]
  - @marktiderman/genesis-ui-native@2.5.0

## 0.4.1

### Patch Changes

- Updated dependencies [d67b516]
- Updated dependencies [fd09919]
- Updated dependencies [927b32f]
- Updated dependencies [5344767]
- Updated dependencies [c054142]
- Updated dependencies [66e1a5d]
- Updated dependencies [75965c0]
- Updated dependencies [b755b3e]
  - @marktiderman/genesis-features@0.4.0
  - @marktiderman/genesis-core@1.9.0

## 0.4.0

### Minor Changes

- edfb983: iOS rich push. `@marktiderman/genesis-native/rich-push-plugin` is an Expo config plugin that adds a Notification Service Extension. The extension attaches `data.image` and `data.senderAvatar` (https only; it always shows the notification, even when a download fails), and it turns `messages` pushes into Communication Notifications: the sender's photo is shown, and Focus treats them as messages. The plugin also sets the communication entitlement, `NSUserActivityTypes` and the extension's EAS app extension entry. `richPushMessage` (in `/push` and the React-free `/push-payload`) sets `mutableContent: true`, without which iOS never runs the extension. genesis-chat adds `chatPushPayload`, which builds a message push's category, thread, `mutableContent` and data (sender, group, photo; ids only with hidden previews). It is server safe, from the new `@marktiderman/genesis-chat/push` subpath.
- c2dbc4f: The push block connects to `@marktiderman/genesis-notifications`. `createPush` takes `deviceCategories` (notification categories with action buttons, registered when the block starts through `setNotificationCategoryAsync`) and `randomUUID`. A `PushBackend` that sets `usesInstallationId` gets this install's id (made once, kept across sign-ins) as `register`'s fourth argument, so a server can move a token between logins only on the same phone; `supabasePushBackend` is unchanged. `notificationAction(response)` reads a tapped action button: its id, the typed text (`userText`), the link and the notifier's `notification_id`. `NotificationResponseLike` gains `userText`, `NotificationsModuleLike` an optional `setNotificationCategoryAsync`, and `PushErrorSource` `"categories"`.

  Features: push, notifications

### Patch Changes

- 3c3c549: Push block: no more re-registering in a loop once notifications are allowed. Fetching the Expo token fetches the device token, and expo-notifications tells the push token listener each time, changed or not; the block forced a registration on every one (about 330 a minute on a simulator). An unchanged token is now ignored, the first one only confirms the registration, and a different one is a rotation.
- Updated dependencies [099084a]
- Updated dependencies [9c63a78]
  - @marktiderman/genesis-ui-native@2.4.0

## 0.3.0

### Minor Changes

- 73fb1f5: Blocks: `defineBlock` and `resolveBlocks` in `@marktiderman/genesis-features/blocks` (free of zod; also re-exported from the root) declare a block by its FeatureId with what it requires and contributes (nav, Settings rows, routes, slot fills, migrations, skills, privacy), and resolve the enabled ones with requirement, cycle and conflict checks. The registry's `requires` checks now live in `graph.ts`, shared by both, with the same messages.

  `GenesisNativeApp` takes `blocks` (and `appFeatures`, for requirements that aren't blocks): their boot steps, roots and slot fills (under the app's own slots; an unknown slot name is an error), with `useBlocks` and `useBlockSettings` for the nav tree and Settings. A setup error in the shell now hides the splash, so the fatal screen shows. `createUpdates` now returns a block (`app-updates`) that contributes the version signature row (`versionRow` sets or turns it off); `updates={…}` works as before.

  `genesis-supabase` adds migration `0004_genesis_tenant_features.sql`: per-tenant feature switches with a reason and a change history, `set_tenant_feature` for the tenant's admins through an app-supplied `private.genesis_tenant_admin` hook (fails closed without it), `tenant_features_off` for members, `tenant_feature_settings` and `tenant_feature_history` for admins, and `private.tenant_feature_on` for SQL gates; with the client helpers `tenantFeatures`, `setTenantFeature`, `tenantFeatureSettings` and `tenantFeatureHistory`, and `accountBlock` and `tenantFeaturesBlock` declarations.

- e3b994a: New entry, `@marktiderman/genesis-native/dev-warnings`: `ignoreKnownDependencyWarnings(LogBox, __DEV__)` keeps the development warnings an app can't act on out of LogBox (today React Native 0.88's `ImageBackground` deprecation, which NativeWind's runtime sets off at start-up). In React Native 0.88 the first warning pins LogBox's "Open debugger to view warnings." pill over the native tab bar, so the first tab tap after a launch, or after a link brought the app forward, landed on the pill and seemed ignored. Call it from the app's entry file before requiring `expo-router/entry`, as the starter's `index.ts` now does; it does nothing in release builds. It removes that trigger only: any other warning (the app's own included) still shows the pill until the debugger is opened.

  Features: native-app-shell

- a7db4d0: **`NativeSheet` no longer crashes on open when `@gorhom/bottom-sheet` is installed somewhere in the workspace.** It used the library whenever `require("@gorhom/bottom-sheet")` resolved, but the library throws on open without its `BottomSheetModalProvider` (and needs gesture-handler's `GestureHandlerRootView` and Reanimated), which nothing mounted.

  - By default the sheet is now React Native's own `Modal`, which needs no provider.
    - iOS: the system page sheet (`presentationStyle="pageSheet"`), which follows the finger when swiped down (`allowSwipeDismissal`).
    - Android: a bottom panel over a scrim, drawn under the system bars. A tap on the scrim or back closes it.
    - Content gets the sheet's own safe area, and the bottom inset is padded.
    - `disableBackdropDismiss` keeps it up against every way of dismissing it.
    - A sheet mounted open waits for the Reduce Motion setting before presenting.
  - The library is used only when the app opts in, in either of two ways:
    - `GenesisNativeApp`'s new `bottomSheet` prop (`import * as BottomSheet from "@gorhom/bottom-sheet"`, then `bottomSheet={BottomSheet}`). It mounts the provider inside the data, session and blocks providers, since sheet content renders in the library's portal.
    - The new `NativeSheetProvider`.
    - A module missing an export is reported with `console.error`, and sheets fall back to the modal.
  - On that path:
    - `enableDynamicSizing` is off, so `snapPoints` and `initialSnapIndex` mean what they say.
    - A dismiss that finishes after the app reopened the sheet isn't reported as the user closing it.
  - New `NativeSheetScrollView`: the library's `BottomSheetScrollView` under the provider, React Native's `ScrollView` otherwise. The what's-new notes scroll in it.
  - What may change for existing sheets:
    - The modal adds no padding of its own. The old fallback padded its content with `p-4`.
    - On iPhone the page sheet is nearly full height.
    - Sheets don't move above the keyboard.

  **Classes inside `@marktiderman/genesis-native` now style its screens.** Its exports only pointed at `dist/`, whose JSX tsup compiles to `react/jsx-runtime` calls, which NativeWind's JSX transform never sees, so the update screens' (force upgrade, maintenance, banner, what's new) and the push prompt's `className`s did nothing. Like ui-native, it now ships `src` and has `react-native` export conditions pointing at it, so Metro compiles it with the app's NativeWind transform.

  **`genesisNativewindContent()`** in `presets/nativewind` gives Tailwind the `src` and `dist` globs of every Genesis React Native package the app uses, found the way Node finds them (the app's node_modules, a hoisted workspace root or a workspace link), following their dependencies. `packages` adds starting points (your own wrapper package), and a listed package that isn't installed is warned about. `genesis init --native` and the starter use it in place of hand-written `node_modules` globs, which find nothing when a package is hoisted above the app.

- 46f8fcb: Optional native modules, passed in rather than required: `GenesisModulesProvider` (and
  `GenesisNativeApp`'s `modules`) hands components FlashList v2 (`NativeResourcePage`,
  `NotificationsPage`), expo-image (`NativeAvatar`, new `NativeImage`), Reanimated 4 (toast, drawer,
  skeleton; Reduce Motion respected), expo-glass-effect (new `NativeGlassSurface`: default toasts,
  the update banner, popovers and menus as iOS 26 Liquid Glass when both availability checks pass
  and Reduce Transparency is off), expo-symbols and a lucide icon set (new `NativeIcon` with
  semantic names, `lucideIcons` from `/icons/lucide`), and @expo/ui's drop-in date picker.
  `KeyboardScrollProvider` takes a `toolbar` (`KeyboardToolbar`), shown on `AuthScreen` and
  `SettingsSubPage`; `GenesisNativeApp` takes it as `keyboardToolbar`. Every module left out falls
  back to what the component drew before. `lucide-react-native` is now an optional peer, only the
  `/icons/lucide` subpath imports it, and its range is `>=0.475.0` (the names that subpath uses): an
  app on 0.400-0.474 that never imports it sees a peer warning on upgrade and nothing else.
- 0d165a8: The observability block, `@marktiderman/genesis-native/observability`, and the devtools overlay, `@marktiderman/genesis-native/devtools`.

  **Observability.** `createObservability({ sinks, events, useSegments })` is a block (`<GenesisNativeApp blocks={[observability]}>`) that fans errors, breadcrumbs, the user id, analytics events and timings out to vendor-neutral sinks:

  - `sentrySink(Sentry, { dsn, signature, applicationId })` starts Sentry (`@sentry/react-native`, an optional peer passed in, never imported) with the Expo Router integration, no default PII, screenshots, view hierarchy or accessibility labels, release `<applicationId>@<version>+<build>` and dist `<build>` from the version signature, and the update id, channel, runtime version and launch as tags. Without a DSN it starts nothing.
  - `observeSink(Observe)` sends events and timings to EAS Observe as `Observe.logEvent` (it has no custom timing metric); `consoleSink()` is for development.
  - A PII scrubber is on by default: emails, JWTs, Supabase keys, bearer tokens, tokens in query strings and long hex secrets are replaced in every string, values under secret keys (`authorization`, `cookie`, `apikey`, `password`, `token`, `email`, …) are replaced whole, URLs lose their query and fragment, request bodies and cookies are dropped, and the user is reduced to an id. Sentry gets it in `beforeSend`, `beforeSendTransaction`, `beforeSendSpan`, `beforeBreadcrumb` and `beforeSendLog`; a scrubber failure drops the event.
  - `defineEvents` and `track(name, props)`: typed analytics events whose props are closed string lists, numbers or booleans, never free text, checked at compile time and at run time.
  - With `useSegments` from expo-router, a breadcrumb per route change and a `route.time_on_screen` timing, by route pattern.
  - `observability.wrap(RootLayout)` applies Sentry's `wrap`; `useRecentActivity()` gives the last breadcrumbs and errors, scrubbed.

  **The shell.** A `NativeBlock` may carry `onError`: every error `GenesisNativeApp` catches (both boundaries, global errors, a failed boot, rejections) goes to each block's `onError` and then to the app's `onError`. A reporter that throws is now ignored instead of breaking the error path. `GenesisNativeApp` has a new slot, `devtoolsFeedback`.

  **Devtools overlay.** `createDevtools({ enabled, updates, observability, baseUrl, flags, accelerometer, devSettings, copy, clearCache, signOut })` is a block for development, preview and internal builds: a three-finger hold, a shake (with expo-sensors' `Accelerometer`) or "Open devtools" in the dev menu open a sheet with the version signature, the update channel and the updates block's guarded channel switch, the user id, the blocks and flags in effect, recent breadcrumbs and errors, the server URL, and "Copy debug info", "Crash test", "Clear cache" and "Sign out", with the `devtoolsFeedback` slot for the support block. With `enabled` false it mounts nothing. Import the entry behind a condition Metro folds (`__DEV__ || process.env.EXPO_PUBLIC_APP_VARIANT === "preview"`) and it is left out of production bundles.

  Features: observability, devtools-overlay, native-app-shell

- 99af0cd: The push block, `@marktiderman/genesis-native/push`: `createPush({ notifications, platform, projectId, backend: supabasePushBackend(supabase), categories, storage, appState, openSettings, links, hold, onOpen })`, a `defineBlock` block (`id: "push"`) for `<GenesisNativeApp blocks={[push]}>`. It contributes a Settings row (`useBlockSettings`, the permission as its subtitle), a bounded boot step that reads the permission, its route and its migration. `NativeAppSlots` gains `pushPrompt`.

  - **Permission**: never asked at launch. `usePushPrompt().offer(reason)` shows a soft pre-prompt (the `pushPrompt` slot, default `PushPromptSheet`) only after a launch grace, while signed in and while the system can still ask, with a cooldown after "Not now" and a cap on how often; its "Turn on" brings up the system prompt.
  - **Registration**: once permission is granted, the signed-in person's Expo push token is registered (`getExpoPushTokenAsync({ projectId })`), again when the OS rotates it, and forgotten on sign-out, account switch and deletion, even after the session has ended; a forget that fails offline is retried at the next start. No `projectId` is reported once, loudly.
  - **Android channels**: `default` plus one per category, private on the lock screen, made before the permission prompt and the token.
  - **Foreground and taps**: a foreground handler (`useSuppressNotifications` hides a screen's own kind), tap routing through `normalizeLink` and GenesisNativeApp's held link (the launching tap too, once), and the badge (`useBadge`).
  - **NotificationSettings**: a `SettingsPage` with `permission`, `categories`, `quietHours` and `privacy` parts, each a slot and a hook (`usePushPermission`, `useNotificationCategories`, `useQuietHours`, `usePrivacyPreviews`); saved at once, put back when a save fails.

  `@marktiderman/genesis-supabase` ships `migrations/0005_genesis_push.sql` (`push_devices`, `notification_preferences`, `push_receipts`, owner-only row level security, functions granted by name, `genesis_push_targets` honouring categories, time-zone-aware quiet hours and hidden previews) with a pgTAP test, and the `genesis-push-send` Edge Function template: Expo sends in batches of 100, neutral text for hidden previews, a receipt per ticket, a receipts poll, `DeviceNotRegistered` devices forgotten, and no token or content in its logs or answers.

  `@marktiderman/genesis-ui-native`: `SettingsPageSection` takes `children`, rendered inside the section's group after its rows, so a pattern built on `SettingsPage` can put a replaced part in the same section. On iOS, `NativeTimePicker` and `NativeDatePicker` render the compact picker alone (it is its own button); the extra button beside it showed the value twice.

  Features: push, push-sender

- e930dda: `withGenesis` writes a fuller iOS privacy manifest. Required-reason APIs now cover React Native (FileTimestamp C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1), Expo (expo-file-system's FileTimestamp 0A2A.1 and 3B52.1 and DiskSpace E174.1 and 85F4.1, expo-constants' UserDefaults CA92.1), expo-updates, expo-application, expo-notifications and @sentry/react-native, each from the package's own PrivacyInfo.xcprivacy (Sentry's from its privacy-manifest guide), beside async-storage. It sets `NSPrivacyTracking: false` and `NSPrivacyCollectedDataTypes` from the Genesis blocks the app uses (`PRIVACY_BLOCKS`: `account` from genesis-supabase, `observability` from genesis-native with Sentry, `push` from genesis-native with expo-notifications, `support` from genesis-support), unioned per Apple type (block type names are matched whatever their case). An app picks the blocks, or lists everything it collects (any of Apple's 35 types), in genesis.config.json `privacy` (`blocks`, `collects`, `tracking`) or the plugin's `privacy` option; a misspelt data type, purpose or block fails the config, as does a tracking setting that contradicts the app's own `NSPrivacyTracking`. Without either, the plugin warns that only Genesis blocks are declared. The app's own manifest entries always win.

  genesis-native's observability block now also declares "other diagnostic data" (Sentry's device and OS details, breadcrumbs and sessions) and, with `events`, analytics as a purpose of the user id, matching what the privacy manifest declares.

  Features: expo-config-plugin, observability

- e930dda: `createNativeQueryClient` defaults queries and mutations to `networkMode: "offlineFirst"` instead of `"always"`. A request still runs once whatever the network says; its retries now pause while NetInfo (through `connectQueryLifecycle`) reports offline and continue when the network is back, and stale queries refetch on reconnect (`"always"` turned `refetchOnReconnect` off, so the NetInfo wiring did nothing). Offline, a query with saved data keeps showing it; one with nothing saved stays `pending` with `isPaused` instead of failing after its retries; a mutation, with no retries by default, still fails at once. Pass `networkMode: "always"` in `defaultOptions` to keep the old behaviour. `NativeResourcePage` shows an offline message (`offlineState` to replace it) in place of the empty state while its list is paused with nothing saved (search and filters stay above it), and its pull-to-refresh spinner stops while a refetch is paused offline. `connectQueryLifecycle`'s cleanup sets the app back online, so no query stays paused on a stale "offline".

  Features: native-app-shell

- 0fd477c: Fixes from running the native starter on an iOS simulator.

  **PKCE uses S256 on React Native.** Hermes has no `crypto.subtle`, so supabase-js sent the PKCE challenge as `plain` (the verifier itself), and with no `crypto` at all made the verifier with `Math.random`. `createGenesisSupabase` takes `crypto` (`import * as ExpoCrypto from "expo-crypto"`), which installs `crypto.getRandomValues` and a SHA-256-only `crypto.subtle.digest` on `globalThis` from it, never replacing real WebCrypto. A PKCE client made with neither, on any platform, throws in development and logs an error in a release build. With the polyfill in place, `auth.getClaims()` always has the server check the token (`getUser`), because the polyfill can hash but can't verify a signature; supabase-js would otherwise try to verify asymmetric tokens locally and throw. `installWebCrypto`, `hasPkceCrypto`, `assertPkceCrypto` and `isDigestOnlyPolyfill` are on `/native`.

  **The keyboard moves the form.** `GenesisNativeApp` takes `keyboardProvider` (react-native-keyboard-controller's `KeyboardProvider`) and mounts it once around the app. `keyboardScroll`'s `KeyboardAwareScrollView` did nothing without it. It is read once, so an inline wrapper can't remount the app. In development, `keyboardScroll` without `keyboardProvider` logs an error. The ui-native `KeyboardScrollProvider` docs say it needs `KeyboardProvider` above it.

  **Genesis components are styled under NativeWind v4.** New `presets/nativewind` (`genesisNativewindPreset`): the Tailwind v3 preset plus the theme's role colors (`bg-primary`, `border-input`, `text-foreground`, `text-destructive`…, as `hsl(var(--…))`) and their variables, light on `:root` and dark under `prefers-color-scheme: dark`, with the same values as `themes/genesis.css`. With `presets/tailwind` alone, none of those classes were generated and `--radius` was never declared, so inputs had black square borders and primary buttons had no fill. The CLI's scaffolder writes the new preset into an Expo app's Tailwind config.

- 697c18c: `GenesisNativeApp` mounts `NativeToastProvider` around the screens, so `useToast()` from genesis-ui-native works on every screen without the app mounting one (it threw before). Toasts sit at the top by default, where a tab bar can't cover them; `toast={{ position, disableAnimation }}` places them and `toast={null}` leaves the provider to the app. A top toast now sits below the safe area's top (the status bar and the Dynamic Island) when a `SafeAreaProvider` is above it. `FeedbackForm` takes `sentAlert={false}` to leave the confirmation to `onSent`; the starter shows a toast after a sent report.

  Features: native-app-shell, native-components, support-feedback

### Patch Changes

- 4f1869d: `genesis add`, `genesis migrate`, `genesis upgrade` and `genesis init --template native`.

  - `genesis add <block>` adds a block from what its Genesis package declares (`package.json` `genesis.blocks`, or `defineBlock` declarations at a Node-safe `./blocks` export): installs its packages at the pinned release, copies its migrations in as new timestamped files with a checksum header, and its pgTAP tests, Edge Functions, skills and AGENTS.md fragment; writes Expo Router stubs for missing routes, adds its feature registry entry (or prints it), runs `features build` and prints what is left by hand. It never overwrites a file the app has. `--dry-run`, `--yes`, `--no-install`, `--list`.
  - `genesis migrate` copies new package migrations in after every existing one, and reports (never rewrites) a copy edited in the app or a package migration changed upstream; `--forward` writes a forward migration stub instead.
  - `genesis upgrade` moves every Genesis dependency to one release with the genesis-upgrade workflow's own bump (now shared: the workflow embeds `src/upgrade/bump-core.mjs`), runs codemods only for a declared breaking version (the registry is empty), refreshes the files Genesis owns in the app (`genesis.lock.json`) with a three-way decision and `git merge-file`, runs the doctor, and opens a pull request with `--pr`.
  - `genesis init <app> --template native` makes a new Expo app from the RN starter outside the monorepo: app-owned files only, renamed, `workspace:` deps pinned to the release, plain Metro config, the pnpm settings Metro needs, the eas, maestro and ci templates, and a `genesis.lock.json`. The CLI now ships the starter, the templates and a catalog of every package's block manifests in `dist/`. `init --native` is unchanged.

  `genesis-supabase` declares its `account` and `tenant-features` blocks in `package.json` (`genesis.blocks`: migrations, the `genesis-apple-revoke` function and its secrets, setup steps) and exports the declarations at `@marktiderman/genesis-supabase/blocks`. `genesis-native` declares `push` (migration 0005, the `genesis-push-send` function, the notification settings route), `app-updates` (migration 0002), `observability` and `devtools-overlay` the same way, with a test that each manifest says what its block declares.

- b3ee22b: Send feedback from the devtools overlay captures the screen once the overlay's sheet has finished closing, not after a fixed 400 ms that sometimes caught it half way down. The devtools block's `close()` (and the `devtoolsFeedback` slot's `close`) now returns a promise that resolves on the sheet's `onDismiss` (iOS), or after 800 ms where the platform doesn't report it (Android, which always waits that long); the sheet stays mounted while it slides away. The support block's slot waits for it, and still waits 400 ms for an overlay whose `close` returns nothing.

  Features: devtools-overlay, support-feedback

- 59d217d: The push soft prompt's content is centred in its sheet (iOS shows it as a full-height page sheet, where the few lines sat at the top). The version signature never prints an empty value: expo-updates gives `""` for the runtime version in a development build, so the devtools overlay's Build section read "Runtime " with nothing after it; it now reads "Runtime none" with updates off and "unknown" otherwise, and an empty version, build, channel or update id counts as not given.

  Features: push, app-updates

- Updated dependencies [73fb1f5]
- Updated dependencies [03e1fa0]
- Updated dependencies [1718648]
- Updated dependencies [a7db4d0]
- Updated dependencies [46f8fcb]
- Updated dependencies [99af0cd]
- Updated dependencies [e930dda]
- Updated dependencies [e930dda]
- Updated dependencies [3e596b9]
- Updated dependencies [0b8987b]
- Updated dependencies [0fd477c]
- Updated dependencies [b3ee22b]
- Updated dependencies [697c18c]
  - @marktiderman/genesis-features@0.3.0
  - @marktiderman/genesis-ui-native@2.3.0
  - @marktiderman/genesis-design-system@1.5.0

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
