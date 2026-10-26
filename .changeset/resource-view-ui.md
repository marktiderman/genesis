---
"@marktiderman/genesis-ui": minor
---

`<ResourceView view={...} />`: a list screen from a `genesis-core/resource-view` view, in one line. It maps the view onto ResourcePage, so paging, search, the peek, the form, delete and slots are ResourcePage's, and every ResourcePage prop still works as an escape hatch.

**Screen settings:**
- `layout` (`page`, `embedded` or `compact`);
- `columns` (a preset);
- `preset` (a tab: columns plus a server filter);
- `filter` (server equality filters);
- `mode`.

**Behaviour:**
- Guards only narrow: the view's rule AND the screen's `can`.
- The form lists only writable fields, under the view's sections.

**Also new:**
- `useResourceView` and `useResourceViewProps` are the headless forms.
- `DisplayRenderersProvider` replaces how a display hint draws. Links and images go through `isSafeUrl`, and calendar days are formatted from their parts.

**Fixed:** `DateCell` showed a `YYYY-MM-DD` day as the day before for viewers west of UTC.
