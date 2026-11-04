# @marktiderman/genesis-studio

## 0.3.0

### Minor Changes

- 9765abf: A save that meets someone else's change now asks the person instead of only showing an error: their value beside yours, then "Keep mine" or "Take theirs". Features: data-offline.

  - **genesis-core:**
    - `writeConflict(error, mine, { changed?, view? })` turns a `conflict` `DataWriteError` into a `WriteConflict`: `theirs`, `mine`, the `fields` this person changed that differ from theirs (a field their row doesn't carry counts as different), and `currentVersion`. Empty values, numbers and their text, dates and object key order compare as a person would.
    - `WriteState` (`pending`, `sending`, `paused`, `failed`, `conflict`) is the one shape for where a write stands.
    - `useResourceForm` returns `conflict`, `keepMine()`, `takeTheirs()` and `dismissConflict()`. What the person typed stays on the form until they save or take theirs, across an optimistic save's refetch too. Keep mine sends this person's changes at the version the conflict reported, with their values for every other field, and rejects with the reason if it fails for anything but a new conflict. After take theirs, the next save is checked against their version.
    - `ExecuteWriteArgs.expectedVersion` names the version a write is checked against.
  - **genesis-ui:** `ConflictSheet`, from `/data`. `ResourceForm` (every layout, and after an optimistic save closed it, without a second toast) and `RecordView`'s settings sections open it on a conflict. It hides keep mine when there's no version to save at. New `conflict` messages.
  - **genesis-ui-native:** `NativeConflictSheet`, from `/data`, announced as it opens. `NativeResourceForm` and `NativeRecordView`'s settings sections open it on a conflict; its words come from `messages.conflict`.
  - **genesis-studio:** the record panel's edit conflict opens `ConflictSheet` (theirs beside yours) instead of replacing what was typed. Its genesis-core floor is now 2.11: upgrade genesis-core with genesis-studio.

### Patch Changes

- 80a52f2: Board mode, from its review:

  - A move narrows by the screen's own `can` as well as the view's guard, and the screen's `resourceOptions` (`invalidates`, `onError`, `onUpdateSuccess`) apply to it. A move stays pessimistic.
  - A card either guard refuses has no handle or menu and can't be dragged (the new `KanbanBoard` `canMoveItem`), instead of being refused after the drop.
  - While a card's move is saving the card is dimmed and a second move of it is turned away, so it is never sent from the column it is leaving.
  - A yes/no board filters its columns by `true` and `false`, not the strings (`useBoardColumns` `toValue`).
  - A row that shows on two loaded pages of a column is drawn once (`useBoardColumns` `getKey`). Studio's board passes it too.
  - A bad screen `board={…}` override warns in development and shows the view's own block, instead of throwing.

  Features: resource-view-board

- 992b788: Board mode for lists: `<ResourceView view={tasksView} mode="board" />` shows a view's rows as cards in a column per value of one field, and moving a card writes that field.

  - **genesis-core:** a view's `board` block (`ViewBoard`): `field` (an enum or a yes/no field), `columns` (which values, in order; default the field's choices, then "No value" when it can be empty), `cardFields` and `limits` (work-in-progress limits by value). `defineView` checks every name and value; `boardProblems` and `boardChoices` check a screen's overrides the same way. `view.column(name)` resolves one field as a column preset would, for a card's fields.
  - **genesis-ui:** `mode="board"` on ResourceView, drawn by the new `ResourceBoard` (`board={…}` overrides the view's block and adds `onSelect`, `renderCard`, `onMoveError`, `perPage`). Each column is one paged `getList` under core's list keys, inside the viewer's scope and the screen's filters. A move is the resource's own `update(id, { [field]: value })`, so the provider's write rules apply and a versioned resource's check refuses a stale move; a refused move leaves the card where it was and says why. `useBoardColumns` is the loader on its own, for boards over rows that aren't one view's. `KanbanColumn.limit` shows a column's count against its limit ("4 / 3") and says when it's over. The `lists-use-resource-view` doctor rule also accepts a KanbanBoard fed by `useBoardColumns`, and `genesis catalog` points a board at `mode="board"`.
  - **genesis-studio:** the board loads through `useBoardColumns`, the same loader ResourceView's board uses. No change in what it shows.

  Features: resource-view-board

## 0.2.8

### Patch Changes

- a25a997: ResourceView's calendar mode now honours the list's options. `resourceOptions.enabled` holds the requests while a screen waits on its scope. `resourceOptions.select` is sent with both requests, so joined columns show. `live` subscribes and refetches as a list does. The list and the calendar build their filters and peek from one place, so they can't drift. In development, a `select` that leaves out the calendar's own fields warns. "+N more" no longer disappears once opened: it becomes "Show fewer". Focus stays put when it opens (it moves to the first revealed event, or stays on the toggle) and when PageDown leaves a lane the next week doesn't have (it goes to the same day in the first lane). A bad `timeZone` throws a `ResourceView(resource): …` error. The lanes layout buckets events once, so moving focus is fast with thousands of events. Lanes from a link (`laneBy` on a field with `references`) show the linked row's words, never the raw id. Studio's calendar is busy while a new month loads. Focus also stays in the grid when new data removes the focused lane. The last day of an overnight event says when it ends ("until 2:00 AM") instead of "All day". A change of scope or filter no longer shows the previous scope's rows while it loads; only a move of the window keeps them up. The open peek follows the row's current data, after a save or a refetch.

## 0.2.7

### Patch Changes

- bc1bd20: A view can describe its calendar: `defineView(contract, { calendar: { field, endField, allDayField, laneBy, layout, weeks, weekStartsOn } })`, checked by `defineView` and read by every platform. ResourceView gains a calendar mode: `<ResourceView view={v} mode="calendar" />` places a view's rows by a date or timestamp field in a month grid, 1 to 4 weeks, a printable day-by-day agenda, or one lane per person. It asks the provider for the rows that overlap the visible window (long events that began earlier included), inside the view's scope and filters and under core's list keys so saves refresh it, and says "+N more" past its row cap (500 per request; two requests with an `endField`) and in busy day cells; lands timestamps on the field's display clock (its own zone, the scope's or the viewer's), with `timestamp without time zone` read as wall time; gives events with no lane an Unassigned lane; shows an event that spans days on each day, all-day events first; draws a dot per person (named for screen readers); moves between days with the arrow keys, Home/End and PageUp/PageDown, each day read with its event count; and opens the list's peek on click (or `calendar.onSelect`). `EventCalendar` and its placement helpers (`calendarWindow`, `placeEvents`, `readEventTime`, `windowBounds`…) are exported from `/data` for events that aren't one view's rows. `readEventTime` (stored dates and timestamps as calendar values) is in `genesis-core/dates`. Studio's month calendar is now drawn by `EventCalendar` and fetches the whole grid it shows.
- bc1bd20: A `?month=` that isn't a real month (`2026-13`) is ignored, so the calendar view opens on the current month instead of failing.

## 0.2.6

### Patch Changes

- 1ed0cba: Package layers. Every package's package.json now says where it sits: `genesis.layer`
  (`foundation`, `primitive`, `module` or `tooling`), `genesis.group` (`core`, `data`, `ai`,
  `forms`, `collaboration`, `shells` or `modules`) and, on the foundation packages, `essential`.
  Dependencies only point down, and the repo's CI fails when one doesn't (docs/PACKAGE-STRATEGY.md,
  "Layers").

  - genesis-features: `PackageMeta`, `ModuleMeta`, `PACKAGE_LAYERS`, `PACKAGE_GROUPS`,
    `readPackageMeta` and `packageLayerProblems` (also from `/blocks`). The feature `layer` that
    meant one component is now `"element"`; `"primitive"` is still accepted as its deprecated name,
    and `findFeatures(…, { layer: "element" })` finds both, until the next major.
  - genesis-sites, genesis-support and genesis-product are modules: each declares a
    `genesis.module` card (name, summary, blocks, schema, install line, docs) and ships a
    `SKILL.md`. genesis-product gains a `product-board` block (`genesis add product-board`), and
    marks `/node` and its `genesis-product` bin as tooling.
  - genesis-cli: `genesis features find --layer element` (`--layer primitive` still works).

- 84dc6c8: Package housekeeping, no code changes. genesis-ui and genesis-design-system ship a README (their
  npm pages were empty). chat, collab, native, notifications, sites and supabase ship the MIT
  LICENSE. core, design-system, ui, ui-native, the umbrella and genesis-cli export
  `./package.json`, so tools can read a package's metadata through `exports`. genesis-switchboard's
  repository folder is now `packages/switchboard` (the package name is unchanged). genesis-studio and
  genesis-forms-studio no longer call themselves a "workspace", which in Genesis means where the
  viewer is working.

## 0.2.5

### Patch Changes

- b8b760f: `DataStudio` no longer renders its own `<main>`: inside an app shell that made two main landmarks on the page, which screen readers announce as a duplicate.

## 0.2.4

### Patch Changes

- 86e8e26: The optional `@hookform/resolvers` peer now accepts v6 (core and ui-native: `^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0`; studio: `^5.1.0 || ^6.0.0`). v6's listed breaking change is the Effect resolver moving to Effect v4. The zod resolver Genesis uses keeps its API, but builds its errors differently: for a union field it reports the branch with the fewest issues, so an app's messages on union fields can change when it upgrades. Genesis's own forms are unaffected, and the packages' tests now run on 6.0.

## 0.2.3

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

## 0.2.2

### Patch Changes

- 4c5a9f4: Accept genesis-core 2 and genesis-ui-native 3 as peers, beside the versions accepted before. None of these packages used the renamed scope names (`ResourceScope.practiceId`, `timeZone: "practice"`, `practiceTimeZone`), so they work with either. Without the wider ranges, the core and ui-native majors would have forced a major release of every one of them.

## 0.2.1

### Patch Changes

- af29d35: `genesis-core/resource-view`: `defineView(contract, {...})` describes what a resource means to people (labels, display hints, column presets, tabs, form sections, guards, summary) with no React, checked once and frozen. A name the contract doesn't have throws `ViewDefinitionError` at start-up.

  `isSafeUrl` and `normalizeLinkUrl` move to core (`genesis-core/urls`, also the root), so native and the extension use the same link check; genesis-ui re-exports them. The CSV helpers move to `genesis-core/csv`, and a cell that starts with spaces and then a formula character is now neutralised too.

## 0.2.0

### Minor Changes

- 69d7f90: **The Data Studio looks and works like Airtable.**

  - **studio:** tables are tabs across the top, and Grid, Board and Calendar are views on the left, alongside saved views. The spreadsheet grid is the default view:
    - The field that names a row comes first.
    - Each column header has an icon for its type.
    - Choices show as colored pills (status words in their meaning's color), links as chips, and yes/no as checks.
    - Each row has a number, a checkbox for bulk actions, and an open button.
    - An **Add a record** row sits under the grid, and the footer shows the record count.
    - **Hide fields** is remembered per table.
    - The session's edits fold into one line under the workspace.
    - The default page size is now 50.
    - The old Table view (`?view=sheet` still opens the grid) is replaced by the grid.
  - **ui:** `SheetGrid` gains, all opt-in: a column `icon` and `align`, a pinned `rowHeader` column, a `footer` row, and an `empty` message. The active cell is outlined only while the grid has focus.

- 9667f9a: **Data Studio P1 — the studio people want to live in** (docs/DATA-STUDIO.md P1).

  - **studio-server:**
    - **Create and delete:** creates and deletes run as the user and are audited, and deletes are version-checked.
    - **Audit history:** a record's history, limited to fields the user may read.
    - **`describe()`:** reports relations (`one`, `many`, or `through` a junction), a label field, and the fields a new row may set.
    - **Multi-field server sort.**
    - **Rule-bearing writes (decision 29):** `resources[name].functions` routes create, update or delete through the app's own database functions.
    - **The `outbox` audit sink and `createOutboxWorker`:**
      - delivery is at least once and in order per record;
      - claiming uses SKIP LOCKED, so two workers never send the same entry;
      - retries use backoff with jitter (10 attempts over about a day);
      - failed entries move to a dead-letter table with an alert, until replayed;
      - a run that fails before delivering (a refused login, a missing grant) is reported to `onError`;
      - delivered rows can be pruned.
    - **Writes run at REPEATABLE READ.** A write carried by an app function stays conflict-checked even where the user can't take a row lock. A delete takes no row lock, so DELETE rights alone are enough.
    - With `loginRole`, `record_history` refuses any login but the studio's, like `record_audit`.
    - **`byResource` rules** gain `create`, `delete` and `history`.
    - Re-run `npx genesis-studio-server sql` as a new migration: it adds the outbox tables and the history function, and is safe to run again.
  - **studio:**
    - **The record pop-up:** a schema-built form (react-hook-form + zod: required, numbers, dates, enums, JSON), related records, history, delete with confirmation, and a copyable link.
    - New peers: `react-hook-form` ^7, `zod` ^3.25 or ^4, and `@hookform/resolvers` ^5.1 (the first with Zod 4 support).
    - **Rows and links:** adding a row; relation pickers that search on the server; and labels for link cells, one query per linked table per page.
    - **Server-side list controls:** a filter builder with operators by field type, multi-field sort and group-by, all kept in the URL.
    - **Saved views:** filters, sort, search, grouping and visible columns.
    - **CSV export:** every filtered row (up to 10 000), with cells that would run as spreadsheet formulas neutralised.
    - **Controls follow the provider:** they hide what it can't serve, and disabled actions say why.

- a642bc0: **Data Studio P2 — power editing** (docs/DATA-STUDIO.md P2).

  - **studio-server:**
    - `updateMany` and `deleteMany` run in one transaction, each row version-checked in its own savepoint. Every failure is listed, then nothing is kept.
    - `import` inserts every row for real, in its own savepoint, so the database checks each value, constraint and row rule. Nothing is coerced. A dry run rolls back and lists every failing row.
    - `undo` makes a compensating, audited write for the user's own change, and refuses when the row has changed since. A deleted row comes back with its own key or not at all.
    - Re-run `npx genesis-studio-server sql` as a new migration: it adds `genesis_studio.audit_entry`, which with `loginRole` refuses any login but the studio's.
  - **studio:**
    - **Sheet view** (`?view=sheet`), built on `SheetGrid`. A paste across rows is saved in one transaction through `updateMany`. If any row fails, nothing is saved and the failing cells are marked.
    - **Undo:** Cmd/Ctrl+Z, plus an Undo button in the activity panel and in a record's History.
    - **Bulk actions:** "Set a field…" and "Delete" on selected rows, all or none.
    - **CSV import:** map the columns, check every row with a dry run, then import in one transaction.
    - **`forms` prop:** form sections, and fields shown only when a condition holds, declared in code.

- 69d7f90: **Data Studio P3 — workflow** (docs/DATA-STUDIO.md P3).

  - **studio-server:**
    - **Row actions:** `resources[name].actions` maps a named action to the app's function `fn(record_key jsonb)`. It runs as the user, at the version they saw, and its effect on the row is audited as `run:<name>`. `authorize` is asked `{ action: "run", rowAction }`, and `byResource` takes `actions: true | string[]`. The studio never undoes an action.
    - **Comments:** `authorize` allows `{ action: "comment" }` (`byResource`: `comment: true`). Comments are stored by security definer functions, only for rows the user can see, and the author is always the token's `sub`.
    - **`contracts`:** a checked-in contract from `genesis introspect` wins over discovery for labels, the label field, descriptions and type-compatible widgets. Types, keys and permissions still come from the live database.
    - `@genesis {…}` settings are left out of the comments the studio shows as descriptions.
    - **Hardening:** with `loginRole`, the read functions (`record_history`, `audit_entry`, `record_comments`) now refuse any other login, as the write functions already did. They stay the handler's, even if a Data API is pointed at `genesis_studio`.
    - **Migration:** re-run `npx genesis-studio-server sql` as a new migration. It adds `genesis_studio.comments`, `add_comment` and `record_comments`, and widens the audit log's `action` check to allow `run:<name>`.
  - **studio:**
    - **Board view** (`?view=kanban&by=…`): one column per value of an enum or yes/no field, 50 cards per column with **Load more**. Moving a card is a version-checked update, by drag or by the keyboard **Move to** menu.
    - **Calendar view** (`?view=calendar&by=…&month=YYYY-MM`): one request per month, up to 200 rows. Timestamps are placed on the viewer's day.
    - The record pop-up runs row actions, asking first when the action has a `confirm` question, and has a **Comments** tab.
    - Contract labels are used wherever a field is named.
    - **Fix:** signing in again as the same user (a new token, the same `sessionKey`) now brings the studio back. Before, it stayed on the sign-in screen until a reload.
  - **genesis-cli:** **`genesis introspect`** writes `resources.genesis.ts` from the Postgres catalog or a PostgREST/Supabase OpenAPI document. Labels and widgets come from `@genesis {…}` in table and column comments. The output is deterministic, and `--check` fails CI on drift.

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

## 0.1.0

### Minor Changes

- 8b251da: **Genesis Data Studio, milestone P0 — "fix a real row"** (docs/DATA-STUDIO.md). Two new packages, first published at 0.1.0.

  - **`@marktiderman/genesis-studio-server`** — a web-standard `Request → Response` handler that always acts as the signed-in user over a direct Postgres connection (`set local role` plus their verified claims, per transaction). Schema discovery with per-user column rights, list and read, and a single-cell update that is version-checked under a row lock, confirms the database advanced the version, and commits its audit entry in the same transaction. Composite keys. A deny-by-default `authorize()` (`byResource` for the common case) that can never grant more than the database. `supabaseAuth` / `jwtAuth`, the `genesis-studio-server sql` setup migration (tamper-proof audit log), and a browser client at `/client`.
  - **`@marktiderman/genesis-studio`** — `<DataStudio>`: a table sidebar and a sheet grid built on genesis-ui's `ResourcePage`, with in-place edits whose outcome is shown (saved with its audit entry, or not saved and why). Routing through an adapter (`createSearchParamsRouter`, `useHistoryRouter`, `useMemoryRouter`); sign-in is a slot. Experimental.
