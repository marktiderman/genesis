---
"@marktiderman/genesis-ui": minor
---

Sub-navigation at any depth. Every node in the navigation trail draws its own children by its `subNav`, so a tabbed node inside another shows a second, quieter tab row (`SubNavTabs variant="secondary"`). A third tabbed level folds the outer rows into a breadcrumb picker (`SubNavBreadcrumb`), so there are never more than two rows. An outer level shows only while one of its items is the way to the current page.

New `subNav` values:
- `"list"`: a list beside the page (`SubNavList`). On a phone it is a list page on the level's own page, then the item with a link back to the list.
- `"hub"`: cards on the level's own page, one per child (`SubNavHub`). One column on a phone.

Phones:
- `options.phoneTabs`: `"bottom"` (default, as before) makes the first tab row the bottom bar. `"top"` keeps tab rows at the top as a row you swipe, and the bar keeps the app's own items.
- A second row is a segmented control (`SubNavSegmented`) in both modes.

AppShell takes `headerItems`, the top bar's links. They're drawn at the end of the top-tabs bar, in a thin row above the page on other wide layouts, and in the phone's drawer.

What changes for you: a node with `subNav: "tabs"` and items now keeps its tab row on a child page reached through one of those items, above the child's own tabs. Before, the child page showed only its own items.
