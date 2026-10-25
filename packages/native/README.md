# @marktiderman/genesis-native

The native app shell for Genesis Expo apps. `<GenesisNativeApp>` owns
everything above your screens, so the root layout is a few lines:

```tsx
// app/_layout.tsx
import * as SplashScreen from "expo-splash-screen";
import { KeyboardAwareScrollView, KeyboardProvider } from "react-native-keyboard-controller";
import { Stack, router } from "expo-router";
import { GenesisNativeApp } from "@marktiderman/genesis-native";
import { brand, supabase, steps, persist, linkHold } from "../lib/app";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GenesisNativeApp brand={brand} supabase={supabase} splash={SplashScreen} steps={steps} persist={persist}
      keyboardProvider={KeyboardProvider} keyboardScroll={KeyboardAwareScrollView} links={{ hold: linkHold, onRelease: (path) => router.replace(path) }}>
      <Stack />
    </GenesisNativeApp>
  );
}
```

Pass the Supabase client in (make it with `createGenesisSupabase` from
`@marktiderman/genesis-supabase`); the shell never creates one.

## What it does

From the outside in:

1. **Last resort**: an error boundary above every provider, whose screen is
   built from React Native primitives only. If a provider or the shell's own
   set-up throws (a boot step id that clashes with the shell's, say), or the
   `fatal` slot itself throws, this is what shows, and "Try again" starts over.
2. **Theme**: `GenesisThemeProvider` with `syncNativeAppearance` on, so the
   root owns the platform color scheme.
3. **Keyboard**: your `keyboardProvider` (react-native-keyboard-controller's
   `KeyboardProvider`), mounted once, then `KeyboardScrollProvider` with your
   `keyboardScroll`, so Genesis form screens scroll the focused field into
   view. The scroll view does nothing without the provider: give both. In
   development, `keyboardScroll` without `keyboardProvider` logs an error.
   `keyboardToolbar` (`KeyboardToolbar`) adds the previous / next / done bar
   above the keyboard on Genesis's form layouts (`AuthScreen`,
   `SettingsSubPage`); it needs `keyboardScroll`, and logs an error in
   development without it.
   Then `modules`, the optional native modules your app installed
   (`GenesisModulesProvider` from `@marktiderman/genesis-ui-native`: FlashList,
   expo-image, Reanimated, expo-glass-effect, expo-symbols, a lucide icon
   set, the @expo/ui date picker). Each one you leave out falls back to plain
   React Native. Read once. The update banner is Liquid Glass on iOS 26 when
   `modules.glass` is given. See that package's README.
4. **Data**: `GenesisProvider` over `createSupabaseProvider(supabase)` (or
   your `provider`) and the shell's QueryClient.
5. **Boot**: your `steps` (wipe a session left by a reinstall, hydrate stores,
   load fonts), then reading the session, then restoring the query cache. The
   splash stays up until all of them finish. Each step runs once; a step that
   throws or passes its timeout (10 s, `bootOptions.timeoutMs`) shows the
   fatal screen, and "Try again" resumes at that step, showing the `boot` slot
   (a plain loading view) since the splash is gone. A step that timed out keeps
   running (stop it when its `signal` aborts): a retry waits for it to settle
   rather than running it twice at once, and counts it if it succeeded.
   `bootOptions.minimumMs` keeps a fast boot from flashing the splash.
