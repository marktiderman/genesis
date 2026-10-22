---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-core": minor
---

ResourcePage, ResourceForm and DataPageShell: close the gaps a real screen hit moving onto `ResourcePage`. All additive; the behaviour changes are listed at the end.

**ResourcePage**
- `resource` mode reaches every row. New `pagination`: `"client"` (default) fetches up to `clientRowLimit` (1000) rows in one request and keeps client-side search, sort and header sorting; past the limit a "Showing the first N of M records" notice (and a console warning) replaces the old silent cut at 25. `"server"` pages through the provider: the pager drives `useResource`'s page, the header's page size its `perPage`, and search (debounced, needs `searchFields`), sort and status chips become provider queries; the current page stays on screen while the next loads.
- `canEdit(item)` / `canDelete(item)` gate the peek's Edit and Delete separately; `canEditItem` (which gates both) still applies on top.
- Built-in confirmed delete: `allowDelete` (resource mode: confirm, `remove(item.id)`, close the peek), or `onDelete` + `confirmDelete`. Copy via `confirmDelete={{ title, description, confirmLabel, cancelLabel }}` (title/description may be functions of the row), `onDeleted` after success; a failure shows in the dialog. New `deleteDialog` slot and exported `ConfirmDeleteDialog`.
- `getSubtitle(item)` for the peek; the peek re-resolves its row by key, so after an edit it stays open and shows the saved values.
- `header="toolbar"`, `emptyTitle`, `emptyDescription`, `emptyIcon`.
- `defaultView` accepts `{ mobile, desktop }`.
- `/data` now exports `ResourcePageSlots`, `ResourcePageSlotMap`, `ResourcePageSlotProps`, `ResourceDeleteConfirmCopy`, `ConfirmDeleteDialogProps`, `ResponsiveViewMode`, `ViewModeDefault` and the generic `Slots` / `SlotOverride` / `SlotPropsFor`.

**ResourceForm**
- A failed save (`errors.root`) renders as an alert.
- Labels are tied to their controls (`htmlFor`/`id` from `useId`), and `aria-describedby` points at the description and the error; `RelationField` and `FileUploadField` accept `id` and the aria props.
- `maxLength` on text-like fields (input attribute plus schema validation).
- New `autoPlaceholder` (default `false`) and `prefillFromUrl` (default `true`, as before) props. The form sets `noValidate` so the schema's accessible messages are not pre-empted by browser bubbles.

**DataPageShell / PageHeader**
- `DataPageShell`: `emptyDescription`, and `header="toolbar"` (the header's actions without the title block), built on `PageHeaderOptions.showTitle`.

**genesis-core**
- `ResourceFormFieldDef.maxLength`; `useResourceForm` options `autoPlaceholder` (default `true`, unchanged) and `prefillFromUrl` documented; `useResource` option `keepPreviousData`.

**Behaviour changes to check on upgrade**
- `resource`-mode `ResourcePage` now requests up to 1000 rows instead of 25 (set `resourceOptions.defaultPerPage` to keep a smaller page, or use `pagination="server"`).
- `ResourceForm` no longer generates "Enter …" placeholders unless `autoPlaceholder` is set (select prompts stay).
- The peek stays open after a built-in edit save instead of closing.
- `useViewPreference` no longer writes the default to storage on mount; only an explicit choice is stored. It reads storage through `useSyncExternalStore`, so SSR hydrates against the default.
