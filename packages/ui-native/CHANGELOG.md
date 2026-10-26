# @marktiderman/genesis-ui-native

## 2.4.0

### Minor Changes

- 099084a: Native chat: async video messages, link previews and app attachment cards. `ChatVideoRecorder` records in the thread on expo-camera (`modules.camera`): tap to start and tap to send, or hold and let go; flip between takes; the time against the role's limit; close to throw a take away; camera and microphone asked for when it opens. A recording goes through `ChatProvider videoUpload` (a Mux direct upload, minted when recording starts) in resumable chunks (`chunkedPut`, retried and resumed after a dropped connection), with progress and Retry above the composer (`VideoUploadTray`), then is sent through the outbox as a pending Mux attachment; without `videoUpload` it goes to storage as a file. `ChatVideoPlayer` plays HLS and files on expo-video (`modules.video`): poster and duration, tap to play, pause, mute, 1x / 1.5x / 2x, full screen, "Processing" until Mux is done, one at a time with voice notes. `ChatLinkPreviewCard` shows a link's site, title and description under its message (no preview for hidden messages; the image only with `linkPreviewImages`), opening in expo-web-browser when given (`modules.webBrowser`), else the system browser. `ChatAttachmentCard` draws `ChatProvider attachmentKinds` (a form, a check-in) with its button, or `ChatThreadScreen onOpenAttachment`. Genesis UI Native adds the icons `video`, `camera-flip`, `volume`, `volume-off`, `expand` and `stop`.

### Patch Changes

- 9c63a78: Native chat polish:
  - Full emoji picker (`ChatEmojiPicker`, `ChatEmojiPickerSheet`): search, category tabs and a grid, with the person's recent emoji kept with their drafts (cleared on sign-out by `clearDrafts`). About 1,870 emoji are bundled from emojibase-data (MIT), with no network and no CDN, and written as keyboards type them, so a picked 👍 counts with the quick one. The long-press sheet has "+" beside the quick reactions, and the composer has an emoji button that types at the cursor.
  - Photo viewer (`ChatPhotoViewer`): full screen on black instead of a white page sheet, swiping through the tapped message's photos, pinch and double-tap zoom, and swipe down to close. Share and Save to Photos appear when the app passes `modules.sharing` (expo-sharing), `modules.mediaLibrary` (expo-media-library) and `modules.downloadFile`. `ChatMediaViewer` now opens the same viewer.
  - `ChatAutoRetry` / `useChatAutoRetry`: `retryAll()` runs when the app comes back to the front and, with `modules.netInfo`, when the connection comes back (messages the server refused for good, `permanent`, are left alone).
  - The thread shows `ChatAccessError` with Retry (`refetchAccess`) in place of the composer when your role couldn't be read.
  - genesis-ui-native: `NativeFullScreenModal` (full-screen media and camera content, dark by default), and the `smile` and `download` icons.

## 2.3.1

### Patch Changes

- da7fef7: `InboxPage`: `avatarLabel` says who a row's avatar shows when its title doesn't name them (screen readers read it before the title). The docs now say an unread count shows at the end of the row.
- 4514072: `NativeRefreshControl` no longer throws inside `GenesisNativeApp`: its tint is the theme's `tint` role (`useThemeRoles`) rather than `useGenesisTheme` from `providers/native`, a context the shell never mounts. `InboxPage` uses it for pull to refresh, draws its empty and loading states in a scroll view so they sit below a large-title header (and can be pulled to refresh), and takes an `avatar` per row, between the unread dot or count and the text, with the separator starting at the text.

  `NativeIcon` gains the names a chat screen needs, with an SF Symbol and a lucide icon each: `arrow-up`, `camera`, `compose`, `copy`, `file`, `image`, `message`, `mic`, `paperclip`, `pause`, `pin`, `play`, `reply`.

## 2.3.0

### Minor Changes

