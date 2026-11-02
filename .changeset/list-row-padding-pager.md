---
"@marktiderman/genesis-ui": patch
---

Two list fixes. Both are bug fixes to how existing chrome draws, not design changes, so neither is opt-in:

- **DataTable's pager** is pinned to the bottom of a scrolling table, but drew translucent (`bg-muted/30`), so rows scrolling under it showed through. It now draws opaque (`bg-card`, with the table's rounded bottom corners).
- **ResourcePage's default list row** added its own padding, bottom border and hover on top of the ones DataGrid's list wrapper already draws, so list rows had doubled padding, two dividers and two hover tints. The row now adds none, and each is drawn once by the wrapper. A `renderCard` you pass is unchanged.
