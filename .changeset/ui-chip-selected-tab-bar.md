---
"@marktiderman/genesis-ui": minor
---

`Chip` takes `selected`, `onSelectedChange` and `disabled`: with `onSelectedChange` it is a filter chip, a toggle button with `aria-pressed`. New `TabBar` (`@marktiderman/genesis-ui/layout`): a bottom tab bar with any number of items, where past `max` (5) the last slot is "More", opening a sheet with the rest; a badged tab is named with its count, as AppShell's bottom nav does. AppShell's phone bottom nav and `TabBar` split with genesis-core's `splitTabBarItems`.
