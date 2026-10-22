# @marktiderman/genesis-core

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
