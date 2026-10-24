# @marktiderman/genesis-native

The native app shell for Genesis Expo apps. `<GenesisNativeApp>` owns
everything above your screens, so the root layout is a few lines:

```tsx
// app/_layout.tsx
import * as SplashScreen from "expo-splash-screen";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Stack, router } from "expo-router";
import { GenesisNativeApp } from "@marktiderman/genesis-native";
import { brand, supabase, steps, persist, linkHold } from "../lib/app";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GenesisNativeApp brand={brand} supabase={supabase} splash={SplashScreen} steps={steps} persist={persist}
      keyboardScroll={KeyboardAwareScrollView} links={{ hold: linkHold, onRelease: (path) => router.replace(path) }}>
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
3. **Keyboard**: `KeyboardScrollProvider` with your `keyboardScroll`, so
   Genesis form screens scroll the focused field into view.
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
| `updateBanner` | nothing (filled by the updates block later) | `{}` |

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
`react`, `react-native`, `@tanstack/react-query`, and for `/persist` the two
TanStack persister packages.

@stability Beta
