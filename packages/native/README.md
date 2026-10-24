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
   tracker (`rejectionTracker`, `null` turns it off). `onError` gets all of
   these, for reporting.
7. **Session, offline included**: `useSession()` is `loading`, `signedIn` or
   `signedOut`, with `userId` and `offline`. Offline with an expired access
   token, Supabase's `getSession()` can spend about 30 seconds on a refresh
   and then fail; the shell waits at most `sessionWaitMs` (5 s) and on a
   timeout or a network error carries on with the session stored on the
   phone (`offline: true`). Supabase's own events correct it once online.
8. **Query**: `networkMode: "always"` so offline queries fail instead of
   hanging. With `persist`, the query-key roots you list are saved to the
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

## Push: registration, taps, the badge, notification settings

`@marktiderman/genesis-native/push` is the push block. Build it once and pass
it in; deleting the `push={push}` line turns it off. It runs on migration
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
  onOpen: (path) => router.push(path),
});

// app/_layout.tsx
<GenesisNativeApp push={push} links={{ hold: linkHold, onRelease: router.replace }} … />

// app/settings/notifications.tsx
<NotificationSettings />
```

- **Permission, asked well.** The block never asks at launch. Call
  `usePushPrompt().offer("when someone replies")` at the moment push is worth
  it; the `pushPrompt` slot (default `PushPromptSheet`) says why first, and only
  its "Turn on" brings up the system prompt. `offer` is ignored for
  `prompt.launchGraceMs` (10 s) after start, while signed out, once the system
  can't ask again, for `cooldownMs` (3 days) after "Not now", and for good
  after `maxDeclines` (3). A tap on "Allow notifications" in
  `NotificationSettings` asks straight away (the tap is the intent); once the
  system won't ask, it opens Settings (`openSettings`). iOS provisional
  permission counts as granted.
- **The token follows the session.** Once permission is granted, a signed-in
  person's Expo push token (`getExpoPushTokenAsync({ projectId })`) is
  registered with `genesis_push_register`, again when the OS rotates it
  (`addPushTokenListener`) and at most daily otherwise. Sign-out, an account
  switch and deleting the account forget it (`genesis_push_forget`, which works
  without a session: holding the token is the proof); a forget that fails
  offline is kept on the phone and retried at the next start, and never undoes
  a later registration of the same token. Without a `projectId` there is no
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
  signed out, the path is held in GenesisNativeApp's `links.hold` and followed
  after sign-in. Action buttons go to `onResponse`.
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
  with the same props; `null` drops the section. Changes save at once and are
  put back, with a note, when the save fails. The words are
  `notificationSettingsCopy`, replaced with `copy`. The time pickers need
  `@react-native-community/datetimepicker`; without it the times are shown, not
  editable.
- **What the server decides.** Quiet hours and hidden previews are applied by
  the sender (`genesis_push_targets`), in the person's saved time zone, so a
  phone with a wrong clock can't change them, and hidden previews never leave
  the server. The phone only shows them (`isQuietAt`).

Rung 3: `createPermissionStore`, `createPromptStore`, `createRegistration`,
`createPreferencesStore`, `supabasePushBackend` (or your own `PushBackend`),
`pathForResponse`, the row builders (`permissionRows`, …). Rung 4: the hooks
under `PushProvider`, and `PushRoot` to mount the block without
GenesisNativeApp (inside a `SessionProvider`).

Not covered: delivery through Apple's and Google's push services hasn't been
tried (it needs an EAS project with APNs and FCM credentials), and there is no
in-app inbox: that is `inbox-thread` in the repo's `features.ts`.

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

@stability Beta