6. **Errors**: a boundary around your screens and a global handler
   (`ErrorUtils`) show the `fatal` slot instead of letting the app close.
   "Try again" remounts the screens with fresh state. A second fatal error
   while the fatal screen is up goes to React Native's default handler, which
   ends the app so it restarts clean. Unhandled promise rejections never reach
   `ErrorUtils` in React Native, so on Hermes the shell installs its rejection
   tracker (`rejectionTracker`, `null` turns it off). Every block's `onError`
   (the observability block's, which reports to Sentry) and then your
   `onError` get all of these; a reporter that throws is ignored.
7. **Session, offline included**: `useSession()` is `loading`, `signedIn` or
   `signedOut`, with `userId` and `offline`. Offline with an expired access
   token, Supabase's `getSession()` can spend about 30 seconds on a refresh
   and then fail; the shell waits at most `sessionWaitMs` (5 s) and on a
   timeout or a network error carries on with the session stored on the
   phone (`offline: true`). Supabase's own events correct it once online.
8. **Query**: `networkMode: "offlineFirst"`: a query or mutation runs once,
   then its retries pause while NetInfo says offline and continue when the
   network is back, and stale queries refetch on reconnect. Offline, saved
   data stays on screen; a query with nothing saved is `pending` with
   `isPaused` (show "offline", not a spinner); a mutation fails at once (no
   retries by default). With `persist`, the query-key roots you list are saved to the
   phone for 24 hours (`maxAge`), discarded when `buster` (your app version)
   changes, and **scoped to the signed-in user**: the user id is part of what
   is saved, a cache saved for anyone else is deleted instead of restored, and
   the cache (in memory and on disk) is cleared whenever the user changes:
   sign-out, a session that ended while the app was closed, an account switch.

   ```ts
   import { persistQueries } from "@marktiderman/genesis-native/persist";
   export const persist = persistQueries({ storage: AsyncStorage, keys: ["clients", "me"], buster: version });
   ```

   Persistence is its own entry point: an app that saves nothing doesn't need
   `@tanstack/query-persist-client-core` or
   `@tanstack/query-async-storage-persister`. If you do, install them at the
   same version as your `@tanstack/react-query`: they pin `@tanstack/query-core`
   exactly, and two copies of it don't share a cache.

   Pass `lifecycle={{ appState: AppState, netInfo: NetInfo }}` to refetch on
   focus and follow the network.
9. **Auth gate**: a signed-out user sees the `signedOut` slot, or your
   screens when it is not set, for an expo-router layout that redirects:

   ```tsx
   // app/(app)/_layout.tsx
   const { status } = useSession();
   if (status === "signedOut") return <Redirect href="/sign-in" />;
   return <Stack />;
   ```

10. **Deep links**: `normalizeLink` maps an incoming link to an app path for
    expo-router's `+native-intent`. Hold every link you return; the shell
    follows a held link only when the user had to sign in first, and drops it
    when they were already signed in (the router opened it, so it doesn't
    navigate twice):

    ```ts
    // app/+native-intent.ts
    import { normalizeLink } from "@marktiderman/genesis-native";
    import { links, linkHold } from "../lib/app"; // linkHold = createLinkHold()

    export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
      const to = normalizeLink(path, links); // unknown paths → "/"
      if (to && to !== "/") linkHold.hold(to);
      return to;
    }
    ```

    `links` is `{ schemes: ["myapp"], hosts: ["example.com"], map: { "/c/:id": "/clients/:id" } }`.
    A path the map doesn't know, or one with a `.` or `..` segment, goes to
    `"/"` and `onUnknown`; `ignore` patterns return `null` so the router
    leaves them alone (an auth callback).
11. **Sheets**: `NativeSheet` (what's new, the push prompt) is React Native's
    own `Modal` and needs nothing above it: the system page sheet on iOS, a
    bottom panel on Android. To use `@gorhom/bottom-sheet` instead (snap
    points), pass it: `import * as BottomSheet from "@gorhom/bottom-sheet"`,
    then `bottomSheet={BottomSheet}`. The shell mounts its
    `BottomSheetModalProvider` inside the data, session and blocks providers,
    so sheet content can read them. The library also needs gesture-handler's
    `GestureHandlerRootView` around the app and Reanimated set up; without
    them it throws when a sheet opens.

## Slots

`slots` replaces a part, `slotProps` feeds it, `null` drops it.

| Slot | Default | Props |
| --- | --- | --- |
| `boot` | `BootScreen` (a plain loading view; the splash covers it at launch) | `{ status }` |
| `fatal` | `FatalScreen` (`PlainFatalScreen` if the slot throws) | `{ error, retry }` |
| `errorBoundary` | `GenesisErrorBoundary` | `{ children, fallback, onError, resetKey, onRetry }` |
| `signedOut` | your screens | `{ children }` |
| `forceUpgrade` | `ForceUpgradeScreen` (with `updates`) | `{ minimumVersion, installedVersion, storeUrl, openStore, retry, checking }` |
| `maintenance` | `MaintenanceScreen` (with `updates`) | `{ message, retry, retrying }` |
| `updateBanner` | `UpdateBanner` (with `updates`) | `{ reload, dismiss, canReload, blocked, reloading }` |
| `whatsNew` | `WhatsNewSheet` (with `updates`) | `{ notes, version, dismiss }` |
| `devtoolsFeedback` | nothing (in the devtools overlay; the support block fills it) | `{ debugInfo, close }` |

The last four render only when the `updates` prop is given. Ejecting a
blocking one (`forceUpgrade: null`, `maintenance: null`) shows your screens
instead: a slot that is turned off never blocks.

## Updates: force upgrade, maintenance, update banner, what's new

`@marktiderman/genesis-native/updates` is the updates block. Build it once
and pass it in; deleting the `updates={updates}` line turns it off.

```ts
// lib/app.ts
import * as Updates from "expo-updates";
import * as Application from "expo-application";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Linking, Platform } from "react-native";
import { createUpdates, supabasePolicySource } from "@marktiderman/genesis-native/updates";

export const updates = createUpdates({
  platform: Platform.OS,
  application: Application,
  updates: Updates,
  policy: supabasePolicySource(supabase), // or staticPolicySource({ … }), or your own
  storage: AsyncStorage,
  appState: AppState,
  openURL: Linking.openURL,
  channels: { enabled: __DEV__ || process.env.EXPO_PUBLIC_PREVIEW === "1" },
});

// app/_layout.tsx
<GenesisNativeApp updates={updates} … />
```

- **Force upgrade.** The policy names the oldest store version per platform
  (`minimumVersion: { ios: "1.4.0" }`) and its store link (`storeUrl`). An
  older install sees the `forceUpgrade` slot, blocking, with "Update" (the
  store link, opened with `openURL`) and "Check again". A minimum without a
  store link for the platform forces nothing: there would be no way out.
- **Blocking screens cover, they don't unmount.** The force-upgrade and
  maintenance screens are drawn over your screens, which stay mounted (hidden
  from touch and screen readers), so maintenance that starts and ends
  mid-session keeps a half-filled form and the navigation state.
- **Maintenance.** `maintenance: { active: true, message }` shows the
  `maintenance` slot, blocking, with "Try again" (fetches the policy again).
- **Update banner.** On launch and on coming to the front (at most every
  `checkIntervalMs`, 15 minutes), expo-updates is asked for a newer update
  for this binary's runtime version and it is downloaded; the `updateBanner`
  slot then offers "Restart" and "Later". It **never reloads on its own**, and
  never while anything is mid-edit: a form calls `useBlockReload(isDirty)`,
  and `canReload` gives the app its own say (a throw counts as no). "Later"
  loses nothing: a downloaded update also applies on the next cold start.
- **What's new.** Notes (`{ version, title?, body }`, from the policy and from
  `notes`) for the versions after the one last seen, up to this one, once, in
  the `whatsNew` slot. A fresh install shows nothing; the version seen is in
  `storage`.
- **Version signature.** `useVersionSignature()` gives `short`
  (`1.4.0 (37) · preview · 3f2a9c1b`) for a Settings "About" row and `text` (version,
  build, platform, channel, runtime, update id, emergency launch) for a support
  report. A value the modules can't give prints as `unknown`.
- **Channel switching** (test builds only): `useUpdates().channels.switchTo("pr-42")`
  overrides the `expo-channel-name` header, fetches and reloads (or reports
  `blocked` mid-edit). It throws unless `channels: { enabled: true }`; never
  enable it in a store build. `channels.reset()` goes back and always works.

**Policy sources.** `UpdatePolicySource` is `{ load(): Promise<UpdatePolicy | null> }`.
`staticPolicySource(policy)` is a policy written in the app;
`supabasePolicySource(client, { appId })` reads `public.app_release_policy`
(migration `0002_genesis_app_release_policy.sql` in
`@marktiderman/genesis-supabase`, readable by anyone, written only with the
service role).

**It fails open.** A missing policy must never lock anyone out:

- The first load (the policy and the version whose notes were seen) waits
  behind the splash for at most `policyTimeoutMs` (3 s), then carries on, so
  a hung network or a stalled storage read never fails the boot. An answer
  that arrives later still applies.
- No answer, an error, a malformed version (`1.2-beta`, `""`) or an unknown
  installed version never blocks.
- A policy fetched from the network is cached. Offline, a cached minimum
  version still forces the upgrade if the cache is at most `cacheMaxAgeMs`
  (7 days) old by the phone's clock, and not if its time is in the future (the
  clock moved back). A cached maintenance flag never blocks: maintenance
  needs a live answer. After a live maintenance answer, a "Try again" that
  can't reach the server keeps the screen up.

