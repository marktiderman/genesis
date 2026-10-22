---
"@marktiderman/genesis-ui": minor
---

Follow-ups to #91 and #94 (data-table accessibility and URL state):

- **One tab stop per table:** a clickable row's open column (the first column that isn't `editable`, or the new `openColumn` prop) is a button named by its content. The table has a single tab stop (a roving tabindex), and ↑/↓, j/k and Home/End move it. Rows themselves are no longer tab stops. `openColumn={null}` makes no cell a button.
- **Sort announcements:** `aria-sort` is set on the primary sort column only. A secondary sort says its direction and priority in its button's name, and the priority digit is hidden from that name.
- **Checkboxes:** the select-all and row checkboxes are labelled ("Select all rows", "Select Ada").
- **Linked records:** with `urlState`, a linked record outside the loaded rows (another page, or outside the search) is fetched with `getOne`. One that's gone or unreadable opens a "Record not found" peek. A URL sort is used only when it names a sortable column, and `?id=` is ignored when `detail` is `"none"` or `"route"`.
