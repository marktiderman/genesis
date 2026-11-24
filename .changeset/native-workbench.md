---
"@marktiderman/genesis-cli": minor
---

Native workbench and proof runs.

- `genesis init --template native` into the Genesis workspace's `apps/` keeps the new app linked to the packages: its `workspace:` dependencies and the monorepo Metro config stay, and it writes no pnpm-workspace.yaml of its own. Outside the monorepo nothing changes.
- `templates/maestro/prove-ios.mjs` (`pnpm prove:ios` in a new app): proves the app on an iOS Simulator against its own local Supabase stack (refusing any API that isn't on 127.0.0.1, and the default port 54321), with a test login made through the stack's admin API, a cached development build, every flow in `.maestro/flows` (or `--flows <folder>`), and the evidence (screenshots, logs, summary.md) in `.e2e/artifacts/<run>/`.
- `genesis init --supabase-ports <base>` moves the new app's local Supabase stack off the default ports (API on base+1, database on base+2, and so on), so it can run beside another app's stack.
- The starter passes `swipeable`, `menu` and `router` to GenesisModules, wraps the root in `GestureHandlerRootView`, and its tabs in `TabBarVisibilityProvider`, so a new app gets the iOS standards (ADR 0028) from the start.
