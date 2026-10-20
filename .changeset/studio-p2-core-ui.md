---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
---

**Data Studio P2 contract and the sheet grid.** Additive; a **minor**.

- **genesis-core:** new optional `DataProvider` methods.
  - `updateMany` and `deleteMany` run in one transaction and are exact: all rows change or none do, and `BulkResult.failures` lists every row that failed.
  - `importRows` adds rows, with a dry run that lists every row that would fail.
  - `undo` makes a compensating write from an audit entry.
  - New types: `BulkChange`, `BulkResult`, `RowFailure`, `ImportParams`. `ProviderCapabilities` gains `import` and `undo`.
- **genesis-ui:**
  - **`@marktiderman/genesis-ui/sheet-grid`** (new subpath, **Experimental**): `SheetGrid`, a spreadsheet grid with virtualized rows.
    - Keyboard: an active cell and range, and Enter, F2 or typing to edit.
    - Copy and paste go through the system clipboard as TSV (`parseTsv`, `toTsv`), so they round-trip with Sheets and Excel.
    - Delete clears the range, and Ctrl/Cmd+Z undoes.
    - Each cell shows a saving or failed state; `SheetCommitError` marks only the cells that failed.
    - It follows the WAI-ARIA grid pattern.
    - `@tanstack/react-virtual` is an **optional** peer, needed only by this subpath (DATA-STUDIO.md decision 20).
