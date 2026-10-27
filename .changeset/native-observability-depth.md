---
"@marktiderman/genesis-native": minor
---

Deeper error handling and Sentry integration through the observability block.

- **Failed queries and mutations are reported.** The shell watches its QueryClient's caches and reports a query or mutation that failed for good as a non-fatal `query` / `mutation` error, tagged with the key's first segment only (`query.key: "tasks"`). Only unexpected errors: offline, signed out, not found and the server's expected refusals are skipped. Opt out per query with `meta: { reportErrors: false }`, or with `reportQueryErrors={false}`. `reportQueryErrors(client, report)` and `queryKeyName` are exported.
- **Screen errors.** `observability.screenBoundary()` is an Expo Router `ErrorBoundary` for a route: reported non-fatal (source `screen`), `ScreenErrorScreen` with "Try again", wrapped with `Sentry.wrapExpoRouterErrorBoundary` when the Sentry sink has it. `createScreenErrorBoundary()` (without the block) and `<ScreenErrorBoundary>` (outside Expo Router) are exported too. `GenesisErrorBoundary` takes `fatal` and `source`.
- **Packages report through the block.** Creating the block makes it genesis-core's error reporter, so `reportError` from any package reaches the sinks (`reportErrors: false` opts out).
- **Trace headers only to your hosts.** `sentrySink`'s new `tracePropagationTargets` lists the hosts that get `sentry-trace` and `baggage`; the default is none (Sentry's mobile default sent them to every request). It wins over `init.tracePropagationTargets`.
- **Flush before an update reloads.** The update banner's reload and the channel switch await `runBeforeReload()`; the block registers a hook (`onBeforeReload`) that flushes the sinks within `flushBeforeReloadMs` (2000). `observability.flush(ms)` is public.
- **Unhandled rejections count.** They are reported with `handled: false`, so release health counts them. `ErrorReport` and `ErrorContext` gain `handled` and `tags`.
- **Support can point at the event.** `observability.lastEventId()` and `observability.replayId()`; sinks may implement `lastEventId`, `replayId`, `flush` and `wrapRouteErrorBoundary`.
- **Safe text on error screens.** `FatalScreen` and `PlainFatalScreen` show the error's own text only in development; a release build shows the `classifyError` sentence for a known kind (offline, signed out…) and nothing for a plain bug. `classifyError`, `errorMessages` and `reportError` are re-exported from the root.
