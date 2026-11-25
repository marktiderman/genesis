---
"@marktiderman/genesis-cli": minor
---

Native workbench, proof runs, and a release lane that refuses to start half set up.

- `genesis init --template native` into the Genesis workspace's `apps/` keeps the new app linked to the packages: its `workspace:` dependencies and the monorepo Metro config stay, it writes no pnpm-workspace.yaml of its own, and it adds a `postinstall` (`scripts/eas-build-packages.mjs`) that builds the workspace packages the app depends on when it runs on EAS, where their git-ignored `dist/` doesn't exist and the app's config loads it. Outside the monorepo nothing changes.
- `genesis init --supabase-ports <base>` moves the new app's local Supabase stack off the default ports (API on base+1, database on base+2, and so on), so it can run beside another app's stack. It fails when the app has no `supabase/config.toml`.
- `templates/maestro/prove-ios.mjs` (`pnpm prove:ios` in a new app) proves the app on an iOS Simulator:
  - against its own local Supabase stack, refusing to start one whose `[api]` port is 54321 or unset, and any API that isn't on 127.0.0.1, with a test login made through the stack's admin API;
  - or with `--no-stack`, for an app on sample data, with no stack, no login and no Supabase URL in the build;
  - from a cached development build: each new build starts from empty derived data and deletes `ios/` itself before `expo prebuild --clean`, and refuses when the app commits `ios/` unless `--force`;
  - running every flow in `.maestro/flows` (or `--flows <folder>`), with the evidence (screenshots, logs, summary.md) in `.e2e/artifacts/<run>/`.
- The release lane's `source` check (`native-release.mjs submit`) stops a release before anything is built when a released platform's eas.json `submit` block still has a template placeholder, so a first release can't build, fail at submit, and then only ship updates.
- The starter passes `swipeable`, `menu` and `router` to GenesisModules, wraps the root in `GestureHandlerRootView` and its tabs in `TabBarVisibilityProvider` (the iOS standards, ADR 0028), its sign-in subflow closes the keyboard before each tap, and its `.gitignore` leaves out the Supabase CLI's local state.
