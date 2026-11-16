---
"@marktiderman/genesis-ui": minor
---

The responsive contract (docs/RESPONSIVE.md):

- **Lists answer to their own width.** `ResourceView` measures its frame (`useListWidth`, from the `use-list-width` hook). A list is narrow on a phone (viewport below 768px, as before) and also when its frame is under 40rem (`LIST_NARROW_REM`), such as a side panel on a wide screen. A responsive default (`{ mobile, desktop }`), or an app's `ResourceViewDefaultsProvider phoneMode`, takes its narrow side there, and narrow card walls stack in one column. `phoneMode` now covers embedded lists as well as page lists. The measuring wrapper is `display: contents`, so it adds no box.
- **A list row keeps what the screen drew itself.** A column with a screen's own cell (ResourceView `cells`, or `keepInList` on a ResourcePage column) stays in the narrow list row. On the title column its cell is the row's title; any other such column shows beside the first three. A row holding such controls is no longer a button itself: it opens from its own Open button (`resource-list-row-open`), and a click on a control in it never opens the row.
- **Side sheets fill a phone's width** below `sm` (`max-sm:w-full`) and stay `w-3/4 sm:max-w-sm` from there. AppShell's drawer and the inbox's views sheet stay `w-72` on a phone.
- **PageHeader actions:** beside a title of at least 10rem they keep their size and the title truncates, as before. When they can't fit, they move to their own line and wrap within it instead of pushing past the edge.
- **`touchTarget`** (exported beside `cn`) is an invisible 44×44px hit area on coarse pointers. Switch, Checkbox, RadioGroupItem, pressable Chip and ChipGroupItem use it. DataTable's selection column widens on touch so the area stays inside it.

What changes for you:

- **A `phoneMode` app's embedded lists change.** They now open as rows or cards on phones and in narrow panels. A list that must stay a table there sets `mode="table"`. A person's own pick of view still wins everywhere.
- **Your own side-sheet width now applies from `sm` only.** A right or left `SheetContent` you gave a plain `w-*` (`w-80`) is full width on phones. Add `max-sm:w-*` to keep it narrow there.
- **Rows with your own cells have a new Open button.** A list row that holds controls from your `cells` gets it, and is no longer a `role="button"` with a tab stop of its own. Tests that click the row's text to open it still work; tests that focus the row and press Enter should use the Open button.
