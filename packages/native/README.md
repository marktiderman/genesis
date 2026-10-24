# @marktiderman/genesis-native

The native app shell for Genesis Expo apps. `<GenesisNativeApp>` owns
everything above your screens, so the root layout is a few lines:

```tsx
// app/_layout.tsx
import * as SplashScreen from "expo-splash-screen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Stack, router } from "expo-router";
import { GenesisNativeApp } from "@marktiderman/genesis-native";
import { brand, supabase, steps, linkHold, version } from "../lib/app";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GenesisNativeApp brand={brand} supabase={supabase} storage={AsyncStorage} splash={SplashScreen}
      keyboardScroll={KeyboardAwareScrollView} steps={steps}
      queryClient={{ persist: { keys: ["clients", "me"], buster: version } }}
      links={{ hold: linkHold, onRelease: (path) => router.replace(path) }}>
      <Stack />
    </GenesisNativeApp>
  );
}
```

Pass the Supabase client in (make it with `createGenesisSupabase` from
`@marktiderman/genesis-supabase`); the shell never creates one.

## What it does

From the outside in:

1. **Theme**: `GenesisThemeProvider` with `syncNativeAppearance` on, so the
   root owns the platform color scheme.
2. **Keyboard**: `KeyboardScrollProvider` with your `keyboardScroll`, so
   Genesis form screens scroll the focused field into view.
3. **Data**: `GenesisProvider` over `createSupabaseProvider(supabase)` (or
   your `provider`) and the shell's QueryClient.
4. **Boot**: your `steps` (wipe a session left by a reinstall, hydrate stores,
   load fonts), then restoring the query cache, then reading the session. The
   splash stays up until all of them finish. Each step runs once; a step that
   throws or passes its timeout (10 s, `bootOptions.timeoutMs`) shows the
   fatal screen, and "Try again" resumes at that step. `bootOptions.minimumMs`
   keeps a fast boot from flashing the splash.
5. **Errors**: a boundary around your screens and a global handler
   (`ErrorUtils`) both show the `fatal` slot instead of letting the app close.
   "Try again" remounts the screens with fresh state. `onError` gets every
   error, for reporting.
6. **Query**: `networkMode: "always"` so offline queries fail instead of
   hanging; the query-key roots in `persist.keys` are saved to `storage` for
   24 hours (`maxAge`), discarded when `buster` (your app version) changes,
   and cleared on sign-out. Pass `lifecycle={{ appState: AppState, netInfo: NetInfo }}`
   to refetch on focus and follow the network.
7. **Auth**: `useSession()` is `loading`, `signedIn` or `signedOut`. A
   signed-out user sees the `signedOut` slot, or your screens when it is not
   set, for an expo-router layout that redirects:

   ```tsx
   // app/(app)/_layout.tsx
   const { status } = useSession();
   if (status === "signedOut") return <Redirect href="/sign-in" />;
   return <Stack />;
   ```

8. **Deep links**: `normalizeLink` maps an incoming link to an app path for
   expo-router's `+native-intent`, and the held link is released once the
   user is signed in:

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
   A path the map doesn't know goes to `"/"` and `onUnknown`; `ignore`
   patterns return `null` so the router leaves them alone (an auth callback).

## Slots

`slots` replaces a part, `slotProps` feeds it, `null` drops it.

| Slot | Default | Props |
| --- | --- | --- |
| `boot` | nothing (the splash is up) | `{ status }` |
| `fatal` | `FatalScreen` | `{ error, retry }` |
| `errorBoundary` | `GenesisErrorBoundary` | `{ children, fallback, onError, resetKey, onRetry }` |
| `signedOut` | your screens | `{ children }` |
| `updateBanner` | nothing (filled by the updates block later) | `{}` |

## Each part on its own

`createBoot` + `BootProvider` + `useBoot`, `GenesisErrorBoundary` +
`installGlobalErrorHandler` + `FatalScreen`, `createNativeQueryClient` +
`createQueryPersistence` + `connectQueryLifecycle`, `createSessionStore` +
`SessionProvider` + `useSession` + `AuthGate`, `normalizeLink`,
`createLinkHold` + `useHeldLink`.

`createHydrationGate()` keeps a persisted store's early writes off the disk
until it has loaded what was there:

```ts
const gate = createHydrationGate();
const useStore = create(persist(init, {
  name: "prefs",
  storage: createJSONStorage(() => gate.storage(AsyncStorage)),
  onRehydrateStorage: () => () => gate.markHydrated(),
}));
```

## Native modules are injected

The package imports no Expo or React Native native module. The splash
(`expo-splash-screen`), storage (AsyncStorage or MMKV), `ErrorUtils` (the
global by default), `AppState` and NetInfo are passed in, so it runs in tests
with fakes. Peers: `react`, `@tanstack/react-query`,
`@tanstack/query-persist-client-core`, `@tanstack/query-async-storage-persister`.

@stability Beta