- 03e1fa0: `InboxPage` and `ThreadPage`, two generic conversation layouts in `SettingsPage`'s iOS inset grouped style.

  `InboxPage`: unread dot or count, a short time, a preview and a status line, pull to refresh, paging and an empty state with an action. Swipe actions are always reachable as accessibility actions and on long press; the `swipeable` slot takes a gesture-handler wrapper for the swipe itself.

  `ThreadPage`: messages with attachments, a read receipt, "load earlier", optimistic sending and retry, and a composer kept above the keyboard through `KeyboardScrollProvider` (or a `KeyboardAvoidingView` without it); `composer={null}` is read-only.

  The React Native type stubs gain the props these use (`accessibilityActions`, `onAccessibilityAction`, `onPressIn` / `onPressOut`, `onContentSizeChange`, FlatList's `refreshControl` and `contentInsetAdjustmentBehavior`), and the test shim renders FlatList headers and footers and accessibility actions.

  `NativeSegmentedControl` shows the selected segment's lift as a style instead of toggling a `shadow-sm` class, which crashed in development when the selection changed (NativeWind's upgrade warning).

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

- e930dda: `createNativeQueryClient` defaults queries and mutations to `networkMode: "offlineFirst"` instead of `"always"`. A request still runs once whatever the network says; its retries now pause while NetInfo (through `connectQueryLifecycle`) reports offline and continue when the network is back, and stale queries refetch on reconnect (`"always"` turned `refetchOnReconnect` off, so the NetInfo wiring did nothing). Offline, a query with saved data keeps showing it; one with nothing saved stays `pending` with `isPaused` instead of failing after its retries; a mutation, with no retries by default, still fails at once. Pass `networkMode: "always"` in `defaultOptions` to keep the old behaviour. `NativeResourcePage` shows an offline message (`offlineState` to replace it) in place of the empty state while its list is paused with nothing saved (search and filters stay above it), and its pull-to-refresh spinner stops while a refetch is paused offline. `connectQueryLifecycle`'s cleanup sets the app back online, so no query stays paused on a stale "offline".

  Features: native-app-shell

- b3ee22b: `NotificationsPage`'s section headers stick under the native header instead of under the status bar. Under a large-title header the list runs beneath the header (iOS insets its rows), and FlashList pinned the current header at the list's top, y = 0. It now passes FlashList `stickyHeaderConfig.offset`: by default on iOS the safe area's top plus the compact navigation bar (44 pt, 54 pt from iOS 26; `defaultStickyHeaderOffset`, `iosCompactNavigationBarHeight`), 0 elsewhere; `stickyHeaderOffset` sets it (the safe area's top without a header). React Native's `SectionList` fallback has no offset, so there the headers scroll with their rows when the offset isn't 0. `GenesisListProps` gains `stickyHeaderConfig`.

  Features: native-layouts

### Patch Changes

