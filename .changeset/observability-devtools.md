---
"@marktiderman/genesis-native": minor
---

The observability block, `@marktiderman/genesis-native/observability`, and the devtools overlay, `@marktiderman/genesis-native/devtools`.

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
