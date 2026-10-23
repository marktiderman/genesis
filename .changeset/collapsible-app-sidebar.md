---
"@marktiderman/genesis-ui": minor
---

AppShell: collapsible desktop sidebar and opt-in shell sub-navigation. No type in the public API narrows or widens: `NavItem.icon` stays required.

**Collapsed rail.** Collapsed, the desktop sidebar is an icon rail: the logo mark (the app name's first letter when there's no logo), one icon per item, the active item highlighted, and the expand button at the bottom. Each item shows its name in a tooltip on hover and on keyboard focus, and a nested group opens its items in a popover. The rail stays 56px wide; `options.collapsedRailWidth: 64` gives the 64px rail of the Breakthrough design. Collapsing or expanding keeps keyboard focus on the moved toggle or on the focused sidebar link, including when a route's `defaultCollapsed` collapses the sidebar.

**Opt-in shortcut.** `options.collapseShortcut` (off by default; e.g. `"["`) toggles the sidebar. It is skipped while typing, while a listbox, combobox or menu has focus (Select typeahead), while a dialog is open, and with Ctrl/Cmd/Alt held.

**Per-page default.** A page can ask to open collapsed: `defaultCollapsed` on `AppShell`, or the new optional `defaultCollapsed` on a `NavigationNode` (the nearest node in the resolved trail wins). The user's own toggle wins once used. With `optionsStorageKey` the choice is saved under `${key}:collapsed`. On a client-rendered page it is read during the first render, so a stored "collapsed" shows straight away. With server rendering (or a prerendered SPA shell) the server renders the default first, so the expanded sidebar shows briefly before it collapses. "Reset to defaults" in the sidebar options clears the choice. The mobile drawer is unchanged.

What existing apps will notice, all on the collapsed desktop rail. The expanded sidebar, the toggle's markup and the phone layout are as before.

- The toggle keeps its `aria-pressed`, `aria-label` and `title`. On the collapsed rail it sits at the foot instead of in the header.
- Collapsed rail links no longer carry a native `title`. The tooltip above replaces it, since both would show two tooltips. Their `aria-label` is unchanged. Each rail entry is wrapped in a tooltip trigger `<span>`.
- A disabled rail item is announced as a disabled link (`role="link"`, `aria-disabled="true"`, named), instead of a bare `<span>`.
- A nested group on the collapsed rail is a button that opens its items in a popover, instead of a link to the group's own page (or its first child).
- A badge shows as a dot on a collapsed rail item, and the item's accessible name includes it ("Tasks (4)").
- The sidebar's width animation is turned off under `prefers-reduced-motion` (`motion-reduce:transition-none`).
- `options.defaultCollapsed` is now the default whenever the user hasn't chosen, rather than only the initial state.

**Shell sub-navigation, opt-in and non-breaking.** With no `subNav` set anywhere, AppShell renders a page's children exactly as before (the default mode, `"section"`). `options.subNav: "tabs" | "sidebar"` (or one `NavigationNode`'s `subNav`, the `subNav` prop, or the page's hook) turns it on for the current page's child items. Those are a node's `items`, or the page's own through the new `useAppShellSubNav(items, { mode })` hook, for live badge counts. The hook takes `SubNavItem`s, whose `icon` is optional (the label's first letter shows instead).

- `"tabs"`: a row of navigation tabs across the top of the content. Badges show as chips, and the most specific matching tab is underlined in the brand colour with `aria-current="page"`. `<AppShellSubNavEnd>` fills a right-hand slot.
- `"sidebar"`: the children nest under the active item, with a flyout on the collapsed rail.
- Both: on phones, a page with children swaps the bottom bar to a back item to the logical parent plus the children and their badges. On that page this wins over an app-wide `mobileNavItems`. On pages without children, `mobileNavItems` applies as before, and in `"section"` and `"off"` it always wins, as before.
- `"off"` hides the children. `SubNavTabs` is exported to draw your own.

`<AppShellPageHeader>` renders the page's resource header (breadcrumb, title, status, actions) above the tab row. On phones it stays there too, and with no row it sits at the top of the content. Mount none and no markup is added. When a layout and its page both call `useAppShellSubNav` or mount `<AppShellPageHeader>` / `<AppShellSubNavEnd>`, the innermost one wins, and badge updates never reorder them. `useAppShellSubNav(null, { mode })` sets just the mode.
