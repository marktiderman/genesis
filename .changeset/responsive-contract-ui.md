---
"@marktiderman/genesis-ui": minor
---

The responsive contract (docs/RESPONSIVE.md):

- **Lists answer to their own width.** `ResourceView` measures its frame (`useListWidth`, from the `use-list-width` hook). A list is narrow on a phone (viewport below 768px, as before) and also when its frame is under 40rem (`LIST_NARROW_REM`), such as a side panel on a wide screen. A responsive default (`{ mobile, desktop }`), or an app's `ResourceViewDefaultsProvider phoneMode`, takes its narrow side there, and narrow card walls stack in one column. `phoneMode` now covers embedded lists as well as page lists. It measures the list's own root (`DataPageShell` takes a `rootRef`), so no wrapper is added and a parent's spacing still reaches the list.
- **A list row keeps what the screen drew itself.** A column with a screen's own cell (ResourceView `cells`, or `keepInList` on a ResourcePage column) stays in the narrow list row. On the title column its cell is the row's title; any other such column shows beside the first three.
- **Default list rows and cards are never buttons themselves**, since a cell may draw a link. A row opens from its own Open button (`resource-list-row-open`) and a card from its title (`resource-card-open`); a click elsewhere on either still opens it, and a click on a control inside never does. With `detail="none"` they are plain.
- **Side sheets fill a phone's width** below `sm` (`max-sm:w-full`) and stay `w-3/4 sm:max-w-sm` from there. AppShell's drawer and the inbox's views sheet stay `w-72` on a phone.
- **PageHeader actions:** beside at least 10rem of title (its icon included) they keep their size and the title truncates, as before. When they can't fit, they move to their own line and wrap within it instead of pushing past the edge.
- **`touchTarget`** (exported beside `cn`) is an invisible 44×44px hit area on coarse pointers. Switch, Checkbox, RadioGroupItem, pressable Chip and ChipGroupItem use it. On touch, RadioGroup and ChipGroup space their items (unless you set a gap) so hit areas don't land on neighbours, and DataTable's selection column is 56px.

What changes for you:

- **A `phoneMode` app's embedded lists change.** They now open as rows or cards on phones and in narrow panels. A list that must stay a table there sets `mode="table"`. A person's own pick of view still wins everywhere.
- **Your own side-sheet width now applies from `sm` only.** A right or left `SheetContent` you gave a plain `w-*` (`w-80`) is full width on phones. Add `max-sm:w-*` to keep it narrow there.
- **Default rows and cards open from their own button.** A default list row or card is no longer a `role="button"` with a tab stop of its own: a row has an Open button, a card's title is a button. Tests that click the row or card still work; tests that focus it and press Enter, or find it by `role="button"` with its title as name, should use the Open button or the title.
- **Touch spacing grows.** RadioGroup and ChipGroup items sit further apart on touch screens, unless you pass your own `gap-*`.
- **Selectable tables are wider on touch.** The selection column is 56px instead of 40px, so pinned columns move 16px and the table's minimum width grows by as much.
- **A gallery view's list and table no longer get the gallery's item click.** Rows open from their own Open button, once.
