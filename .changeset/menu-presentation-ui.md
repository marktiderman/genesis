---
"@marktiderman/genesis-ui": minor
---

Sub-navigation at any depth. Every node in the navigation trail draws its own children by its `subNav`, so a tabbed node inside another shows a second, quieter tab row (`SubNavTabs variant="secondary"`). A third tabbed level folds the outer rows into a breadcrumb picker (`SubNavBreadcrumb`), so there are never more than two rows. An outer level shows only while one of its items is the way to the current page.

New `subNav` values:
- `"list"`: a list beside the page (`SubNavList`). On a phone it is a list page on the level's own page, then the item with a link back to the list.
- `"hub"`: cards on the level's own page, one per child, under the page's own title and intro (`SubNavHub`). One column on a phone.

Phones:
- `options.phoneTabs`: `"bottom"` (default, as before) makes the first tab row the bottom bar. `"top"` keeps tab rows at the top as a row you swipe, and the bar keeps the app's own items.
- A second row is a segmented control (`SubNavSegmented`) in both modes.

AppShell takes `headerItems`, the top bar's links. They're drawn at the end of the top-tabs bar, in a thin row above the page on other wide layouts, and in the phone's drawer.

What changes for you (sub-navigation is `@stability Beta`): a node with `subNav: "tabs"` now keeps its tab row on a child page reached through one of its items. Before, the child page showed only its own items.
- **Wide screens:** the parent's row shows above the child's, which becomes a quieter second row, and the content's "← parent" link is left out when that parent's row already shows.
- **Phones, with the default `phoneTabs: "bottom"`:** the bottom bar carries the parent's row (the outermost tab row), not the child page's own items. Its back item goes to the parent's own parent (an app's `parentNavigation` still wins), and the child's items become a segmented control at the top of the page.
