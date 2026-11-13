---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-design-system": minor
---

Lists v-next (ADR 0017): a view declares what its lists do, and `ResourceView` draws it.

- **Segments and filters.** `defineView`'s `segments` (named tabs with a `where` or a function of the viewer, and `count: true` for a count from the provider) and `filters` (choices, a range or contains, from the field). They go to the server, count toward Clear filters, and, once the app registers its router adapter (`ResourceViewDefaultsProvider urlState`), live in the URL (`seg`, `f.<field>`); only declared filters are read back. Core: `view.filters()`, `segments()`, `segmentFilters()`, `filterParams()`, `readListUrl`, `listUrlParams`, `whereParams`, `isFilterSet`.
- **Row and bulk actions.** With `rowActions` (screen or provider), each table row gets a More menu and the same on right-click: edit, the view's actions, delete, refusals shown with their reasons (`refusals: "hide"` leaves them out). An action with `bulk` (`true`, or `{ label, confirm, run, matching }`) joins the bulk bar, runs per allowed row (or once through `run`) and names the rows it skipped. Shift-click selects a range; "Select all matching" reaches every row for a `run` that takes the list's filters.
- **Saved views.** A `SavedViewStore` (`list`, `save`, `remove`, personal or team, with `readCurrent`/`writeCurrent`) on `ResourceViewDefaultsProvider savedViews`; `createLocalSavedViewStore()` is the device store, and `applicableListState` applies an older saved state as far as it fits.
- **The type switcher.** A view's `types` (default table, list, grid and each type it has a block for) gives a page list one switcher across table, list, grid, board, calendar, gallery and registered types (`ViewTypeSwitcher`), with the person's choice kept in the store. Segments and filters carry across types.
- **Grouping and totals** on the web: `groupBy` draws group headers with counts, totals and a toggle in the table, grid and list; `totals` (`sum`, `avg`, `min`, `max`, `count`) per group and in a footer (`groupTotals`).
- **Tone, emphasis and column hints.** `rowTone(row)`, `fields.<f>.emphasis` (`title`, `secondary`, `muted`), and `sortable: false`, `hideBelow` and `width`.
- **Export.** `export` (true or `{ columns, filename, maxRows, raw }`) offers Export CSV through `exportCsv`, which now takes a `format` for headers and values.
- **Rows a screen holds.** `ResourceView rows` draws them with nothing fetched.
- ResourcePage gains `rowMenu`, `onExport`, `heldFilters`, `viewMode`/`onViewModeChange`, and a second argument to `bulkActions[].onAction` (the rows, `allMatching` and the list's query); `bulkActions[].reason` and `.matching`. DataTable gains `rowTone`, `rowClassName`, `groups`, `footer`, `rowContextMenu` and a column's `emphasis`; DataGrid `groupOf` and `groupSummary`; DataBulkBar `matchingTotal`, `allMatching`, `onSelectAllMatching` and an action's `reason`; DataFilters `leading`, `extra` and `extraActive`. New parts: `table-group`, `table-footer`, `grid-group`, `view-segments`, `view-type-switcher`, `view-list-bar`.
