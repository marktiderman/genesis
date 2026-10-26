---
"@marktiderman/genesis-ui": minor
---

A message catalogue for genesis-ui's data components. Wrap the app once to reword or translate them:

```tsx
<UiMessagesProvider messages={{ page: { loadMore: "Mehr laden" }, kanban: { moveTo: "Verschieben nach" } }}>
```

- **What it covers:** about 120 strings, including screen-reader announcements, in ResourcePage, DataPageShell, DataTable, KanbanBoard, SortableList, ConfirmDeleteDialog, DetailPanel, DataFilters, DataBulkBar, ViewToggle and ViewSettings.
- **How it works:** the same shape as the support and chat packages' copy. There's an English catalogue (`uiMessages`), and overrides replace any part of it, with `{name}` placeholders.
- **Nesting:** nested providers build on the one above.
- **Exports:** `resolveUiMessages`, `fillMessage` and `useUiMessages`.
- **Props still win:** props that already name a piece of copy, such as `createLabel`, `emptyMessage`, `searchPlaceholder` and `confirmDelete.*`, take priority over the catalogue.
- **No visible change:** without a provider, every string is the same as before.
