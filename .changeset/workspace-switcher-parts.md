---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-core": minor
---

WorkspaceSwitcher: named parts and theming, badges, search, keyboard shortcuts and typed actions. Every addition is opt-in or additive: without the new props the switcher renders the same menu as before (same classes, same footer placement). Two visible differences: each row carries `data-*` part attributes, and a row's hover and focus highlight now also recolors its second line for contrast.

- Every element carries `data-scope="workspace-switcher"` and a `data-part`, with state attributes (`data-state`, `data-variant`, `data-kind`, `data-current`, `data-highlighted`). `classNames` adds a class per part; `slots`/`slotProps` (genesis-core's slot contract) replace or drop the `image`, `item`, `badge`, `empty` and `search` parts and pass props to the `trigger` and the `content` (whose `ref` is composed with the switcher's own).
- `Workspace.badge` shows a count or status beside a workspace (or `renderBadge`); screen readers hear `badgeLabel` ("3 new") instead of the bare value. `Workspace.theme.accent` brands its tile and row through the new `workspaceThemeStyle`, built on `brandThemeStyle`.
- `search` (opt-in; `"auto"` past seven workspaces, using core's new `filterWorkspaces`): the list becomes a combobox over a listbox, with arrow keys, Enter (ignored mid-IME-composition and when nothing matches), `searchPlaceholder` and `emptyText`. In this mode `footer` must hold plain links or buttons, not menu items.
- `shortcuts`: a configurable shortcut opens the menu, and ⌘/Ctrl+1 to 9 (or Alt, never while typing) jump to a workspace in the menu's order (core's new `orderedWorkspaces`), through `onNavigate` (warns in development without it). Off by default; only the copy on screen answers.
- `actions`: typed items at the bottom of the menu; `open`/`defaultOpen`/`onOpenChange`; `onSelect`.
