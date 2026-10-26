---
"@marktiderman/genesis-ui": minor
---

ResourcePage gains `variant="embedded"` for a list inside another page: a tab, a card or a side panel. In one prop it sets:

- **A toolbar header:** the create button, plus the table/cards toggle only when there is a `renderCard`. No title, count, view settings or header options menu.
- **No filter row,** unless the list passes `filters`, `statusFilter` or `searchFields`.
- **`keyboardNavigation` off,** since j/k shortcuts belong to the page.

An explicit `header`, `keyboardNavigation`, `slots.filters` or `slotProps.shell.headerOptions` still wins. `useResourceTable` applies the same keyboard default.