Each part on its own: `ForceUpgradeScreen`, `MaintenanceScreen`,
`UpdateBanner`, `WhatsNewSheet`; `createPolicyStore` + `evaluatePolicy`,
`createUpdateChecker` + `createReloadGuard`, `createWhatsNewStore`,
`versionSignature`, `createChannelSwitcher`, `compareVersions`; and the hooks
under `UpdatesProvider` (or the shell): `useForceUpgrade`, `useMaintenance`,
`useUpdateBanner`, `useWhatsNew`, `useVersionSignature`, `useBlockReload`,
`useCanReload`, `useUpdatePolicy`, `useUpdateCheck`.

`expo-updates` and `expo-application` are optional peers passed in, never
imported: without `updates` there is no banner and no channel switching;
without `application` nothing is forced and no notes show. The banner uses
`react-native-safe-area-context`, a peer (genesis-ui-native needs it too).

## Observability: errors, breadcrumbs, events, timings

`@marktiderman/genesis-native/observability` is the observability block. It is vendor-neutral:
everything goes through sinks, and the Sentry one is an adapter.

```ts
// lib/observability.ts: imported first by the module that builds GenesisNativeApp's props
import * as Sentry from "@sentry/react-native";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { useSegments } from "expo-router";
import { Platform } from "react-native";
import { consoleSink, createObservability, defineEvents, sentrySink } from "@marktiderman/genesis-native/observability";
import { versionSignature } from "@marktiderman/genesis-native/updates";

export const events = defineEvents({
  "auth.signed_in": { method: ["email", "apple"] },
  "checkin.saved": { mood: "number", first: "boolean" },
});

export const observability = createObservability({
  events,
  useSegments,
  sinks: [
    __DEV__ && consoleSink(),
    sentrySink(Sentry, {
      dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
      signature: versionSignature({ application: Application, updates: Updates, platform: Platform.OS }),
      applicationId: Application.applicationId,
    }),
  ],
});

// app/_layout.tsx
function RootLayout() {
  return <GenesisNativeApp {...shell} blocks={[observability]}>…</GenesisNativeApp>;
}
export default observability.wrap(RootLayout); // Sentry.wrap: touch and profiler boundaries
```