- 1718648: `FormFocus` no longer uses `InputAccessoryView`, which React Native 0.88 deprecates (Metro warned on every form with a number or phone question). While a keyboard with no return key is up (iOS's number and phone pads before iOS 26), the app's keyboard toolbar (`keyboardToolbar` on `GenesisNativeApp`, react-native-keyboard-controller's `KeyboardToolbar`) shows with its arrows hidden and a done button that says Next (or Send) and moves the step on; iOS 26 shows the pad's return key itself, so the bar stays away there and on every keyboard that has one. Without a toolbar, the form's own Next button stays in view. Next keeps the keyboard up (it calls `preventDefault()` on the done event); Send closes it. `KeyboardToolbarProps` in genesis-ui-native now lists the optional `showArrows`, `doneText` and `onDoneCallback` Genesis may pass (all `KeyboardToolbar`'s own). `FormNativeContextValue` gains `needsKeysBar` and `setNeedsKeysBar`: a hand-built value (a test's mock) needs them.

  `InboxPage` lets a tap in its header land while the keyboard is up (`keyboardShouldPersistTaps="handled"`): the idea board's first tap on "Suggest" pressed nothing and only closed the keyboard.

  Features: forms-native, inbox-thread

- 3e596b9: `SettingsPage` looks like the system Settings app on iOS (inset grouped). Section headers were a full-width gray band with a rule under it. Now a header is an uppercase footnote caption in `secondaryLabel` on the grouped background, inset so it lines up with the cell text. VoiceOver reads the title as written, and the header scales with the footnote Dynamic Type style. Cells sit in groups on `secondarySystemGroupedBackground` with a 16pt margin and UIKit's corner radius (10pt, or 26pt from iOS 26). Hairline `separator` lines run between cells only. They start at the cell text, past any leading icon, and follow right-to-left layouts. The footnote under a group is `secondaryLabel`. On Android a header is a Material subheader in the theme's primary color, with no band. Colors come from `useThemeRoles` and the theme, so they follow dark mode. The slots API is unchanged.
- 0b8987b: Fixes from an end-to-end run of the native starter on an iOS 26 simulator.

  - `NotificationsPage`: the empty state sat under the large-title header, behind the Dynamic Island. It is now in a scroll view with `contentInsetAdjustmentBehavior="automatic"`, as the list is, so iOS insets it below the header and above the tab bar; pull to refresh works on it too.
  - `SettingsSubPage`: with `KeyboardToolbar`, the toolbar floated about a tab bar's height above the keyboard, and with the keyboard closed it showed above the tab bar. The keyboard-scroll layout no longer pads its bottom edge (the toolbar sticks to the keyboard from that edge); the scroll view's automatic inset keeps the last field clear instead.
  - Starter: `genesis-starter://check-in?gym=hilltop`, the link the check-in screen documents, opened Home. The link map now has `/check-in` (with `features.checkIn` on).

- 0fd477c: Fixes from running the native starter on an iOS simulator.

  **PKCE uses S256 on React Native.** Hermes has no `crypto.subtle`, so supabase-js sent the PKCE challenge as `plain` (the verifier itself), and with no `crypto` at all made the verifier with `Math.random`. `createGenesisSupabase` takes `crypto` (`import * as ExpoCrypto from "expo-crypto"`), which installs `crypto.getRandomValues` and a SHA-256-only `crypto.subtle.digest` on `globalThis` from it, never replacing real WebCrypto. A PKCE client made with neither, on any platform, throws in development and logs an error in a release build. With the polyfill in place, `auth.getClaims()` always has the server check the token (`getUser`), because the polyfill can hash but can't verify a signature; supabase-js would otherwise try to verify asymmetric tokens locally and throw. `installWebCrypto`, `hasPkceCrypto`, `assertPkceCrypto` and `isDigestOnlyPolyfill` are on `/native`.

  **The keyboard moves the form.** `GenesisNativeApp` takes `keyboardProvider` (react-native-keyboard-controller's `KeyboardProvider`) and mounts it once around the app. `keyboardScroll`'s `KeyboardAwareScrollView` did nothing without it. It is read once, so an inline wrapper can't remount the app. In development, `keyboardScroll` without `keyboardProvider` logs an error. The ui-native `KeyboardScrollProvider` docs say it needs `KeyboardProvider` above it.

  **Genesis components are styled under NativeWind v4.** New `presets/nativewind` (`genesisNativewindPreset`): the Tailwind v3 preset plus the theme's role colors (`bg-primary`, `border-input`, `text-foreground`, `text-destructive`…, as `hsl(var(--…))`) and their variables, light on `:root` and dark under `prefers-color-scheme: dark`, with the same values as `themes/genesis.css`. With `presets/tailwind` alone, none of those classes were generated and `--radius` was never declared, so inputs had black square borders and primary buttons had no fill. The CLI's scaffolder writes the new preset into an Expo app's Tailwind config.

- 697c18c: `GenesisNativeApp` mounts `NativeToastProvider` around the screens, so `useToast()` from genesis-ui-native works on every screen without the app mounting one (it threw before). Toasts sit at the top by default, where a tab bar can't cover them; `toast={{ position, disableAnimation }}` places them and `toast={null}` leaves the provider to the app. A top toast now sits below the safe area's top (the status bar and the Dynamic Island) when a `SafeAreaProvider` is above it. `FeedbackForm` takes `sentAlert={false}` to leave the confirmation to `onSent`; the starter shows a toast after a sent report.

  Features: native-app-shell, native-components, support-feedback

## 2.2.0

### Minor Changes

- 47b13ff: The Account block, native first. `@marktiderman/genesis-supabase/native` adds `signInWithApple(client, AppleAuthentication, { digest })` (availability check, name and email scopes, a SHA-256 hashed nonce, `signInWithIdToken`; closing Apple's sheet is `{ canceled: true }`, and the full name Apple shares on the first sign-in comes back to save) and `completeOAuthRedirect(client, url)` (exchanges a PKCE `code`, or returns the redirect's `error` as a typed `GenesisAuthError`). `@marktiderman/genesis-supabase` adds `deleteMyAccount(client)` and ships `migrations/0001_genesis_account_deletion.sql` (`public.delete_my_account()`, security definer, `search_path = ''`, executable by `authenticated` only) with a pgTAP test. `@marktiderman/genesis-ui-native` adds `appleProvider()` and `AppleSignInButton`, which draw Apple's own button on iOS and nothing elsewhere; `AuthScreen` skips `null` providers and `SocialAuthProvider` takes a `render` for a provider's own button.

  Features: account

### Patch Changes

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

- a38a00f: Fixes found by building the native starter (`apps/genesis-rn-starter`, Expo SDK 58 / React Native 0.88) on the packages.

  - `@marktiderman/genesis-ui-native`: `AppleButtonModuleLike`'s button now types `style` as a `ViewStyle`, so the real `expo-apple-authentication` module can be passed to `appleProvider` and `AppleSignInButton` under strict TypeScript (with `unknown` it was refused). `ScreenContainer` compiles against React Native 0.88, which dropped `translucent` and `backgroundColor` from `StatusBar`'s props (Android is always edge to edge there); they are still passed for earlier versions. `NativeTextarea`'s `rows` is documented (the generated docs showed React Native's Android-only `rows` description for it).
  - `@marktiderman/genesis-design-system`: `./presets/*` and `./providers/native` gain a `default` export condition, so a CommonJS loader (NativeWind's Tailwind v3 config loader, Metro) resolves them; before, `tailwind.config` importing `presets/tailwind` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  - `@marktiderman/genesis-cli`: the doctor's `store-readiness` rule counts export compliance and the privacy manifest as set when the Expo config lists this package's own config plugin, which sets them (unless its `exportCompliance` / `privacyManifest` option is `false`, and the manifest only when a dependency needs one). Apps on `withGenesis()` no longer get those two warnings. In a dynamic config, only `withGenesis(` or the package's name outside an `import` / `require` counts as listing the plugin.
  - `@marktiderman/genesis-supabase`: the README had merge-conflict markers between the Account section and "Choices, and why"; both sections are kept.

  Features: native-starter

## 2.1.0

### Minor Changes

- 7ae53e5: From review: `AuthForm`'s return key on the email field moves focus to the password field (React Native doesn't do it by itself) and keeps the keyboard open, and both fields carry AutoFill hints (`textContentType`, `autoComplete`). `AuthScreen` keeps the form above the keyboard and, in development on iOS, warns when a third-party provider is offered without Sign in with Apple (App Store Review Guideline 4.8). `SettingsPage` takes its colors from theme roles: on iOS, inset rounded cells on the grouped background, like the Settings app. `ScreenContainer` takes a `style`. `NotificationsPage` no longer builds a new separator component on every render.
- ddac1fc: `AuthScreen`: a whole sign-in screen from props, assembling `AuthBranding`, `SocialAuthRow`, `AuthForm` and `ForgotPasswordLink` (shown for password sign-in when `onForgotPassword` is set), plus a footer. Each part (`branding`, `social`, `form`, `footer`) is a slot. `NotificationsPage` takes `slots` and `slotProps` for `sectionHeader`, `row` and `empty`; the `emptyState` prop still works. Defaults render as before.

  Features: native-components

- 2657c06: `SettingsPage` takes `slots` and `slotProps`, the same contract as web patterns (from `@marktiderman/genesis-core/slots`). Replace or drop (`null`) any of `sectionHeader`, `row`, `footnote` and `dangerousActions`; your component receives exactly the props the default would (`SettingsPageSlotMap`), and `slotProps` feeds a default part more props. The rendered output and test ids are unchanged.

  Features: native-components

- d7b0389: The native `GenesisThemeProvider` takes `syncNativeAppearance`: on the root provider it passes an in-app light or dark choice to `Appearance.setColorScheme`, so iOS system colors and native controls follow it, not only Genesis tokens; "system" and unmounting hand it back to the OS ("unspecified", or "auto" on React Native 0.87+). The react-native-keyboard-controller peer range starts at 1.11 (KeyboardAwareScrollView). `KeyboardScrollProvider` lets an app supply react-native-keyboard-controller's `KeyboardAwareScrollView` once; `AuthScreen` and `SettingsSubPage` use it, and fall back to `KeyboardAvoidingView` without it. `NotificationsPage` memoizes its date grouping. The genesis-supabase README explains the Keychain storage choice, the URL polyfill and where to call `refreshWhileActive`.

  Features: design-tokens, native-layouts, supabase-kit

- a154019: Theme roles, from review: off iOS, `destructive` is a text-safe red in both schemes (the dark token was a background red at about 2:1); dark-mode `surface` is raised above `groupedBackground` the way iOS grouped lists are (they were inverted); the default `tint` comes from the Genesis brand preset instead of a literal. `resolveThemeRoles({ androidDynamic })` and `useThemeRoles({ materialYou })` use Material You dynamic colors on Android 12+.

  Features: theme-roles

- bd07203: Theme roles: twelve colors named for what they are for (`background`, `groupedBackground`, `surface`, `label`, `secondaryLabel`, `tertiaryLabel`, `separator`, `fill`, `tint`, `destructive`, `success`, `warning`), resolved per platform. `resolveThemeRoles({ target, scheme, platformColor, tint })` in the design system gives the theme's CSS variables on web, iOS system colors through `PlatformColor` on iOS, and the Genesis token for the current scheme on Android, so Android dark mode follows the system. A brand sets `tint`. The design system has no React Native import; ui-native adds `useThemeRoles({ tint })`, which reads the platform and color scheme itself.

  Features: theme-roles

### Patch Changes

- e91765c: From review: `keychainStorage` queues reads with writes (a read could see the old generation disappear mid-read), lets every chunk write settle before reporting a failure (so a late write can't outlive the sweep), and removes chunks before the manifest. `refreshWhileActive`'s unsubscribe also stops auto-refresh. `wipeSessionOnReinstall` removes every indexed PKCE flow verifier and the index. `defineFeatures` skips schema-invalid entries in its relation checks instead of throwing, and `statusOn` treats `node` in `apps` as the `server` platform. `SettingsPage` rows are transparent so the theme-role cell color shows.

  Features: supabase-kit, feature-registry, native-components

## 2.0.3

### Patch Changes

- 1a9d899: Release-pipeline only, no code changes. This version is published by CI through npm Trusted Publishing, which now requires the `npm` GitHub environment (main only).

## 2.0.2

### Patch Changes

- 7cfc703: First publish from the new public repo. No functional changes — every package's current version already matches what's published from the predecessor repo, so this bump is required before this repo's release workflow can publish anything at all (npm rejects republishing an existing version).

## 2.0.1

### Patch Changes

- 88ad204: Fix Badge `success`/`warning`/`info` status text failing WCAG AA contrast. The variants rendered same-hue text on a tinted chip (e.g. `text-success` on `bg-success/15`), measuring ~1.9–3.1:1 against the 4.5:1 AA floor. Native now uses the AA-safe darker status token (`text-success-dark` etc. → ~6.3–7.4:1); web uses the matching 700-weight ramp (`text-emerald-700`/`text-amber-700`/`text-blue-700`, with `dark:` 300 stops for the darkened chip). Chip backgrounds and all other variants are unchanged.
- 38d08d3: Design-system self-consumption (dogfooding) cleanups.
  - **design-system:** the React Native theme (`nativeThemeLight` / `nativeThemeDark`) is now generated from the canonical DTCG themes (`tokens/dtcg/themes/{light,dark}.json`) via a Style-Dictionary target, instead of a hand-rolled palette hardcoded in `providers/native.ts`. Behavior-preserving — the resolved light/dark surface colors are byte-identical to the previous literals. The `brand-genesis` neutral ramp drift (stops `300` and `900`) is corrected to match the canonical DTCG source, so there is one palette.
  - **ui-native:** `Input`, `Textarea`, and the nav-bar search field now default `placeholderTextColor` to the design-system `nativeColors.neutral[400]` token instead of a hardcoded hex (input/textarea unchanged visually; the nav-bar moves off an off-palette gray onto the zinc scale).

- e37afdd: Declare `className` on `NativeTextProps`. `NativeText` already applies `className` internally, but its public type inherited the prop from react-native's `TextProps` via NativeWind's global augmentation, which does not resolve across the RN 0.85 / nativewind 4.2 / react-native-css-interop 0.2 type matrix — so consumers type-checking against the real react-native types saw `Property 'className' does not exist on NativeTextProps`. The prop is now declared explicitly, matching the implementation and every other ui-native primitive (Button, Tooltip, ChipGroup).
- Updated dependencies [38d08d3]
- Updated dependencies [1e56f68]
  - @marktiderman/genesis-design-system@1.1.0

## 2.0.0

### Major Changes

- e972635: Rename the npm scope from the old pre-public scope to `@marktiderman` across all Genesis packages: `genesis-*` → `@marktiderman/genesis-*`.

  The data-layer package additionally shortens its name to `@marktiderman/genesis-switchboard` (dropping the redundant `data-` prefix while keeping the `genesis-` family prefix consistent with the other packages).

  **Breaking change.** Consumers must update every import specifier and dependency entry (e.g. `genesis-ui` → `@marktiderman/genesis-ui`, and `genesis-data-switchboard` → `@marktiderman/genesis-switchboard`). Per npm best practice the previous pre-public-scope names will be `npm deprecate`d with a pointer to the new names once the `@marktiderman/*` packages are published. The legacy `genesis@2.0.0` umbrella package under the old scope is unaffected (separate lineage).

### Minor Changes

- 54a8afb: Add tokens-only layout primitives (`Stack`, `Inline`, `Box`, `Grid`) plus the `spaceScale` token and `spacingClass()` resolver. Promoted from the Acme incubator (PRD-46 WC-A4); primitives own all gap/padding/margin via the spacing token so spacing stays consistent and never hard-codes a px value.

### Patch Changes

- 41cd84d: Mark `react-native` as an optional peer dependency (`peerDependenciesMeta`), matching the other React Native peers (nativewind, gesture-handler, reanimated, …) that are already optional here. This makes the `@marktiderman/genesis` umbrella's promise true: a pure-web consumer that pulls `genesis-ui-native` transitively no longer gets an unmet `react-native` peer warning at install. Native apps are unaffected — they depend on `react-native` directly at their app root. A new web-install smoke test (`packages/genesis/scripts/smoke-web-install.mjs`) packs the umbrella + granular deps and asserts the web-only install is react-native-clean.
- Updated dependencies [e972635]
  - @marktiderman/genesis-core@1.0.0
  - @marktiderman/genesis-design-system@1.0.0

## 1.1.0

### Minor Changes

- a4d4872: feat(theme): unified `<GenesisThemeProvider>` + `useTheme()` API across web and native (PRD-07 A2b).

  `useTheme()` returns the same TypeScript shape on web + native:
  `{ brand, mode, resolvedMode, setMode, tokens }`. Build-time codegen via the
  `tailwindFromBrand` (web) / `themeFromBrand` (native) factories shipped in
  A4.0 (the cross-platform-factory spike) feeds the provider's runtime layer; consumers no
  longer maintain three parallel theme mechanisms.

  This PR ships the unified API ADDITIVELY behind the `GENESIS_THEME_V2` env
  flag. The legacy v1 native provider at
  `@marktiderman/genesis-design-system/providers/native` continues to work — it
  will be removed in the final commit of A2b once visual parity is confirmed
  on `apps/sample` + `apps/sample-native`, OR in a follow-up `G-PR-3b` PR if
  parity is deferred. See `docs/MIGRATION.md` `v0.2.x → v0.3.0`.

  Ships in v1.1.0.

### Patch Changes

- 0f73e78: fix: critical bug fixes for Accordion / Slider / Drawer / Combobox / Toast primitives + surface gaps from Acme migration.
  - `accordion`: replace NativeWind-incompatible `last:` Tailwind variant with an `isLast` prop, AND auto-detect the trailing item via `Children.toArray()` so consumers don't have to thread the prop manually. Manual `isLast` always wins over auto-detection.
  - `slider` / `range-slider`: wrap `PanResponder` in `useMemo` keyed on `value` / `width` / `min` / `max` / `step` / `onChange` so closures never read stale mount-time values; fix `snap()` math so non-zero `min` produces the correct discrete grid.
  - `drawer`: same `useMemo` pattern keyed on `side` / `drawerWidth` / `onOpenChange` so swipe-to-dismiss threshold + direction track the latest props.
  - `combobox`: wrap option list in `<ScrollView keyboardShouldPersistTaps="handled">` so long lists scroll; close the dropdown on input blur (with a 120ms delay so option-press still registers) so users can dismiss without selecting.
  - `toast`: hold the latest `onDismiss` in a ref so the auto-dismiss `setTimeout` doesn't re-arm on every parent render.
  - `exports`: add `./utils` subpath so consumers can `import { cn } from "@marktiderman/genesis-ui-native/utils"` without pulling the components barrel.
  - `types`: re-export `TextPreset` as a named type alongside `NativeText` / `NativeTextProps`.

- Updated dependencies [0f73e78]
- Updated dependencies [a4d4872]
  - @marktiderman/genesis-design-system@0.2.2

## 1.0.1

### Patch Changes

- Critical bug fixes for Accordion / Slider / Drawer / Combobox / Toast
  primitives, surface gaps surfaced by the Acme migration, and a new
  `./utils` subpath export, and a `TextPreset` named type re-export.
  No breaking API changes; the new `./utils` and `TextPreset` exports
  are additive, and all bug fixes are drop-in compatible with 1.0.0
  call sites.

  **Component fixes:**
  - `accordion`: replace NativeWind-incompatible `last:` Tailwind variant
    with an `isLast` prop, AND auto-detect the trailing item via
    `Children.toArray()` so consumers don't need to thread the prop
    manually. Manual `isLast` always wins over auto-detection.
  - `slider` / `range-slider`: wrap `PanResponder` in `useMemo` keyed on
    `value` / `width` / `min` / `max` / `step` / `onChange` so the
    gesture handler closures never read stale mount-time values; fix
    `snap()` math so non-zero `min` produces the correct discrete
    grid (`Math.round((clamped - min) / step) * step + min`).
  - `drawer`: same `useMemo` pattern keyed on
    `side` / `drawerWidth` / `onOpenChange` so swipe-to-dismiss
    threshold + direction track the latest props.
  - `combobox`: wrap option list in
    `<ScrollView keyboardShouldPersistTaps="handled">` so long lists
    scroll instead of clipping; close the dropdown on input blur (with
    a 120ms delay so option-press still registers) so users can dismiss
    without selecting.
  - `toast`: hold the latest `onDismiss` in a ref so the auto-dismiss
    `setTimeout` doesn't re-arm on every parent render — the timer now
    runs to completion based on the toast's `duration` alone.

  **Surface gaps (Acme migration follow-ups):**
  - Re-export `TextPreset` as a named type alongside `NativeText` /
    `NativeTextProps`. Defined as `NonNullable<NativeTextProps["preset"]>`
    so it stays single-source-of-truth on the cva variants.
  - Add `./utils` subpath export so consumers can
    `import { cn } from "@marktiderman/genesis-ui-native/utils"` without
    pulling the entire components barrel (and react-native) into
    util-only consumer trees (e.g. brand packages).

  **Install:**

  ```sh
  pnpm add @marktiderman/genesis-ui-native@1.0.1
  ```

## 1.0.0

### Major Changes

- 00b2743: First publish from the canonical `marktiderman/genesis` repo. Bumps the existing `@marktiderman/genesis-*` v0.1.0 packages (originally published 2026-04 from prior fork repos PRD-07 Phase A6 retires) to v0.1.1 with the canonical genesis-repo content. Consumers install with zero auth: `pnpm add @marktiderman/genesis-ui-native`. Each publish emits a Sigstore provenance attestation linking the tarball back to this commit + the workflow run via OIDC. Publishing infrastructure: Changesets + `changesets/action` + `.github/workflows/release.yml` using **OIDC Trusted Publishing** (no NPM_TOKEN secret; short-lived token issued at publish time via GitHub Actions identity).
- Updated dependencies [5020d70]
- Updated dependencies [210aa8f]
- Updated dependencies [00b2743]
  - @marktiderman/genesis-design-system@0.2.0
  - @marktiderman/genesis-core@0.1.1
