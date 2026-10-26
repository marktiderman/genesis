---
"@marktiderman/genesis-cli": minor
---

`genesis doctor` catches structural copies of Genesis. They are warnings (failures under `--strict`), except `resource-workspace`, which is `info`.

A new `info` level is reported (in the text report, with `--json` `infos` and each finding's `level`) but never fails a run, `--strict` included. `rules` accepts it for any rule.

The new rules:

- `hand-rolled-sub-nav`: a route inside the AppShell layout that switches its sections with its own page-level `TabsList` / `SubNavTabs` instead of `useAppShellSubNav` and `AppShellPageHeader`.
- `local-genesis-copy`: an app component definition (it renders JSX, and it is exported or outside the routes folder) named like a genesis-ui or forms-studio component (`ResourceHeader`, `SettingsSection`, `StatusBadge`, …). A route's own `errorComponent` and similar are not copies.
- `duplicate-genesis-package`: more than one loadable copy of a Genesis package, found by following resolution through npm/yarn/bun trees, pnpm's store (workspace sub-apps included) and bun's isolated store, with the paths and the ranges that caused it.
- `peer-range-mismatch`: an installed Genesis package whose peer range on another Genesis package isn't met by the installed peer, with the package, range and installed version.
- `resource-workspace` (info): detail pages beside one that uses `AppShellPageHeader` but don't.
- `page-layout`: a route inside the AppShell with no Genesis page layout, itself, through one local import, or from a layout route around it.

New settings: `routesDir` and `componentPackages`; `--print-genesis` lists the companion packages' components.
