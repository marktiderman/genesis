# Genesis RN starter

A new Expo app that runs on day one: sign-in with email and Apple, a Settings tab with sign-out and
in-app account deletion, a Notifications tab, a persisted query cache, deep links and a Keychain
session that survives offline starts and is wiped after a reinstall. Every universal feature the
Genesis packages ship is on, and each one is turned off in one line of
[`starter.config.ts`](./starter.config.ts).

- Expo SDK 58: React Native 0.88, React 19.3, expo-router 58, the New Architecture (the only one
  since SDK 55), the React Compiler, typed routes and the platform's own tab bar (`NativeTabs`).
  TypeScript strict.
- The root layout is a few lines: [`<GenesisNativeApp>`](../../packages/native/README.md) owns the
  splash and boot steps, errors and the fatal screen, theme, data, the session and held deep links.
  A test fails if [`src/app/_layout.tsx`](./src/app/_layout.tsx) grows past 30 lines.
- Every screen renders a Genesis layout (`AuthScreen`, `SettingsPage`, `NotificationsPage`,
  `ScreenContainer`) under the navigator's own header. `genesis doctor` enforces it.
- Every string a person sees is in [`src/copy.ts`](./src/copy.ts), one typed catalog. A test fails
  on JSX text or a literal label in `src/app`.

## Create an app from it

```bash
npx @marktiderman/genesis-cli init my-app --template native --bundle-id com.acme.myapp
```

