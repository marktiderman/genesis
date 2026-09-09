---
"@marktiderman/genesis-ui": minor
---

**ResourcePage: server-controlled lists, and the level-3 options reach the call site.**

Purely additive — every new prop is optional, no existing prop changes meaning, and no
existing call site needs an edit. Per `docs/FRAMEWORK.md` rule 5 ("additive by default")
and the versioning policy ("additive surface is a minor"), this is a **minor**.

**Server-controlled mode.** Supplying any of `page`, `perPage`, `onPageChange`,
`onPerPageChange`, `onSortChange` or `onSearchChange` tells ResourcePage that the server
already searched, sorted and paginated `data` — so it renders those rows exactly as given
instead of doing all three a second time. That double-work was the blocker: page 3 of 40
was previously re-filtered and re-sorted against only its own rows, and then re-paged on
top of that, which is why a server-paginated list could not adopt ResourcePage at all.
Two consequences are visible and deliberate: table header sort is withdrawn in this mode
(a header click could only reorder one page), and `DataTable`'s own pagination is switched
off in favour of a pager driven by `page`/`perPage`/`total`/`onPageChange` — rendered only
when `onPageChange` is supplied, so there is no dead control. Changing search or sort also
calls `onPageChange(1)`, and "Clear all" now reaches the server rather than emptying the
controls while the same rows stay on screen.

**Saved views** reach `DataFilters`: `savedViews`, `onLoadView`, `onSaveView`,
`onDeleteView`, `canSaveViews`. Pair with `useSavedViews` for per-user storage.

**Table chrome** reaches `DataTable`: `columnVisibility`, `columnVisibilityKey`,
`resizableColumns`, `resizeKey`, `stickyHeader`, `stickyFirstColumn`, `pageSizeOptions`.
Omitting any of them keeps DataTable's own default, so nothing changes for existing pages.

Together with the existing `viewSettingsKey`, this completes the three levels: the primitive
offers the option, the instance turns it on or off, and the end user's own choice persists
to their storage.

`useResourcePage` gains a matching optional `controlled` flag (defaults to `false`), which
is what actually bypasses the client-side filter/sort and makes `total` the server's count
rather than the length of a filtered slice.