- **One error path.** Every error the shell catches (a render error in either boundary, a global
  error, a failed boot, an unhandled rejection) goes to the block's `onError` and then to yours.
  A sink that throws is reported to `onProblem` and never stops the other sinks or the fatal screen.
  `observability.captureError(error, { source: "sync" })` reports one you caught yourself.
- **Init order.** `sentrySink` runs `Sentry.init` when it is called, so build the block at module
  scope, in a module the root layout imports before anything else: errors while the app's modules
  load are caught too. A second call in the same process (Fast Refresh) reuses the client.
  Sentry's own global handler stays installed for errors before the shell mounts; once the shell
  is up, its handler runs first and hands the same `Error` object on, which Sentry's deduplication
  (`__sentry_captured__`) sends once. A thrown value that isn't an `Error` can be reported twice.
- **PII is scrubbed on the device, by default.** Emails (percent-encoded too), phone numbers,
  JWTs (Supabase access tokens and keys), Supabase `sb_secret_` / `sb_publishable_` keys, bearer
  tokens, tokens in query strings, row values in PostgreSQL errors (`Failing row contains (…)`)
  and long hex secrets are replaced in every string; values under keys naming a secret or a
  contact detail (`authorization`, `cookie`, `apikey`, anything with `token`, `secret`, `email` or
  `phone` in it) are replaced whole; every URL (web, deep link or path) loses its query and
  fragment (PostgREST filters carry record ids); request bodies, cookies and PostgREST `details`
  are dropped. Strings are cut at 4 KB first, so a huge log can't stall the JS thread. Sentry's
  own ids (`event_id`, `trace_id`, `debug_id`, …) and processing metadata are left alone, since
  its envelope is built from them. Sentry gets the scrubber in `beforeSend`,
  `beforeSendTransaction`, `beforeSendSpan`, `beforeBreadcrumb`, `beforeSendLog` and
  `beforeSendMetric` (yours run after, on the scrubbed value), plus `sendDefaultPii: false`, no
  screenshots, view hierarchy or accessibility labels, and touch breadcrumbs without the touched
  element's label. The user is an id only. If scrubbing throws, the event is dropped. Other sinks
  get scrubbed errors, breadcrumbs and tags.
