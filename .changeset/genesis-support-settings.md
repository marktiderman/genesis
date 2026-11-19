---
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-native": minor
"@marktiderman/genesis-supabase": patch
---

**Support settings and zero config.** genesis-support declares its settings with genesis-config:
`support.*` (the feedback form, the person's inbox, messenger, agent desk, help center, AI answers,
idea board, chat threads, email, reply by email, desks, staff alerts, the GitHub sink, the webhook,
the contact fallback), `diagnostics.*` (on, when a dump goes, its size, the hourly limit, retention)
and `shake.*` (a person's own switch, and how hard), each with `max` / `standard` / `min` defaults,
secrets by name and store, and in package.json `genesis.settings` for `genesis doctor`. New:
`supportSettings`, `diagnosticsSettings`, `shakeSettings`, `supportSettingsCatalogue`,
`resolveSupportSettings`, `supportSettingValues`. `createSupport`, `createDiagnostics`,
`FeedbackPanel` and `createDiagnosticsHandler` take `appSettings` (explicit options still win;
without either, the `max` preset). `Diagnostics.enabled` says whether dumps are on. Migration
`0020_genesis_support_settings.sql` reads `diagnostics.perHour` and `diagnostics.retentionDays` in
the database; `0021_genesis_support_default_hooks.sql` (a stand-in default tenant for 0004) and
`0023_genesis_support_hook_defaults.sql` (Genesis's own wrappers answer with the reserved tenant
`00000000-0000-0000-0000-000000000001` and the platform admins as staff when the app has no hooks)
let support run with no SQL of the app's own; Genesis keeps no function of the app's hook names and
defines no viewer-people hook. The CommonJS server build bundles genesis-config's
settings resolver.

genesis-native's devtools overlay declares `devtools.*` (`overlay`, `shakeToOpen`, `hold`, `flags`,
`signOut`); `createDevtools({ appSettings })` takes parts away, never turns the overlay on in a
production build. genesis-supabase's `genesis-support-cleanup` leaves the dumps' age to the database
(the setting) unless `GENESIS_SUPPORT_DIAGNOSTICS_RETENTION_DAYS` is set.
