---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-core": minor
---

WorkspaceSwitcher: named parts and theming, badges, search, keyboard shortcuts and typed actions. No breaking change; every existing prop works as before.

- Every element carries `data-scope="workspace-switcher"` and a `data-part`, with state attributes (`data-state`, `data-variant`, `data-kind`, `data-current`). `classNames` adds a class per part; `slots`/`slotProps` (genesis-core's slot contract) replace or drop the `image`, `item`, `badge`, `empty` and `search` parts and pass props to the `trigger` and menu `content`. The menu width and picture radius are CSS variables (`--workspace-switcher-menu-width`, `--workspace-switcher-image-radius`).
- `Workspace.badge` shows a count or status beside a workspace (or `renderBadge`); `Workspace.theme.accent` brands its tile and row through the new `workspaceThemeStyle`, built on `brandThemeStyle`.
- A search box past seven workspaces (`search`, `searchPlaceholder`, `emptyText`), using core's new `filterWorkspaces`.
- `shortcuts`: a configurable shortcut opens the menu, and ⌘/Ctrl+1 to 9 (or Alt) jump to a workspace in the menu's order (core's new `orderedWorkspaces`), through `onNavigate`. Off by default.
- `actions`: typed items at the bottom of the menu; `open`/`defaultOpen`/`onOpenChange`; `onSelect`.
