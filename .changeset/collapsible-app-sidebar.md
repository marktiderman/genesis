---
"@marktiderman/genesis-ui": minor
---

AppShell: collapsible desktop sidebar. Collapsed, it is a 64px icon rail with the logo mark, one icon per item (its name in a tooltip on hover and keyboard focus), the active item highlighted, nested groups opening in a popover, and the expand button at the bottom. Expanded, the collapse button sits beside the logo. The toggle carries `aria-expanded` and `aria-controls`, `[` toggles it (skipped while typing or with a modifier; `options.collapseShortcut` changes it or turns it off), and the width animation respects reduced motion.

A page can ask to open collapsed: `defaultCollapsed` on `AppShell`, or the new optional `defaultCollapsed` on a `NavigationNode` (the nearest node in the resolved trail wins). The user's own toggle wins once used. With `optionsStorageKey` it is saved under `${key}:collapsed` and read during the first client render, so a stored choice never flashes the expanded sidebar; "Reset to defaults" clears it. The mobile drawer is unchanged.

What existing consumers will notice on the desktop sidebar (sub-navigation below changes nothing unless turned on):

- The collapse toggle sets `aria-expanded` (and `aria-controls`) instead of `aria-pressed`. Selectors or tests reading `aria-pressed` need updating.
- The native `title` on the toggle and on collapsed rail links is gone. A real tooltip (on hover and keyboard focus) replaces it; keeping `title` too would show two tooltips. Each rail link keeps its accessible name (`aria-label`), and a disabled rail item keeps its name too.
- A nested group on the collapsed rail is now one button that opens its items in a popover, instead of a link to the group's own page (or its first child).
- The collapsed rail is 64px wide instead of 56px.
- In the collapsed rail the toggle sits at the foot instead of in the header. Focus follows it, and a focused link keeps focus, when the sidebar collapses or expands.
- `[` toggles the sidebar by default. `options.collapseShortcut: false` turns it off, and any other key string changes it.
- `options.defaultCollapsed` is now the default whenever the user hasn't chosen, rather than only the initial state.

Shell sub-navigation, opt-in and non-breaking. With no `subNav` set anywhere, AppShell renders a page's children exactly as before (the new default mode, `"section"`). Turning it on with `options.subNav: "tabs" | "sidebar"` (or on one `NavigationNode`, the `subNav` prop, or the page's hook) shows the current page's child items (a node's `items`, or the page's own through the new `useAppShellSubNav(items, { mode })` hook, for live badge counts):

- `"tabs"`: a row of navigation tabs across the top of the content. Badges show as chips, and the most specific matching tab is underlined in the brand colour with `aria-current="page"`. A right-hand slot is filled with `<AppShellSubNavEnd>`.
- `"sidebar"`: the children nest under the active item, with a flyout on the collapsed rail.
- Both: on phones, a page with children swaps the bottom bar to a back item to the logical parent plus the children and their badges. The main bar returns when you leave. An explicit `mobileNavItems` still wins.

`<AppShellPageHeader>` renders the page's resource header (breadcrumb, title, status, actions) above the tab row, on phones too, and at the top of the content when there is no row. Mount none and the layout is unchanged. When a layout and its page both call `useAppShellSubNav` or mount `<AppShellPageHeader>` / `<AppShellSubNavEnd>`, the innermost one wins, and badge updates never reorder them.

`"off"` hides the children; `SubNavTabs` is exported to draw your own. `NavItem.icon` is now optional (the rail and the bars show the label's first letter).