makes `./my-app` from this folder, outside the monorepo: the files an app owns (not this
starter's monorepo-only test), renamed (name, slug, scheme, bundle id), with each `workspace:^`
set to the published version released with the CLI, the plain Metro config, the pnpm settings
Metro needs, and the eas, maestro and ci templates. It records its blocks and the files Genesis
owns in `genesis.lock.json`, so later `genesis add <block>`, `genesis migrate` and `genesis
upgrade` work in it (see the [CLI's README](../../packages/genesis-cli/README.md#a-new-native-app)).
Then follow steps 3 to 5 below, and `pnpm install`.

It needs a CLI release that has `--template` and every package the starter uses on npm at the
versions that CLI was released with; check with `npm view @marktiderman/genesis-native versions`.
Until then, or to work on Genesis itself, make new apps inside the monorepo:

1. Copy the folder: `cp -R apps/genesis-rn-starter apps/my-app`, and set `"name"` in its
   `package.json`.
2. In `starter.config.ts`, set `app`: the name, slug, URL scheme and bundle id. Turn off what you
   don't want (below).
3. In `genesis.config.json`, set `links.hosts` to your web domain (or delete the `links` block for
   no universal links).
4. `cp .env.example .env` and fill in your Supabase project's URL and publishable key.
   For EAS (builds, previews, updates), run `eas init` and put the project id in
   `starter.config.ts` `app.easProjectId`; see [Releasing](#releasing).
5. Apply `supabase/migrations` to your project (`supabase db push`, or `supabase start` for a
   local stack) and enable the providers you use in Supabase Auth (below).
6. `pnpm install`, `pnpm build:packages` at the root, then `pnpm --filter my-app ios`.

Once `genesis-native` is on npm, an app outside the monorepo is the same folder with each
`workspace:^` replaced by a version range and `metro.config.js` reduced to
`withNativeWind(getDefaultConfig(__dirname), { input: "./global.css" })` (the rest of it watches
the workspace packages and keeps one copy of React, React Native and NativeWind's runtime).

In this monorepo the root `pnpm-workspace.yaml` pins `react`, `react-dom`, `@types/react` and
`react-native` to the versions Expo SDK 58 needs, for every package: move them with the SDK.

## Turning features off

Each line of `features` in `starter.config.ts` is one feature, `true` by default:

| Line | What it is | Off means |
| --- | --- | --- |
| `emailSignIn` | Email and password sign-in and sign-up on `AuthScreen`. | No form; Apple only, so the app builds for iOS only (`platforms`). |
| `appleSignIn` | Sign in with Apple (`signInWithApple`, `appleProvider`), iOS only. | No Apple button; `ios.usesAppleSignIn` off. |
| `accountDeletion` | "Delete account" in Settings (`deleteMyAccount`). | No delete row. App Review requires it for apps with accounts. |
| `notifications` | The Notifications tab (`NotificationsPage`). | The tab is hidden, its route redirects home and links to it open `/`. Drop `/notifications` from `links.paths` in `genesis.config.json` too. |
| `queryPersistence` | The `persistedQueryKeys` queries (`src/lib/app.ts`) saved to the phone for 24 hours, per user. | Cache in memory only. |
| `queryLifecycle` | Refetch when the app comes to the front; follow the network (AppState + NetInfo). | Queries refetch only on mount. |
| `keyboardScroll` | The focused field stays above the keyboard on form screens, with the previous / next / done bar (`KeyboardToolbar`) above it. | `KeyboardAvoidingView` fallback, no bar. |
| `deepLinks` | `scheme://` and universal links open their screen, after sign-in if needed (`normalizeLink`). | Every link opens `/`. Universal links still open the app until you also delete the `links` block in `genesis.config.json`. |
| `wipeSessionOnReinstall` | A reinstalled iOS app starts signed out (the Keychain outlives an uninstall). | The last session comes back after a reinstall. |
| `refreshWhileActive` | The session refreshes only while the app is in front. | supabase-js's own timer runs in the background too. |
| `push` | The push block (`createPush`, `src/lib/push.ts`): this phone's push token on sign-in once permission is granted, off on sign-out; Settings > Notifications (`NotificationSettings`: categories, quiet hours, previews); the soft prompt, offered when the Notifications tab opens, never at launch; taps open their screen through the link map. Needs an EAS project id for a token. | No token, no prompt, no Notifications row in Settings; expo-notifications stays in the build. |
| `updates` | The updates block (`createUpdates`, `src/lib/updates.ts`): force upgrade and maintenance from the `app_release_policy` row, the update banner (never reloads mid sign-in or mid deletion: `useBlockReload`), what's new, and the version signature in Settings > About. | No blocking screens, banner or notes; About shows the version and build from `expo-application`. |
| `observability` | The observability block (`src/lib/observability.ts`): every error the shell catches, route breadcrumbs and timings, the user's id and the typed events in `events`, to Sentry when `EXPO_PUBLIC_SENTRY_DSN` is set and to the console in development, scrubbed of emails, tokens and query strings on the phone. | Errors only reach `console` (LogBox in development). |
| `devtools` | The devtools overlay (`src/lib/devtools.ts`) in development and preview builds: a three-finger hold, "Open devtools" in the dev menu or Settings > About > Developer tools open a sheet with the version signature, channel switch, user id, blocks, flags and recent errors. Never in a production bundle. | No overlay and no Settings row. |

A config with both sign-in methods off fails at start-up. Apple's button only shows on iOS, so
with `emailSignIn` off `app.config.ts` builds for iOS only.

Switches that only change JavaScript (`updates`, `push`, `observability` and `devtools` included) don't change the build's fingerprint (`.fingerprintignore`
leaves `starter.config.ts` out; what it means for the native build is in the evaluated config), so
`eas update` still reaches installed builds after you turn one off. `appleSignIn` and
`emailSignIn` change the native build and its runtime version.

## Native modules

`src/lib/native-modules.ts` hands Genesis components the native modules the starter installs
(`GenesisNativeApp`'s `modules`): FlashList v2 for long lists, expo-image for avatars and pictures,
Reanimated 4 for toasts, drawers and skeletons, Liquid Glass (expo-glass-effect) for toasts,
the update banner, popovers and menus on iOS 26, SF Symbols (expo-symbols) for `NativeIcon` on
iOS with lucide on Android, and the @expo/ui SwiftUI / Jetpack Compose date picker. Delete a line,
and its package from `package.json`, to fall back to plain React Native for that one. FlashList v2
needs the New Architecture (the starter's default). Liquid Glass needs a build made with Xcode 26
and iOS 26 on the device; otherwise the surfaces stay solid.

## App variants

`app.config.ts` lists the Genesis config plugin (`withGenesis()`, from `@marktiderman/genesis-cli`).
`APP_VARIANT` picks the build:

| `APP_VARIANT` | Name | Bundle id / package |
| --- | --- | --- |
| `development` | Genesis Starter (Dev) | `com.example.genesisstarter.dev` |
| `preview` | Genesis Starter (Preview) | `com.example.genesisstarter.preview` |
| unset or `production` | Genesis Starter | `com.example.genesisstarter` |

All three install side by side. Any other value fails the build. Set it per EAS environment so
builds, updates and fingerprints all see it; see the
[plugin's README](../../packages/genesis-cli/README.md#setting-app_variant). The plugin also adds
the associated domains and Android app links from `genesis.config.json`'s `links`, the privacy
manifest for the packages installed, export compliance and the fingerprint runtime version.

## Supabase

- **Keys:** `.env` holds `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, the
  publishable key only (everything in the bundle can be read off the phone). A missing value shows
  the fatal screen at start-up, naming the variable (the first boot step checks it).
- **Account deletion:** a refusal is shown in the catalog's words by its code: sign in again for
  `GA002` (recent sign-in required) and `42501` (MFA step-up), contact support for `GA001` (your
  hook refused) and `23503` (data or Storage files still point at the login).
- **Client:** `src/lib/supabase.ts` makes the one client with `createGenesisSupabase`, the session
  in the Keychain (`keychainStorage`), `wipeSessionOnReinstall` before the first read and
  `refreshWhileActive`.
- **Migrations:** `supabase/migrations/20261024000000_genesis_account_deletion.sql` and
  `20261024000100_genesis_app_release_policy.sql` are `@marktiderman/genesis-supabase`'s
  `migrations/0001_genesis_account_deletion.sql` and `0002_genesis_app_release_policy.sql`, copied
  under timestamped names as its README says, with their pgTAP tests in `supabase/tests/database/`
  (`supabase test db`). A test fails if any of them drifts from the package's copy. The updates
  block reads the release policy row (`app_id` `default`) with the publishable key; write it with
  the SQL editor or the service role. Give every table of
  yours that holds a person's data a foreign key to `auth.users(id)` with `on delete cascade`, or
  deleting their account is refused.
- **Apple token revocation:** `supabase/migrations/20261024000200_genesis_apple_token_revocation.sql`
  and `supabase/functions/genesis-apple-revoke/` are the package's migration 0003 and its Edge
  Function, copied the same way (and drift-tested the same way). After an Apple sign-in,
  `src/lib/auth.ts` sends Apple's code to the function (`storeAppleToken`); deleting the account
  queues the token and `src/lib/account.ts` asks the function to revoke it
  (`deleteMyAccount(supabase, { revokeAppleTokens: true })`). `APPLE_CLIENT_IDS` must list all three
  bundle ids (`…`, `….dev`, `….preview`), or that variant's sign-ins keep no token (a console
  warning, `unknown_client`). Before a release, set the function's
  secrets, deploy it and schedule its retries: see "Revoking Apple's tokens" in
  [`@marktiderman/genesis-supabase`](../../packages/supabase/README.md#revoking-apples-tokens).
- **Push:** `supabase/migrations/20261024000400_genesis_push.sql` and
  `supabase/functions/genesis-push-send/` are the package's migration 0005 and its sender, copied and
  drift-tested the same way. The app only registers its token and edits preferences; your server
  (or a trigger) calls the function with `GENESIS_PUSH_SECRET`, and a schedule polls the receipts
  (which also keeps `push_receipts` to 30 days). Turn on enhanced push security in the Expo project
  and give the function `EXPO_ACCESS_TOKEN`, so a leaked token alone can't push to a phone:
  see "Push" in [`@marktiderman/genesis-supabase`](../../packages/supabase/README.md#push-the-push-block).
- **Auth providers:** email works with Supabase's defaults (confirmation on: sign-up asks the
  person to confirm, then sign in; the confirmation link opens `site_url`, not the app). For Apple, enable the Apple provider with the bundle ids of all
  three variants as client ids; `supabase/config.toml` does this for a local stack.

## Checks

```bash
pnpm --filter genesis-rn-starter test        # layout length, toggles, copy catalog, migration copies, EAS and Maestro files
pnpm --filter genesis-rn-starter typecheck
pnpm --filter genesis-rn-starter lint
pnpm --filter genesis-rn-starter doctor      # genesis doctor: native and supabase packs
pnpm --filter genesis-rn-starter export:ios  # bundles the app, no device needed
```

## Releasing

`eas.json` and `.eas/workflows/` are the release path on EAS Workflows, and `.maestro/` the smoke
flows; [docs/NATIVE-RELEASE.md](../../docs/NATIVE-RELEASE.md) has the setup and the safety rules.

| Workflow | When | What |
| --- | --- | --- |
| `pr-preview.yml` | each pull request | Repack a preview build with the same fingerprint (or build one), publish an update to `pr-<number>`, comment the install link and QR code. |
| `e2e.yml` | each pull request | The Maestro flows on an iOS simulator build. |
| `deploy-production.yml` | a pushed `v*.*.*` tag | A store build where native code changed, else an update to `production` at 10%; both after a person approves. |
| `rollout.yml` | by hand | Promote the staged update after a failed-launch check, or roll it back. |

Profiles: `development`, `preview` and `production` build the `APP_VARIANT` of the same name on
the channel of the same name; `e2e` is a development build for the simulator. Store ids in
`eas.json` are `REPLACE_WITH_…` placeholders. These files are copies of
[`templates/eas/`](../../templates/eas) and [`templates/maestro/`](../../templates/maestro); a test
fails if they drift.

## Not covered yet

- **Apple token revocation needs your Apple key before the App Store.** The code is in place (see
  Supabase above), but nothing is revoked until the `genesis-apple-revoke` function is deployed
  with your Sign in with Apple key, and it hasn't been tried against Apple with a real key yet.
- **`links.hosts` is `example.com`.** Replace it (step 3 above) before a release build, or the
  build ships associated domains that never verify.
- **Notifications have no source.** `src/lib/notifications.ts` returns an empty list; point its
  `queryFn` at yours.
- **Push hasn't reached a real phone.** With no EAS project there is no push token (Settings says
  so). After `eas init`, upload APNs and FCM credentials (`eas credentials`), deploy
  `genesis-push-send` with its secrets and schedule its receipts poll; delivery through Apple and
  Google hasn't been tried yet. Tap routing can be tried on a simulator with `xcrun simctl push`.
- **No EAS project.** `app.easProjectId` is empty, so builds ship with `updates.enabled: false` and
  no workflow can run until `eas init` (step 4 above). None of the workflows has been run against a
  real EAS account yet.
- **No channel picker.** Preview builds may switch to a pull request's channel
  (`useUpdates().channels.switchTo("pr-42")`), but no screen offers it yet.
- **Typing doesn't hold off a reload.** The sign-in form holds reloads only while a sign-in runs:
  `AuthScreen` doesn't report half-typed fields, so tapping "Restart" on the update banner mid-typing
  clears them.
- **Genesis's own default strings are English.** The starter's copy is all in `src/copy.ts`, but a
  few labels inside the Genesis layouts ("Email", "Password", "or", the boot and fatal screens)
  have no override yet; that is the `i18n` feature in the repo's `features.ts`.

## Observability and devtools

- **Sentry.** Set `EXPO_PUBLIC_SENTRY_DSN` in `.env` (and in each EAS environment). Without it,
  nothing is sent. `src/lib/observability.ts` starts Sentry at module scope; `src/lib/app.ts`
  imports it first, and the root layout is exported wrapped (`wrapRoot`). Release and dist come
  from the version signature, with the update id and channel as tags. Source map upload is
  optional: the commented plugin line in `app.config.ts` says what to turn on.
- **Events.** Add an event to `events` in `src/lib/observability.ts` before calling
  `observability?.track(…)`; props are closed lists, numbers or booleans, so no free text can be
  sent.
- **Devtools.** In a development build, open the overlay from the dev menu, Settings > About >
  Developer tools, or a three-finger hold. Preview builds (`.preview` bundle id, built or updated
  with `EXPO_PUBLIC_APP_VARIANT=preview`) get it too. A production bundle doesn't contain it:
  `npx expo export --platform ios` with `EXPO_PUBLIC_APP_VARIANT` unset or `production`, then
  search the bundle for `genesis-devtools`, finds nothing.
