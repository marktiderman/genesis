---
"@marktiderman/genesis-ui": minor
---

AppShell: collapsible desktop sidebar. Collapsed, it is a 64px icon rail with the logo mark, one icon per item (its name in a tooltip on hover and keyboard focus), the active item highlighted, nested groups opening in a popover, and the expand button at the bottom. Expanded, the collapse button sits beside the logo. The toggle carries `aria-expanded` and `aria-controls`, `[` toggles it (skipped while typing or with a modifier; `options.collapseShortcut` changes it or turns it off), and the width animation respects reduced motion.

A page can ask to open collapsed: `defaultCollapsed` on `AppShell`, or the new optional `defaultCollapsed` on a `NavigationNode` (the nearest node in the resolved trail wins). The user's own toggle wins once used. With `optionsStorageKey` it is saved under `${key}:collapsed` and read during the first client render, so a stored choice never flashes the expanded sidebar; "Reset to defaults" clears it. `options.defaultCollapsed` is now the app-wide default rather than an initial-only value. The toggle no longer sets `aria-pressed`. The mobile drawer is unchanged.