- **What it can't catch:** a person's name in free text (an error message that says "Jane
  Doe"), and native crashes, which sentry-cocoa and sentry-android build without these
  JavaScript hooks. Keep names out of messages; use ids.
- **Typed analytics.** `observability.track("auth.signed_in", { method: "apple" })` is checked
  against `defineEvents` at compile time and at run time. A prop is a closed list of strings, a
  number or a boolean, never free text; an unknown event, prop or value is dropped and reported.
- **Routes.** With `useSegments` from expo-router, each route change leaves a `navigation`
  breadcrumb and a `route.time_on_screen` timing for the route left, by route pattern
  (`/(app)/clients/[id]`), never the values in it. Sentry's `expoRouterIntegration` (on by
  default in `sentrySink`) records its own navigation spans and time to initial display, so the
  Sentry sink skips the block's navigation breadcrumbs.
- **Crashes count.** A fatal error (the fatal screen, a failed boot) is sent as unhandled,
  so Sentry's release health counts it as a crash; a non-fatal one as handled.
- **Environments.** `development` in `__DEV__`; otherwise one per kind of build from the channel:
  `production`, `preview` (`preview` and `pr-<number>`), `development`. Override with `environment`.
- **Releases.** `sentrySink` sets `release` to `<applicationId>@<version>+<build>` and `dist` to the
  build (Sentry's own format) from the version signature, and tags every event with
  `update.id`, `update.channel`, `update.runtime` and `update.launch`, so an over-the-air update is
  told apart from the binary it runs on. Without an application id or version, it leaves the
  release to Sentry rather than guess.
- **Without a DSN** `sentrySink` starts nothing (a warning outside development).
- `useRecentActivity()` gives the last breadcrumbs and errors, scrubbed (the devtools overlay
  shows them).

**Source maps (Sentry).** Optional: add the `@sentry/react-native/expo` config plugin with your
organization and project, put `SENTRY_AUTH_TOKEN` in EAS secrets, use `getSentryExpoConfig` from
`@sentry/react-native/metro` in `metro.config.js` (Debug IDs), and for `eas update` run
`npx @sentry/expo-upload-sourcemaps dist` after the update. In this monorepo also set
`"@sentry/cli": true` under `allowBuilds` in `pnpm-workspace.yaml`, so the upload binary installs.

**EAS Observe.** EAS Observe (`expo-observe`) measures cold and warm launch, bundle load, time to
first render and EAS Update download time on its own once the root is wrapped
(`ObserveRoot.wrap`); time to interactive when you call `useObserve().markInteractive()` on your
entry screens; and, with `Observe.configure({ integrations: { "expo-router": true } })` at module
scope, per-route render and interactive times. It has no API for a custom timing metric, so
`observeSink(Observe)` sends `timing` as an event (`timing.<name>` with `duration_ms`, on the
Events page) and analytics events with `Observe.logEvent`. Its error reporting is in preview; the
sink leaves errors to Sentry unless `errors: true`.

`@sentry/react-native` and `expo-observe` are optional peers, passed in rather than imported, so an
app without them never bundles them.

## Devtools overlay

`@marktiderman/genesis-native/devtools` is a debug sheet for development, preview and internal
builds. It opens with a three-finger hold (every build, no native module), a shake (pass
`accelerometer: Accelerometer` from expo-sensors), or "Open devtools" in React Native's dev menu
(`devSettings: DevSettings`), and shows:

- the version signature, the update channel and a channel switch (the updates block's guarded
  `channels`: off where that block has it off; "Back to the build's channel" always works);
- the signed-in user's id, the server's base URL, the blocks in effect (`useBlocks`) and your flags;
- the recent errors and breadcrumbs from the observability block (scrubbed);
- "Copy debug info" (your `copy`, else the share sheet), "Crash test" (a render error, to check the
  fatal screen and reporting end to end), "Clear cache" (the query cache, then your `clearCache`)
  and "Sign out" (your `signOut`);
- the `devtoolsFeedback` slot, which the support block fills with "Send feedback" (an annotated
  screenshot); empty by default.

**Keep it out of production.** Import the entry only behind a condition Metro folds at build time.
Metro inlines `__DEV__`, babel-preset-expo inlines `process.env.EXPO_PUBLIC_*`, and in a
production bundle the dead branch is dropped before dependencies are collected, so the overlay's
code isn't in the bundle at all:

```ts
// lib/devtools.ts: the condition must be written out here (a variable or a helper stops the folding)
export const devtools =
  __DEV__ || process.env.EXPO_PUBLIC_APP_VARIANT === "development" || process.env.EXPO_PUBLIC_APP_VARIANT === "preview"
    ? require("./devtools-overlay").createAppDevtools()
    : undefined;

// lib/devtools-overlay.ts
export const createAppDevtools = () =>
  createDevtools({ enabled: __DEV__ || /\.(dev|preview)$/.test(Application.applicationId ?? ""), updates, observability, … });
```

Set `EXPO_PUBLIC_APP_VARIANT` wherever `APP_VARIANT` is set (eas.json build profiles and the EAS
workflow jobs do, in `templates/eas`); unset, the overlay is left out. `enabled` is the second
lock, a fact of the binary: with it false the block mounts nothing and listens to nothing.
## Push: registration, taps, the badge, notification settings

`@marktiderman/genesis-native/push` is the push block, a `defineBlock`
declaration (`id: "push"`). Build it once and put it in `blocks`; taking it
out turns it off. It contributes a Settings row (`useBlockSettings`: title
"Notifications", section `notifications`, href `/settings/notifications`, the
permission as its subtitle; `settingsRow` changes or drops it) and a boot step
that reads the permission behind the splash (a second at most; it never fails
the boot), and names its migration. It runs on migration
0005 and the `genesis-push-send` function of
[`@marktiderman/genesis-supabase`](../supabase/README.md#push-the-push-block).

```ts
// lib/push.ts
import * as Notifications from "expo-notifications";
import * as Application from "expo-application";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { AppState, Linking, Platform } from "react-native";
import { createPush, supabasePushBackend } from "@marktiderman/genesis-native/push";

export const push = createPush({
  notifications: Notifications,
  platform: Platform.OS,
  projectId: Constants.expoConfig?.extra?.eas?.projectId,
  appVersion: Application.nativeApplicationVersion,
  backend: supabasePushBackend(supabase),
  categories: [{ id: "messages", title: "Messages" }, { id: "digest", title: "Weekly digest", defaultOn: false }],
  storage: AsyncStorage,
  appState: AppState,
  openSettings: Linking.openSettings,
  links, // the same LinkOptions as +native-intent
  hold: linkHold, // the same hold as GenesisNativeApp's links
  onOpen: (path) => router.push(path),
});

// app/_layout.tsx
<GenesisNativeApp blocks={[push]} links={{ hold: linkHold, onRelease: router.replace }} … />

// app/settings/notifications.tsx
<NotificationSettings />
```

- **Permission, asked well.** The block never asks at launch. Call
  `usePushPrompt().offer("when someone replies")` at the moment push is worth
  it; the `pushPrompt` slot (default `PushPromptSheet`) says why first, and only
  its "Turn on" brings up the system prompt. `offer` is ignored for
  `prompt.launchGraceMs` (10 s) after start (so offer on a screen's focus, not
  only its mount), while signed out, once the system
  can't ask again, for `cooldownMs` (3 days) after "Not now", and for good
  after `maxDeclines` (3). A tap on "Allow notifications" in
  `NotificationSettings` asks straight away (the tap is the intent); once the
  system won't ask, it opens Settings (`openSettings`). iOS provisional
  permission counts as granted.
- **The token follows the session.** Once permission is granted, a signed-in
  person's Expo push token (`getExpoPushTokenAsync({ projectId })`) is
  registered with `genesis_push_register`, again when the OS rotates it
  (`addPushTokenListener`) and at most hourly otherwise. Sign-out, an account
  switch and deleting the account forget it (`genesis_push_forget`, which works
  without a session: holding the token is the proof); a forget that fails
  offline is kept on the phone and retried each time the app comes to the
  front, and never undoes a later registration of the same token. Coming to the
  front also registers again when the last try failed, and at most hourly
  otherwise (so a token another login took comes back). Without a `projectId` there is no
  token: the block says so once through `onError`, and Settings says so on
  screen.
- **Android channels.** A `default` channel, one per category (named after it,
  so a person can mute a category in Android's own settings) and any
  `channels` you add, all with private lock-screen visibility, made before the
  permission prompt and the token (Android 13 shows its prompt only once a
  channel exists). The sender uses the category as the channel id.
- **While the app is open** the foreground handler shows a notification
  (banner, list, sound, badge) unless `foreground(notification)` says no or a
  screen hides its kind: `useSuppressNotifications((data) => data.threadId === id)`.
  Signed out, nothing shows.
- **Taps.** `data.url` of a tapped notification (and of the one that launched
  the app, `getLastNotificationResponse`) goes through `normalizeLink` with
  `links`, once per notification: an unknown path opens `/`, another app's URL
  never opens. Signed in, `onOpen(path)` runs after the navigator mounts;
  signed out, the path is held in `hold` (the same `linkHold` as
  GenesisNativeApp's `links.hold`) and followed after sign-in. Without `onOpen`
  or `hold`, a tap opens nothing and says so through `onError`. Action buttons
  go to `onResponse`.
- **Badge.** `useBadge().set(n)` / `clear()`; the sender can set it too. It is
  cleared on sign-out (`clearBadgeOnForeground` clears it on every return to
  the front).
- **NotificationSettings** is a `SettingsPage` with four parts, each a slot and
  a hook: `permission` (`usePushPermission`), `categories`
  (`useNotificationCategories`, a switch per category), `quietHours`
  (`useQuietHours`: a switch, from and to times with `NativeTimePicker`, and
  the time zone; turning it on fills in the phone's zone, and a phone that has
  travelled offers its new one) and `privacy` (`usePrivacyPreviews`: "Show
  previews"). `slots={{ quietHours: Mine }}` renders yours in the same section
  with the same props; `null` drops the section. Nothing can be changed until
  the saved settings have loaded (a change on top of the defaults would save
  them over the person's choices); a failed load says so and is tried again
  when the screen opens. Changes save at once and are put back, with a note,
  when the save fails. The words are
  `notificationSettingsCopy`, replaced with `copy`. The time pickers need
  `@react-native-community/datetimepicker`; without it the times are shown, not
  editable.
- **What the server decides.** Quiet hours and hidden previews are applied by
  the sender (`genesis_push_targets`), in the person's saved time zone, so a
  phone with a wrong clock can't change them, and hidden previews never leave
  the server. The phone only shows them (`isQuietAt`, by time of day; the
  server's window also handles clock-change nights). Android's private
  lock-screen channel setting hides content only when the phone's own "hide
  sensitive content" is on, and a channel's settings are the person's once it
  exists: the server's hidden previews are the guarantee, not the channel.

Rung 3: `createPermissionStore`, `createPromptStore`, `createRegistration`,
`createPreferencesStore`, `supabasePushBackend` (or your own `PushBackend`),
`pathForResponse`, the row builders (`permissionRows`, …). Rung 4: the hooks
under `PushProvider`, and `PushRoot` to mount the block without
GenesisNativeApp (inside a `SessionProvider`).

Not covered: delivery through Apple's and Google's push services hasn't been
tried (it needs an EAS project with APNs and FCM credentials), and there is no
in-app inbox: that is `inbox-thread` in the repo's `features.ts`.

## Blocks

`blocks` takes `defineBlock` declarations (`@marktiderman/genesis-features/blocks`) a native shell
can run: a `NativeBlock` may also carry `bootSteps` (run behind the splash after your `steps`,
before the session) and a `Root` (mounted around your screens, inside the error boundary). The
updates block is one, so these are the same:

```tsx
<GenesisNativeApp {...shell} updates={updates}>   // as before
<GenesisNativeApp {...shell} blocks={[updates]}>  // the same block, as a block
```

The shell resolves the blocks once, at start (`resolveBlocks` with `platform: "native"`). Then:

- their boot steps run in dependency order, and their roots wrap your screens, the first block's outermost;
- their `contributes.slots` fill the shell's slots by name, under yours: your `slots` (a component
  or `null`) always win;
- `useBlocks()` returns the resolved blocks (ids, nav entries, routes, migrations…), each
  contribution tagged with its FeatureId;
- `useBlockSettings(sections, { navigate })` returns your Settings sections with every block's
  rows added to the section they name (an unknown section is added at the end), live subtitles
  included. The updates block adds the version signature to `about` (`versionRow` in
  `createUpdates` sets its title and section, or `false` turns it off). Call it at the top of the
  Settings screen and pass the result to `SettingsPage`.

A block may require your own features that aren't blocks: list them in `appFeatures`. Blocks that
don't resolve (a required block that wasn't passed or is off, an unknown slot name, two blocks
filling one slot) hide the splash, show the fatal screen and report a `BlockError` to `onError`:
a set-up mistake, found at launch.

## Each part on its own

`createBoot` + `BootProvider` + `useBoot`; `GenesisErrorBoundary` +
`installGlobalErrorHandler` + `installRejectionTracker` + `FatalScreen` +
`PlainFatalScreen`; `createNativeQueryClient` + `connectQueryLifecycle`, and
`createQueryPersistence` / `persistQueries` from `/persist`;
`createSessionStore` + `SessionProvider` + `useSession` + `AuthGate`;
`normalizeLink`; `createLinkHold` + `useHeldLink`.

`createHydrationGate()` keeps a persisted store's early writes off the disk
until it has loaded what was there:

```ts
const gate = createHydrationGate();
const useStore = create(persist(init, {
  name: "prefs",
  storage: createJSONStorage(() => gate.storage(AsyncStorage)),
  // Open only after a good read: after a failed one, writes would replace what's on disk.
  onRehydrateStorage: () => (_state, error) => {
    if (!error) gate.markHydrated();
  },
}));
```

## Native modules are injected

The package imports no Expo or native module beyond React Native's own
`View`, `Text` and `Pressable` (for the screens that must not depend on anything). The
splash (`expo-splash-screen`), storage (AsyncStorage or MMKV), `ErrorUtils`
(the global by default), the rejection tracker (Hermes's by default),
`AppState` and NetInfo are passed in, so it runs in tests with fakes. Peers:
`react`, `react-native`, `@tanstack/react-query`, for `/persist` the two
TanStack persister packages, for `/updates` `react-native-safe-area-context`
(with `expo-updates` and `expo-application` passed in), and for `/push`
`expo-notifications`, passed in too.
`/observability` takes `@sentry/react-native` and `expo-observe` passed in;
`/devtools` takes expo-sensors' `Accelerometer` and React Native's `DevSettings` passed in.

@stability Beta
