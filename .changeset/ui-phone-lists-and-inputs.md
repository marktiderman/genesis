---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
---

Lists and forms on a phone. The list layouts are opt-in; a few small defaults (keyboards, the list search, the default rows and cards) change existing screens, listed at the end.

- **Phone default for lists (opt-in).** `ResourceViewDefaultsProvider phoneMode="grid"` (or `"list"`) makes every full-page `ResourceView` (`layout="page"`) open in cards (or rows) on a phone and as a table on a desktop, unless its screen sets a mode. Embedded and compact lists are left alone: an embedded list has no view switch, so cards there would have no way back to the table. `phoneMode={null}` turns an outer provider's default off for a subtree. Without the provider nothing changes. `ResourceView`'s `mode` also takes `{ mobile, desktop }`. Calendar is never a phone default. The server renders the desktop default and a phone switches after hydration; a responsive default ignores a value saved under the older `genesis-view-<key>` key (see docs/RESOURCE-VIEW.md, "Phones").
- **Table cells that clip (opt-in).** `DataTable clipCells`, or `ResourceViewDefaultsProvider clipCells` for every `ResourceView`, clips a cell's content at its column's edge on one line with an ellipsis, so a long link or email doesn't run over the next column on a narrow table. Inline editors are never clipped. A screen's `slotProps.table.clipCells` wins.
- **Autofill is the field's call.** No input gets an `autocomplete` token from its type: unset, the attribute is left off, so the browser falls back to its own heuristics and may still offer to fill a field. A view field sets one with `autoComplete` (`fields: { email: { autoComplete: "email" } }`), or `"off"` on a form about someone else, so the browser is asked not to fill in the operator's own details. A view field's `inputMode` and `enterKeyHint` pass through the same way.
- **`tel` fields.** A new `tel` form type renders `type="tel"`. A `ResourceView` form field, and a `RecordView` settings field, is `tel` when its contract declares `widget: "tel"`; a column's name is never read as a type. `RecordView`'s settings inputs now take the same type, keyboard and autofill hints as a `ResourceForm` input.
- **Native.** The native form sheet gives a `widget: "tel"` field a `tel` kind and the phone keypad, and passes a view field's `autoComplete`, `inputMode` and `enterKeyHint` to the input.

Small default changes, on existing screens without a switch:

- **Keyboards.** Email, `tel` and url inputs ask for their keyboard (`inputMode`). A number asks for the decimal keypad only when its `min` is 0 or more, since that keypad has no minus key on an iPhone. A field's own `inputMode`, `autoComplete` and `enterKeyHint` always win.
- **List search.** The search box is named for screen readers, shows a search keyboard with a Search key, offers no autofill, and its clear button is a bigger target.
- **Default rows and cards.** `ResourcePage`'s default list row and card are titled by the page's title (`getTitle`, else `titleField`), not the first column's raw value, and leave that column out of the cells. Cells go through a column's `accessor` and `render`, so a computed column is no longer blank. A row is two lines: the title (up to two), then up to three other columns, wrapping.
