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

The starter uses the Genesis packages from this monorepo (`workspace:^`). Most are on npm
(`@marktiderman/genesis-supabase` from 0.1.1), but `@marktiderman/genesis-native`, the app shell,
isn't published yet. Until it is, make new apps inside the monorepo:

1. Copy the folder: `cp -R apps/genesis-rn-starter apps/my-app`, and set `"name"` in its
   `package.json`.
2. In `starter.config.ts`, set `app`: the name, slug, URL scheme and bundle id. Turn off what you
   don't want (below).
3. In `genesis.config.json`, set `links.hosts` to your web domain (or delete the `links` block for
   no universal links).
4. `cp .env.example .env` and fill in your Supabase project's URL and publishable key.
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
| `keyboardScroll` | The focused field stays above the keyboard on form screens. | `KeyboardAvoidingView` fallback. |
| `deepLinks` | `scheme://` and universal links open their screen, after sign-in if needed (`normalizeLink`). | Every link opens `/`. Universal links still open the app until you also delete the `links` block in `genesis.config.json`. |
| `wipeSessionOnReinstall` | A reinstalled iOS app starts signed out (the Keychain outlives an uninstall). | The last session comes back after a reinstall. |
| `refreshWhileActive` | The session refreshes only while the app is in front. | supabase-js's own timer runs in the background too. |

A config with both sign-in methods off fails at start-up. Apple's button only shows on iOS, so
with `emailSignIn` off `app.config.ts` builds for iOS only.

Switches that only change JavaScript don't change the build's fingerprint (`.fingerprintignore`
leaves `starter.config.ts` out; what it means for the native build is in the evaluated config), so
`eas update` still reaches installed builds after you turn one off. `appleSignIn` and
`emailSignIn` change the native build and its runtime version.

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
- **Migrations:** `supabase/migrations/20261024000000_genesis_account_deletion.sql` is
  `@marktiderman/genesis-supabase`'s `migrations/0001_genesis_account_deletion.sql`, copied under a
  timestamped name as its README says, with its pgTAP test in `supabase/tests/database/`
  (`supabase test db`). A test fails if either drifts from the package's copy. Give every table of
  yours that holds a person's data a foreign key to `auth.users(id)` with `on delete cascade`, or
  deleting their account is refused.
- **Auth providers:** email works with Supabase's defaults (confirmation on: sign-up asks the
  person to confirm, then sign in; the confirmation link opens `site_url`, not the app). For Apple, enable the Apple provider with the bundle ids of all
  three variants as client ids; `supabase/config.toml` does this for a local stack.

## Checks

```bash
pnpm --filter genesis-rn-starter test        # layout length, toggles, copy catalog, migration copies
pnpm --filter genesis-rn-starter typecheck
pnpm --filter genesis-rn-starter lint
pnpm --filter genesis-rn-starter doctor      # genesis doctor: native and supabase packs
pnpm --filter genesis-rn-starter export:ios  # bundles the app, no device needed
```

`.maestro/` has a smoke flow for a development build.

## Not covered yet

- **Revoking Sign in with Apple tokens on account deletion. Required before you ship to the App
  Store with the defaults.** With `appleSignIn` and `accountDeletion` both on, App Review expects
  deletion to revoke the person's Apple tokens, which takes a server step the packages don't ship
  yet (the `apple-token-revocation` feature in the repo's `features.ts`); see "Not covered yet" in
  [`@marktiderman/genesis-supabase`](../../packages/supabase/README.md#not-covered-yet).
  `src/lib/auth.ts` marks where the authorization code would be sent.
- **`links.hosts` is `example.com`.** Replace it (step 3 above) before a release build, or the
  build ships associated domains that never verify.
- **Notifications have no source.** `src/lib/notifications.ts` returns an empty list; point its
  `queryFn` at yours. Push isn't part of the starter until the push block ships.
- **Genesis's own default strings are English.** The starter's copy is all in `src/copy.ts`, but a
  few labels inside the Genesis layouts ("Email", "Password", "or", the boot and fatal screens)
  have no override yet; that is the `i18n` feature in the repo's `features.ts`.
