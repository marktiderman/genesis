---
"@marktiderman/genesis-cli": minor
---

`genesis doctor` catches structural copies of Genesis, as warnings (failures under `--strict`):

- `hand-rolled-sub-nav`: a route inside the AppShell layout that switches its sections with its own page-level `TabsList` / `SubNavTabs` instead of `useAppShellSubNav` and `AppShellPageHeader`.
- `local-genesis-copy`: an app component named like a genesis-ui or forms-studio component (`ResourceHeader`, `SettingsSection`, `StatusBadge`, …).
- `duplicate-genesis-package`: more than one installed copy of a Genesis package (npm/bun nested or pnpm store), with the paths and the ranges that caused it.
- `peer-range-mismatch`: an installed Genesis package whose peer range on another Genesis package isn't met by the installed peer, with the package, range and installed version.
- `resource-workspace`: detail pages beside one that uses `AppShellPageHeader` but don't.
- `page-layout`: a web route with no Genesis page layout, itself, through one local import, or from a layout route around it.

New settings: `routesDir` and `componentPackages`; `--print-genesis` lists the companion packages' components.
