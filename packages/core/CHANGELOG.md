# @marktiderman/genesis-core

## 1.9.0

### Minor Changes

- fd09919: `@marktiderman/genesis-core/dates`: calendar days on the right clock.

  - `personDay(person)` is today in the person's saved zone, else the device's, else UTC.
  - `dayIn`, `wallClock`, `startOfDayIn` and `dayRangeIn` give a day's instants. They handle 23- and 25-hour days, and a midnight that doesn't exist.
  - `addDays`, `daysBetween`, `weekdayOf`, `startOfWeek` and `isDay` do `YYYY-MM-DD` arithmetic.

  No dependencies.

- 927b32f: Query keys: `defineQueryKeys(domain, queries)` builds viewer-scoped keys (`for({ viewer, group?, day? })`) and invalidates by domain, kind or any field (`where(fields, kind?)`, which also finds one person inside a multi-person key); `resourceKeys(resource)` names the keys Genesis's own hooks use; `<ViewerScope viewer>` mounts screens only for a known viewer and empties the cache when it changes (`clearViewerCache` for apps without it).
- 5344767: Supabase resources can read from a view or a set-returning database function (`source: "view"` or `source: { rpc, args }`) and name their default columns (`select`), keeping paging, filters, search, sort, totals, cursors and live updates; writes still go to the table.
- 66e1a5d: New `useDraft` (and `DraftController`, the same rules without React): autosave one row as it's edited. It saves a moment after the last change, one write at a time, adds the row on the first save with something in it, and merges into a row another tab started (`adopt`). It starts again when the server's copy wins (`revision`, with `discarded` and `onRevision`), retries network failures only, saves on leaving the page, and has a final `commit`. See the README's "Autosave a draft".
- b755b3e: One-off writes: `callRpc(client, fn, args, { messages })` calls a database function with plain error words per code; `createOrAdopt(provider, resource, data, { key, merge })` keeps one live row per key; `useWrite(write, { invalidates })` runs any write from a component with pending state, plain errors and invalidation.

### Patch Changes

