---
"@marktiderman/genesis-ui": minor
---

Lists and forms on a phone. Everything that changes what an existing screen renders is opt-in:

- **Phone default for lists (opt-in).** `ResourceViewDefaultsProvider phoneMode="grid"` (or `"list"`) makes every full-page `ResourceView` (`layout="page"`) open in cards (or rows) on a phone and as a table on a desktop, unless its screen sets a mode. Embedded and compact lists are left alone: an embedded list has no view switch, so cards there would have no way back to the table. `phoneMode={null}` turns an outer provider's default off for a subtree. Without the provider nothing changes. `ResourceView`'s `mode` also takes `{ mobile, desktop }`. Calendar is never a phone default. The server renders the desktop default and a phone switches after hydration; a responsive default ignores a value saved under the older `genesis-view-<key>` key (see docs/RESOURCE-VIEW.md, "Phones").
- **Table cells that clip (opt-in).** `DataTable clipCells`, or `ResourceViewDefaultsProvider clipCells` for every `ResourceView`, clips a cell's content at its column's edge on one line with an ellipsis, so a long link or email doesn't run over the next column on a narrow table. Inline editors are never clipped. A screen's `slotProps.table.clipCells` wins.
- **Keyboards.** Email, `tel` and url inputs ask for their keyboard (`inputMode`). A number asks for the decimal keypad only when its `min` is 0 or more, since that keypad has no minus key on an iPhone. A field's own `inputMode`, `autoComplete` and `enterKeyHint` always win.
- **Autofill is the field's call.** No input asks for autofill unless its field sets `autoComplete` (in a view: `fields: { email: { autoComplete: "email" } }`), so admin forms about other people don't fill in the operator's own details.
- **`tel` fields.** A new `tel` form type renders `type="tel"`. A `ResourceView` form field is `tel` when its contract declares `widget: "tel"`; a column's name is never read as a type.
- **List search.** The search box is named for screen readers, shows a search keyboard with a Search key, offers no autofill, and its clear button is a bigger target.