- c054142: Sourced resources: `writeColumns` (and, without it, updates that send only the table row's columns) so a view's read-only columns never reach the table; keyless views list again; docs say a source view must be `security_invoker` and a function `security invoker`, or the read bypasses RLS.
- 75965c0: A viewer switch never sends or re-applies the previous viewer's unsent undoable writes: `ViewerScope` drops them, `clearViewerCache` sends them first while the old session holds. New `flushPendingWrites` and `dropPendingWrites`. `where()` no longer matches every list for an empty list, or a key lacking a field asked for as undefined.

## 1.8.0

### Minor Changes

- 6c180f6: A unique violation (`23505`) is now its own write outcome, `duplicate`, instead of `invalid`. A caller that keeps one live row per key (a draft, a natural-key upsert) can adopt the existing row; `fields` and the safe message are unchanged. Studio server answers it with 409.

## 1.7.0

### Minor Changes

- e5462fb: The slot contract and the navigation resolver move to core, which has no DOM, so native patterns and shells can share them. New subpaths: `@marktiderman/genesis-core/slots` (`Slots`, `SlotOverride`, `SlotPropsFor`, `renderSlot`) and `@marktiderman/genesis-core/navigation` (`NavigationNode`, `ResolvedNavigation`, `resolveNavigation`, `isPathActive`). `@marktiderman/genesis-ui` re-exports both unchanged, so existing imports keep working.

  Features: app-shell, resource-page

## 1.6.0

### Minor Changes

- b28e674: Cursor (keyset) paging:

  - **Contract.** `PaginationParam.cursor` is now `string | null`: `null` asks for the first page by cursor. `ListResult` gains `nextCursor?: string | null`, and `ProviderCapabilities` gains `cursorPagination`.
  - **Supabase provider.**
    - Pages by keyset: the sort column, then the `orderKey` to break ties. The cursor is opaque base64 JSON.
    - Handles ascending and descending sorts and null sort values, and counts only the first page.
    - Refuses with a clear `invalid` error when there is no key, when sorting on an embedded field, when a cursor was made for another sort, and when the select leaves out the sort or key column.
    - Offset paging is unchanged.
  - **`useInfiniteResource(resource, options)`.** Built on TanStack `useInfiniteQuery`. Returns `rows`, `total`, `fetchNextPage`, `hasNextPage`, `setSort`, `setFilters` and `setSearch`. It falls back to offset pages for providers without cursor paging.
  - **Load more de-duplicates rows.** `useInfiniteResource` shows a row once if it moved into a later page.
  - **Look-ahead row fits under max-rows.** A cursor page is at most `maxPerPage - 1` rows, so PostgREST's `max-rows` never drops the extra row that tells whether a next page exists.
  - **Search with reserved characters.** Search terms are quoted, so commas, dots and parens in a search work, including inside the keyset filter.
  - **`useOne({ live })` sees deletes.** The Supabase channel for one record is no longer filtered on the server, where Realtime would drop DELETE events; the id is matched on arrival instead.
  - **Pending writes.** Optimistic and undoable writes are now also patched into every loaded page of `[resource, "infinite", …]` queries, and they survive refetches.

- 30aca5c: Live updates (realtime):

  - **`DataProvider.subscribe?(resource, params, callback)`** returns an unsubscribe function. The callback gets `{ type: "created" | "updated" | "deleted", id? }`, or `{ type: "changed" }` when changes may have been missed. New types: `ResourceChangeEvent` and `SubscribeParams`. `ProviderCapabilities.realtime` reports which resources it serves.
  - **The Supabase provider** serves it through Supabase Realtime `postgres_changes`. It is opt-in per resource (`resources[name].realtime: true`) or for several at once (the `realtime` option: `true`, a list, or a test). It opens one channel per subscription and removes it on unsubscribe. Events carry only the row's id. The minimal client shape gains an optional `channel()` and `removeChannel()`, and supabase-js is still not a dependency.
  - **`useResource({ live: true })` and `useOne(resource, id, { live: true })`** subscribe while mounted and refetch the resource's cached reads on events, once per burst (`live: { debounceMs }`, default 250). Payloads are never written to the cache, and pending optimistic and undoable writes stay applied over the refetch. While the tab is hidden, reads are only marked stale.

  The README covers setup: the `supabase_realtime` publication, RLS, what delete events reveal, and cost.

## 1.5.1

### Patch Changes

- ed8083f: Release #92 review fixes (round 3):

  - Undoable writes check `undo` through the same provider-scoped capabilities cache as `useCapabilities` (`capabilitiesQueryKey`), so a swapped-out provider's answer never offers undo.
  - Supabase `getList`'s retry for a view without `id` only fires for that resource's own key column (`column "id" does not exist` or `column <table>.id does not exist`), not a related table's `id` or another column, so a real error is no longer read as an id-less view.

- ed8083f: `useResourceTable` returns an explicit, documented `ResourceTableState`:

  - rows, total, loading and error;
  - search, sort and the status filter;
  - paging;
  - selection;
  - the open record;
  - create and edit, with the form's state;
  - delete, with its confirm step.

  It no longer exposes ResourcePage's internal names, so renaming them inside Genesis can't break an app. The hook now lives in its own module, so importing it from `/hooks` doesn't load ResourcePage's markup.

  Two fixes:

  - In a virtualized DataTable, the table's tab stop falls back to the first row in view, not an overscan row above the viewport.
  - The Supabase provider recognises a quoted table name in a missing-`id` error, such as `column "Report-View".id does not exist`.

- ed8083f: **Undoable / optimistic writes: review fixes from #106.** Only the opt-in `optimistic` / `undoable` paths change; `pessimistic` is untouched.

  - **Undo outlives the form.** Pending writes now belong to the `QueryClient`, not to the hook. A dialog that closes on success (or any unmount) no longer sends its waiting write at once, so its Undo toast still works; the write goes out when the delay ends.
  - **Writes on one record compose.** They are sent in order, one after another. Undoing (or a failure of) an earlier edit takes only its own fields out of the cache, and a later pending edit that kept those values (a form opened from the patched cache) has them put back before it is sent, so undone values are never sent. A later edit that cannot be fixed (form-shaped values) is dropped and reported through `onError`. Sending a later write first sends the earlier ones still waiting.
  - **Refetches keep the patch.** Pending patches are re-applied to any list or detail data that lands in the cache (a refetch, a new page, filter or search), so a deleted row no longer comes back during the undo window. Fetches in flight are no longer cancelled, and invalidation no longer waits for pending writes (a write that never settled used to block it).
  - **Page unload.** Waiting writes are sent on `beforeunload` and `pagehide` with `keepalive: true` in their params (new optional `keepalive` on `CreateParams` / `UpdateParams` / `DeleteParams`, and `keepaliveWrites` in `ProviderCapabilities`). The "Leave site?" prompt shows only while a write is sent without that guarantee.
  - **Late failures** reach the form (field errors, unsaved again) only while it is mounted, visible and still shows what it saved; otherwise only `onError`. New `useResourceForm` option `visible` (ResourceForm passes `open`).
  - **Supabase errors:** a unique index on `lower(email::text)` maps to `email`; an unreadable unique key gets "This value is already in use." instead of the raw database text.
  - **genesis-ui:** `showUndoToast` and `showWriteErrorToast` are exported from `/data`.

## 1.5.0

### Minor Changes

- 0156f89: **Forms: unsaved-changes guard, field-level server errors, and optimistic / undoable writes.** Additive; defaults keep today's behaviour.

  - **`warnWhenUnsaved`** on `useResourceForm` and `ResourceForm` (default off). While the form is dirty, closing or reloading the tab prompts; `ResourceForm` asks before Cancel / Esc / outside click close it. `useResourceForm` returns `isDirty` and `confirmLeave()`, and `ResourceForm` reports them through `onDirtyChange`, for router blockers (SKILL.md "Unsaved changes" shows React Router and TanStack Router `useBlocker`). New core `useUnsavedChangesGuard({ when, message, confirm })`.
  - **Field-level server errors.** `DataWriteError` gains optional `fields` (field → safe message), and `DataWriteErrorOptions.fields`. `useResourceForm` sets each on its field (`setError(field, { type: "server" })`), focuses the first, and keeps a summary in `errors.root`. The Supabase provider maps `23505` unique (column from PostgREST's `details`), `23502` not-null and `23503` missing foreign key to their columns via the new `fieldErrorsFromPostgrest`; when it does, the error's message becomes a plain sentence ("Email is already in use.") instead of the database's text, which stays on `cause`.
  - **`mutationMode`** (`"pessimistic"` default | `"optimistic"` | `"undoable"`) on `useResource`'s `create` / `update` / `remove`, `useResourceForm`, `ResourceForm` and `ResourcePage`, with `undoDelayMs` (default 5000) and `onUndoable(write)`. Optimistic patches the TanStack Query list and detail caches at once and rolls back (reporting through `onError`) on failure. Undoable also offers an undo and sends after the delay, or at once with `provider.undo` when capabilities report `undo`. Waiting writes are sent when the hook unmounts or the tab closes. genesis-ui shows a sonner Undo toast and toasts background failures. New exports: `MutationMode`, `MutationModeOptions`, `UndoableWrite`, `DEFAULT_UNDO_DELAY_MS`, `pendingWriteCount`.
  - `useResourceForm`'s `onSuccess` fires at once in optimistic / undoable modes (with the submitted values over the record); `useResource`'s `onCreateSuccess` / `onUpdateSuccess` / `onDeleteSuccess` still fire after the commit.

- 0156f89: Deletes say what they do and never fail silently:

  - `ProviderCapabilities.softDelete`: a delete moves the record to a recycle bin. The Supabase provider reports it per resource for `binTables`.
  - New core hook `useCapabilities(resource)`: the provider's capabilities, cached per resource.
  - `ConfirmDeleteDialog` `kind="recycle"` reads "It moves to the recycle bin, where it can be restored." instead of "This can't be undone." The default stays `"permanent"`.
  - `ResourcePage` asks the provider in provider mode and picks the wording itself.
  - An unconfirmed built-in delete that fails used to go only to `console.error`. It now goes to `resourceOptions.onError` when set, or to a toast otherwise.

- 0156f89: The Supabase provider's reads are stable and fail in plain words:

  - **Stable paging:** a sorted list also orders by the key column (`id`), so rows with equal sort values keep one order and none repeats or is skipped between pages. `resources[name].orderKey` names another column; set it to `false` for a table or view without `id`.
  - **Safe read errors:** `getList`, `getOne` and `getMany` throw a `DataReadError`, a new export. Its `outcome` is `unauthenticated`, `forbidden`, `gone`, `invalid` or `error`. Its `message` is a sentence users can see ("These tasks couldn't be loaded."). The store's raw error is its `cause`. A new `onReadError` option sees every failed read, for logging. `readOutcomeFromCode` maps store codes.
  - **Page cap:** `maxPerPage` (default 1000) is the largest page `getList` serves; a larger `perPage` is refused with an `invalid` `DataReadError`, and `capabilities()` reports the cap. The provider now implements `capabilities()`: search, sort, the filter operators it serves, create and delete. It reports no bulk, versioned or multi-sort writes.

  ResourcePage shows a `DataReadError`'s message in its error panel when `errorMessage` isn't set.

  Behaviour change: a sorted `getList` adds `.order("id")`. A resource without an `id` column needs `orderKey: false`. Read errors used to be thrown as plain `Error`s carrying the raw message.

- 0156f89: A list's state can live in the URL:

  - `useResourceUrlState({ searchParams, params? })` reads and writes the open record (`id`), page, sort (`field:asc`) and search (`q`) through any `SearchParamsAdapter`: the browser's, React Router's or TanStack Router's. Opening a record adds a history entry, so Back closes it. Page, sort and search replace the entry, and default values leave the URL.
  - `ResourcePage` takes `urlState` (an adapter, or `{ searchParams, params }` to rename keys):
    - A copied link reopens the same record with the same search and sort.
    - With `pagination="server"` it also restores the page.
    - A server-controlled page owns its own page, sort and search, so it uses the hook directly.
  - genesis-core: `useResource` gains `defaultPage` and `defaultSearch` for starting where a restored URL says.

### Patch Changes

- 0156f89: Release #92 review fixes:

  - `useCapabilities` keys its cache by the provider as well as the resource, so swapping `GenesisProvider`'s `provider` (another tenant or store) asks the new provider instead of reusing the old one's answer.
  - Supabase `onReadError` may be async: it is awaited and its rejection swallowed, then the original `DataReadError` is thrown, so a failing logger never leaves an unhandled rejection.
  - Supabase `getList` refuses a `perPage` above `maxPerPage` with an `invalid` `DataReadError` (its `cause` names the cap) instead of silently serving a shorter page, which shifted later page boundaries and skipped or repeated rows.
  - Supabase `getList` keeps reading a table or view without an `id` column when `orderKey` is left at its default: on PostgREST `42703` naming `id` it retries once without the key order, remembers that for the resource, and warns once in development.

- 0156f89: - Supabase provider: a per-resource `searchFields` sets the columns a search covers. `[]` makes `capabilities(resource).search` false, so a UI hides the search box.
  - ResourcePage: a caller's unconfirmed `onDelete` that rejects is reported to `resourceOptions.onError` or shown as a toast, instead of becoming an unhandled rejection.
- 0156f89: Supabase provider follow-ups to #96:

  - An unsorted page is ordered by the key column, so pages come back in a stable order.
  - New per-resource `nounPlural` for list messages ("categories", not "categorys").
  - `readFailureMessage` takes an optional plural.

## 1.4.0

### Minor Changes

- 9453f10: **`createSupabaseProvider` is safe to use directly under Supabase RLS.** Additive; a **minor**.

  - **Zero rows is a typed failure.** `update` and `deleteOne` now ask for the affected rows instead of ending in `.single()`. When RLS skips the row, the provider reads it back and throws `DataWriteError("forbidden")` (still visible) or `DataWriteError("gone")` (no longer visible), instead of PostgREST's cryptic `PGRST116` error.
  - **Write errors are typed.** Every create/update/delete error is a `DataWriteError` whose outcome comes from its Postgres/PostgREST code (`42501` forbidden; `22***`/`23***` such as `23505`, `23503` invalid; `PGRST301`–`303` unauthenticated; `PGRST116` gone; else error). The code stays on `error.code` and the raw error is the `cause`. New helpers: `writeOutcomeFromCode`, `toDataWriteError`. Reads are unchanged.
  - **Recycle-bin tables:** `createSupabaseProvider(client, { binTables })` (or per-resource `deleteMode: "bin"`). A delete succeeds when the row leaves the caller's view and is `forbidden` when it is still visible.
  - **Per-resource rules** (`resources: { [name]: … }`): `prepare(values, context)` before every write, `create` and `update` overrides (e.g. RPCs; an `update` that returns nothing is read back and reported as `forbidden`/`gone`, never as saved), `toFormValues(row)`, `invalidates`, and `noun` for messages.
  - **Write events and invalidation:** `onWrite(event)` after every committed write (its failure never fails the write). New optional `DataProvider.invalidates(event)` and `DataProvider.toFormValues(resource, row)`: `useResource` and `useResourceForm` invalidate the provider's related keys after their writes, and `useResourceForm` starts edit forms from `toFormValues`. Both hooks also take an `invalidates` option.
  - `GenesisProvider` takes an optional `queryClient`, so an app can share its existing cache; documented alongside `DataProviderRoot`.
  - `DataWriteError` gains an optional `code`, and `DataWriteErrorOptions` gains `code` and `cause`.
  - New `packages/core/README.md`.

  Behavior note: a zero-row update or delete through `createSupabaseProvider` already threw; it now throws a `DataWriteError` (still an `Error`) with a clear outcome and message.

- 9453f10: ResourcePage, ResourceForm and DataPageShell: close the gaps a real screen hit moving onto `ResourcePage`. All additive; the behaviour changes are listed at the end.

  **ResourcePage**
  - `resource` mode reaches every row. New `pagination`: `"client"` (default) fetches up to `clientRowLimit` (1000) rows in one request and keeps client-side search, sort and header sorting; past the limit a "Showing the first N of M records" notice (and a console warning) replaces the old silent cut at 25. `"server"` pages through the provider: the pager drives `useResource`'s page, the header's page size its `perPage`, and search (debounced, needs `searchFields`), sort and status chips become provider queries; the current page stays on screen while the next loads.
  - `canEdit(item)` / `canDelete(item)` gate the peek's Edit and Delete separately; `canEditItem` (which gates both) still applies on top.
  - Built-in confirmed delete: `allowDelete` (resource mode: confirm, `remove(item.id)`, close the peek), or `onDelete` + `confirmDelete`. Copy via `confirmDelete={{ title, description, confirmLabel, cancelLabel }}` (title/description may be functions of the row), `onDeleted` after success; a failure shows in the dialog. New `deleteDialog` slot and exported `ConfirmDeleteDialog`.
  - `getSubtitle(item)` for the peek; the peek re-resolves its row by key, so after an edit it stays open and shows the saved values.
  - `header="toolbar"`. (Empty-state copy uses `emptyMessage`, `emptyDescription` and `emptyIcon`, which #85 added.)
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

## 1.3.0

### Minor Changes

- 9667f9a: **Data Studio P1 contract** (docs/DATA-STUDIO.md P1). Additive; a **minor**.

  - **genesis-core:**
    - `ResourceSchema` gains `labelField`, `relations` (`ResourceRelation`: `one`, `many`, or `through` a junction) and `createFields`.
    - `ResourceAccess` gains optional `create`, `delete` and `history`, each with a reason in `reasons`.
    - `ProviderCapabilities` gains optional `multiSort`, `create`, `delete` and `history`.
    - `ListParams.sorts` sorts by several fields.
    - `DeleteParams.expectedVersion` version-checks deletes.
    - `CreateResult` and `DeleteResult` carry an optional `audit`.
    - New optional `DataProvider.history(resource, { id, limit })`.
  - **genesis-ui:**
    - `ResourcePage` gains `capabilities` (`{ search?, sort? }`): a control the data source can't serve is hidden, not left to error (decision 9).
    - `DataFilters` gains `showSearch` and `showSort`.
    - `ResourceColumnDef.editable` and `accessor` now reach `DataTable` in client-side mode too.

- a642bc0: **Data Studio P2 contract and the sheet grid.** Additive; a **minor**.

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

- 69d7f90: **Data Studio P3 contract, and a movable KanbanBoard.** Additive; a **minor**.

  - **genesis-core:**
    - New optional `DataProvider` methods: `runAction` (a row action at the row's version), `comments` and `addComment`.
    - New types `RowAction` and `RecordComment`. `ResourceSchema.actions` lists the row actions the user may run. `ResourceAccess` gains `comment` and `reasons.comment`. `ProviderCapabilities` gains `actions` and `comments`.
    - `FieldSchema.label`: what a person calls the field.
    - `AuditEntry.action` may now be `"run"`, with `rowAction` naming the action. Code that switches on `action` exhaustively should add the case.
  - **genesis-ui:** `KanbanBoard` gains, all opt-in:
    - `getKey`, for stable card keys.
    - `onMoveItem`: cards drag between columns, and each card gets a **Move to** menu that does the same from the keyboard.
    - `getItemLabel`, which names the card in that menu.
    - `KanbanColumn.total` (the badge shows it when a column is paged) and `renderColumnFooter` (e.g. **Load more**).

- 69d7f90: **The Data Studio turns on in any app, for every table.**

  - **genesis-cli:** `genesis studio init` writes one migration to review (the studio's `NOINHERIT` login and the audit trail), the server and a page, then prints the remaining steps. The server is a Next.js route, or a Supabase Edge Function for Vite and Lovable apps.
  - **studio-server:**
    - **`supabaseStudio({ url, database })`:** the handler for a Supabase project in one call.
    - **`databaseDecides()`:** every table, every action, bounded by the user's grants and row-level security. `who` defaults to any signed-in, non-anonymous user.
    - **No version trigger needed.** A table without a trusted version column is checked against a fingerprint of the row's readable values (`VersionField.kind: "row"`), so it's editable and stale edits are still refused. A configured `versionField` that can't be trusted still makes the table read-only.
    - **Policies are read too.** A granted table that no row-level security policy lets you update, insert or delete shows that action as off, with the reason, instead of failing on every try.
    - **CORS:** the handler answers preflights for `allowedOrigins`, so it can run on another origin.
    - **`supabaseAuth` inside the local Supabase stack** (`http://kong:8000`) also accepts the browser's localhost issuer. Hosted projects keep the exact issuer check.
    - **`createSupabaseStudioProvider(supabase)`** in `/client`: it sends the session's token and reports user changes.
  - **studio:**
    - `router` is optional (the page's query string), and no `sessionKey` is needed with a provider that reports its session.
    - **`standalone.css`:** every class the studio uses, prebuilt, for apps without Tailwind v4. Its small reset applies only inside the studio and its pop-ups, and the app's own theme variables win.
  - **core:** `VersionField.kind` may be `"row"`.

## 1.2.0

### Minor Changes

- 8b251da: **One schema model in genesis-core** (DATA-STUDIO.md decisions 11–13, 30). Additive; per `docs/FRAMEWORK.md` rule 5, a **minor**.

  - **`@marktiderman/genesis-core/schema`** (new, React-free subpath; also on the root barrel): `FieldSchema`, `ResourceContract`, `DataRow` and `StorageType`, promoted from the switchboard. A field now carries its storage `type` plus an optional `widget` hint (the existing form `FieldType`), `dbType`, `nullable`, `hasDefault`, `generated`, `enumValues`, `references`, and per-user `permissions` (`{ read, update, reason? }`). `ResourceContract.key` is `string | readonly string[]` for composite keys. New: `ResourceSchema` (a contract plus `access` and an optional trusted `version` field), `ResourceSummary`, `ProviderCapabilities`, `AuditEntry`, and `keyFields` / `encodeRecordKey` / `decodeRecordKey`, which carry a composite key through the existing `Identifier` slot as a canonical string.
  - **`DataWriteError` / `isDataWriteError`** with a `WriteOutcome` (`conflict`, `gone`, `forbidden`, `invalid`, `audit_failed`, `unauthenticated`, `error`) — also exported from `/provider`.
  - **`DataProvider`** gains optional `describe`, `listResources` and `capabilities`; `UpdateParams` gains optional `expectedVersion`; `UpdateResult` gains optional `version` and `audit`. Existing providers are unaffected.
  - **genesis-switchboard:** `FieldSchema`, `FieldType`, `DataRow` and `ResourceContract` are now **deprecated aliases** of the core types (`FieldType` → `StorageType`). The Level-bound contract is `SwitchboardContract` (core's `ResourceContract` plus `sourceOfTruth`, with a single-field `key`). The aliases stay until the next major. The published types inline the core definitions, so genesis-core stays an optional peer.

### Patch Changes

- 1a9d899: Release-pipeline only, no code changes. This version is published by CI through npm Trusted Publishing, which now requires the `npm` GitHub environment (main only).

## 1.1.2

### Patch Changes

- 7cfc703: First publish from the new public repo. No functional changes — every package's current version already matches what's published from the predecessor repo, so this bump is required before this repo's release workflow can publish anything at all (npm rejects republishing an existing version).

## 1.1.1

### Patch Changes

- e1e5b94: Fix `useOne` sharing one cache entry across different `select` projections.

  `useOne(resource, id, { select })` keyed its query on `[resource, "detail", id]` only. `select` is part of the _request_ — two callers asking for the same row with different projections get different rows back — so leaving it out of the key made them collide. Whichever mounted first won for the whole `staleTime` window (five minutes under `GenesisProvider`'s defaults), and the second silently rendered a record missing the joined fields it had asked for: no error, no refetch, no refetch-on-mount, just absent data. The key is now `[resource, "detail", id, select]`.

  `useResource`'s list key has always included `select` — it keys on the whole `params` object, which carries it — so this was the one place the projection was dropped. That asymmetry is the evidence it was an oversight rather than a decision.

  **Patch, not minor or major.** No signature changes, no option changes, no return-shape change; `useOne` accepts and returns exactly what it did. The only observable difference is that a query which previously served another projection's row now fetches its own — a defect being removed, which is what a patch is for. There is no persisted-cache migration to worry about: react-query keys live in memory for the life of the page, so the worst an upgrade costs is one extra fetch per distinct projection on first mount.

  Found while building `ResourceDetailPage` (`@marktiderman/genesis-ui`), which exposes `select` as a prop so a detail route can join its relations. Shipping that prop on top of the broken key would have handed every consumer a cache collision that looks like missing data, so the fix belongs here rather than being worked around in the component.

## 1.1.0

### Minor Changes

- c3d1c7e: `useResource`'s `defaultFilters` now resyncs whenever its _value_ changes (order-independent deep-equality, not just identity), not just on first render. Previously the initial `defaultFilters` array was only read into state once via `useState`'s initializer, so a caller whose scope/audience changed on an already-mounted, already-enabled hook (e.g. switching teams without a remount) kept querying with the stale filters — consumers were working around this with an app-level `useEffect` + `setFilters` re-sync. The resync now happens during render, so a filter change already applies before that render's fetch goes out.

  This covers filters _changing_ after mount; it can't help a hook whose `defaultFilters` starts `undefined` while the real value is still resolving — `undefined` is inherently ambiguous between "this caller doesn't use `defaultFilters`" and "not ready yet," so a caller in the latter case must also gate `enabled` on that same readiness signal for its very first fetch to be scoped correctly.

  `createSupabaseProvider` now accepts a new, separate `SupabaseClientInput` type for its `client` parameter — deliberately looser than the existing public `SupabaseClient` type, which is unchanged. A real `@supabase/supabase-js` client's generic, table-typed `PostgrestQueryBuilder` never structurally matched `SupabaseClient`'s `from()` return type, forcing every consumer to pass their client through an `as never` cast. `SupabaseClientInput.from()` returns `unknown` instead, which any real client satisfies without a cast; `createSupabaseProvider` narrows to the internal query-builder shape itself, once, right after each `from()` call. `SupabaseClient` keeps its original, stricter shape for any caller that types its own client against it directly.

## 1.0.0

### Major Changes

- e972635: Rename the npm scope from the old pre-public scope to `@marktiderman` across all Genesis packages: `genesis-*` → `@marktiderman/genesis-*`.

  The data-layer package additionally shortens its name to `@marktiderman/genesis-switchboard` (dropping the redundant `data-` prefix while keeping the `genesis-` family prefix consistent with the other packages).

  **Breaking change.** Consumers must update every import specifier and dependency entry (e.g. `genesis-ui` → `@marktiderman/genesis-ui`, and `genesis-data-switchboard` → `@marktiderman/genesis-switchboard`). Per npm best practice the previous pre-public-scope names will be `npm deprecate`d with a pointer to the new names once the `@marktiderman/*` packages are published. The legacy `genesis@2.0.0` umbrella package under the old scope is unaffected (separate lineage).

## 0.1.1

### Patch Changes

- 00b2743: First publish from the canonical `marktiderman/genesis` repo. Bumps the existing `@marktiderman/genesis-*` v0.1.0 packages (originally published 2026-04 from prior fork repos PRD-07 Phase A6 retires) to v0.1.1 with the canonical genesis-repo content. Consumers install with zero auth: `pnpm add @marktiderman/genesis-core`. Each publish emits a Sigstore provenance attestation linking the tarball back to this commit + the workflow run via OIDC. Publishing infrastructure: Changesets + `changesets/action` + `.github/workflows/release.yml` using **OIDC Trusted Publishing** (no NPM_TOKEN secret; short-lived token issued at publish time via GitHub Actions identity).
