# @marktiderman/genesis-core

## 2.2.0

### Minor Changes

- 5a0c1d2: A record's page is now a **record view**, so "workspace" can mean where the viewer is working (ADR 0004). `defineWorkspace` is `defineRecordView`, `ResourceWorkspace` is `RecordView`, `NativeResourceWorkspace` is `NativeRecordView` (with `NativeRecordViewMenu` and `getNativeRecordViewStackOptions`), and the `Workspace…` types are `RecordView…`. The components take `view` in place of `workspace`, as `ResourceView` does. The old names still work for one minor release, marked deprecated. The doctor rule `ui/record-pages-use-resource-workspace` is now `ui/records-use-record-view`: rename it in an app's config if the app sets its level. Message keys (`messages.workspace`) and default test ids (`resource-workspace`) are unchanged.
- 4e2d436: Workspaces (ADR 0004): `@marktiderman/genesis-core/workspaces` describes where the viewer is working (one organization, the roll-up, or personal) and reads it from the URL (`workspaceAt`, `workspaceHref`, `defaultWorkspace`, `groupWorkspaces`). `WorkspaceScope` replaces `ViewerScope` in an app with workspaces: it scopes every view under it to the current workspace and remembers it per viewer.

  `scopeFilter(view, scope)` (resource-view): a view's scope keys as a list filter, accepting a list per key and skipping keys the scope doesn't set.

### Patch Changes

- 0a4b8fd: Workspaces: trailing slashes are trimmed with a loop instead of a regular expression, which was slow on a path with very many slashes (CodeQL js/polynomial-redos).

## 2.1.0

### Minor Changes

- 6e58627: Behaviour change in `useResourceForm`: an input left empty (`""`) is no value, for fields whose column the form knows about. `ResourceFormFieldDef` gains `nullable` and `hasDefault` (ResourceView fills them from the contract). For such a field, a create leaves an empty input out, so the column's default applies (for example `created_by default auth.uid()`), and an edit sends null when the person emptied it. A text field that isn't nullable keeps `""` (on a create, only without a default), and a value the screen started the field at (a `filter` or `defaults` value) is kept. A field without `nullable`, and an edit of a field nobody touched, send exactly what they did before. A `create` rule that forwards every value as named function arguments no longer receives the left-out keys. `blankValues` is exported for custom forms.

  A cleared number input (`undefined`) counts as empty too, so an edit that clears an optional number sends null. An optional field's schema accepts null, so a field a screen started at null (`filter={{ due_on: null }}`) no longer blocks the submit.

- 5c80a38: The Supabase provider reads and writes resources named `schema.table` (as generated contracts name them): `public` through `client.from(table)`, any other schema through `client.schema(name).from(table)`. The name splits on the first dot outside double quotes (`"my.s"."we.ird"`); a bare name still means `public`. A client without `schema()` gets the name as given for other schemas, but a `public.x` resource now reaches it as `from("x")` (it used to get `from("public.x")`). A `public` resource's config and a `binTables` or `realtime` list match either spelling: the key spelled as the caller names the resource wins, the other is used only when it's absent. A `binTables` or `realtime` test is asked once, with the name as the caller gives it, as before.

  `defineView` makes plurals that invert its singulars (entry → entries, person → people) instead of adding "s", and with only a derived noun takes the contract's label as the plural when it reads as one ("People"). `ViewCopy` gains `form` (create and edit titles) and `count` (the count's words). `plural` and `singular` are exported from `genesis-core/resource-view`.

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

- 298f8cd: Upgrading: ResourceView and NativeResourceView turn on the form's empty-input handling by themselves, from each field's `nullable` and `hasDefault` in the contract. Before upgrading, (a) regenerate contracts with this release's `genesis introspect`: contracts from an older CLI mark every view column `nullable: true`, so an edit that empties a view's NOT NULL text column would send null; and (b) give defaults to the parameters of any function a `create` rule calls with the whole row as named arguments, since a create now leaves out the keys of inputs left empty.

## 2.0.0

### Major Changes

- 4c5a9f4: Scope-neutral names. Genesis named one app's tenant ("practice") in its scope and clock APIs; it now names whatever the screen is scoped to.

  Breaking:

  - `ResourceScope.practiceId` is gone as a named key. Pass the app's own key in the open slot, as before: `scope={{ practiceId }}`, `scope={{ orgId }}`, `scope={{ leagueId }}`. Views read it as before (`scope: ["practice_id"]` reads `practice_id`, then `practiceId`). To read it typed, augment once: `declare module "@marktiderman/genesis-core" { interface ResourceScope { practiceId?: string } }`.
  - A view field's `timeZone: "practice"` is now `timeZone: "scope"`. `timeZone` is a closed type (`"viewer" | "scope" | TimeZoneName`, the new `TimeZoneName` being `"UTC"`, `"GMT"` or `Area/Location`), so `"practice"` is a type error, and `defineView` throws `ViewDefinitionError` on it (naming the codemod) and on any zone the runtime doesn't know, instead of drawing the column on the viewer's clock.
  - NativeResourceView's `practiceTimeZone` prop is now `scopeTimeZone`; `DisplayTimeZones.practice` is `DisplayTimeZones.scope`, and `resolveZone("practice", …)` is `resolveZone("scope", …)`; `resolveZone` throws on a zone it doesn't know.

  New: `ViewerScope` takes an optional `scopeTimeZone`, the IANA zone of whatever the viewer is scoped to, exposed as `useViewerScope().scopeTimeZone`. When it is absent or empty, the viewer's zone is used. An unknown zone throws in development; in production it is reported once with `reportError` and the viewer's zone is used (the exported `scopeClock` is the check). Web columns with `timeZone: "scope"` read on it (before, the web drew a practice-clock column on the viewer's clock), and NativeResourceView reads its own `scopeTimeZone` prop when given, else the `ViewerScope` value.

  Migrate in one step: `genesis upgrade` runs the `genesis-core-2-scope-names` codemod when genesis-core crosses 2.0.0, or run it by hand with `genesis codemod genesis-core-2-scope-names` (`--dry-run` lists the files). It rewrites `timeZone: "practice"`, `practiceTimeZone` (attribute or object key), `resolveZone("practice", …)` and DisplayTimeZones' `practice` in files that import a Genesis package, and prints the `ResourceScope` augmentation when a file reads `scope.practiceId` and nothing declares it. `genesis doctor`'s `removed-scope-name` rule fails until none are left.

  Migration notes: docs/MIGRATION.md, "Scope-neutral names".

### Minor Changes

- 1bfdf53: Tree mode for lists. `<ResourceView tree={{ getParentId, defaultExpanded, cascadeSelect }} />` (and ResourcePage's `tree`) nests rows under their parent, built from the flat list: depth is computed, the table and list views draw an indent and an expand arrow in the first cell, a sort applies within siblings, search and the status filter keep each match's ancestors (muted), open state is uncontrolled (`defaultExpanded`) or controlled (`expanded`, `onExpandedChange`), and `cascadeSelect` opts in to selecting a row's descendants with it. The table is a WAI-ARIA treegrid (`aria-level`, `aria-expanded`, `aria-posinset`, `aria-setsize`; → opens, ← closes). Client data only: `pagination="server"` or `"cursor"` with `tree` throws. Grid, sheet and NativeResourceView don't draw trees yet.

  genesis-core/resource-view holds the logic, with no React: `treeRows`, `initialExpanded`, `setExpanded`, `cascadeSelection` and the `ResourceTree` type. `useResourceView` / `useResourceTable` surface it: `rows` are the visible rows in order and `tree` holds each row's node, the open set and `setExpanded`. genesis-ui exports `TreeIndent` (the indent and arrow) and the `DataTableTree` and `ResourcePageTreeState` types. See docs/RESOURCE-VIEW.md, "Tree mode".

  Features: resource-tree

## 1.17.0

### Minor Changes

- ca5b9e9: - **Relation labels:** a link cell (`relation` hint) shows the linked row's words instead of its id, on web and native, including native's read-only link in the form sheet. The ids on a page go out as one `in` query per linked resource, never one per cell.
  - **`ViewField.labelField`:** names the linked row's field to show. Default: the linked resource's `labelField` (`describe`), else a `name`/`title`-like field. `defineView` refuses it on a field that isn't a link.
  - **A link never shows its raw id:** a linked row the viewer can't see, one that's gone, or a failed read shows `ViewField.missingLabel`, else the new catalogue word `common.hiddenLink` ("Not available") on web and native.
  - **`useRelationLabel(reference, id, { labelField })`** and `loadRelationLabel` in genesis-core, for any screen that shows a link: `undefined` while loading, `null` when there are no words.

### Patch Changes

- f2437dd: - **Fix:** relation labels send each linked id with the type the cell holds (1 and "1" are both sent as given) and match returned rows either way.
  - **Fix:** a native message catalogue written before `common.hiddenLink` still fits; the English is used when it's missing.

## 1.16.1

### Patch Changes

- a082e49: - **ResourceView `defaults`:** values a new row starts with, sent on create only and never a list filter.
  - **ResourcePage `onSaved(row, action)`:** runs after the built-in form saves.
  - **Fix:** an edit no longer sends a field that is read-only on edit (`readOnlyOnEdit`), so saving no longer fails on a column the person may not update. This covers ResourceView's locked fields and its filter-filled hidden fields.
  - **Fix:** an edit with only read-only fields left sends nothing and still succeeds.
  - **Fix:** a `filter` alone no longer turns on New and Edit. Only the view's own form fields do, so `form: []` means a list with no form.
  - **Fix:** the `date` hint shows a timestamp as its day on the column's clock (the viewer's, by default), not its UTC day, on web and native.
- a082e49: - **Edit validation:** a `readOnlyOnEdit` field is no longer checked, so a row loaded without a required read-only field can still be saved.
  - **Hidden fields:** they are never filled from the URL. They belong to the screen, as its filter or defaults.
  - **Create forms:** a mounted create form follows new screen defaults. Hidden values always update; the rest update only while the form is untouched.
  - **Saved row:** an edit with nothing to write passes its id to `onSuccess`.
  - **Web timestamps:** a timestamp is read on the ViewerScope's clock when its column has no zone of its own.

## 1.16.0

### Minor Changes

- 74b63da: Sort by several fields. `useInfiniteResource` takes `defaultSorts` and returns `setSorts`; it sends them as `ListParams.sorts`, with the first also as `sort` for providers that sort by one field. The Supabase provider now reports `multiSort` and orders by every sort column and then the key, in offset and cursor paging alike. Its keyset cursor holds every sort column's value and handles mixed directions and nulls one column at a time, the same way as before. A sort on the key ends the list and sets the key's order. One-column cursors keep their shape. The mock provider sorts by `sorts` too.

  Features: supabase-provider, resource-page

## 1.15.0

### Minor Changes

- 2000540: `ViewField.labels` gives an enum value its words (`{ draft: "In progress" }`). Columns carry them and form fields get resolved `options`. `view.valueLabel(field, value)` and `valueText(labels, value)` say a value in words. A label for a value the field doesn't have fails `defineView`.

## 1.14.1

### Patch Changes

- 137f05b: ViewerScope reports roles that aren't plain JSON through `reportError` rather than `console.warn`.

## 1.14.0

### Minor Changes

- c103d2d: `/errors` (also exported from the root): one way for every package to report a caught error, and one way to say what kind of error it is.

  - `reportError(error, context)` sends an error a package caught and handled to the host's reporter (`setErrorReporter`, which returns the undo). With none registered it is written with `console.warn` in development and dropped in production. It never throws; the reporter is shared through `globalThis`, so two copies of the package still agree.
  - `classifyError(error)` returns `{ kind, message, report }`: `offline`, `unauthenticated`, `forbidden`, `not-found`, `conflict`, `invalid` or `unexpected`, built on the read and write outcomes (`DataWriteError`, `DataReadError`, Postgres and PostgREST codes), HTTP statuses, Supabase's auth and fetch errors and each runtime's "network request failed". `message` is a safe sentence from `errorMessages` (reword with `{ messages }`), never the error's own text; `report` is true only for what is worth a crash report.

- 796bb53: ResourceWorkspace: one record's screen from a view.

  - `genesis-core/resource-view`: `defineWorkspace(view, { header?: { actions? }, sections, readiness? })`. A section is a child list (`list: { view, filter(row) }`), a few settings (`settings: [...]`, each in `view.writable("edit")`) or a slot the screen fills by `id`. Checked at start-up and frozen; a bad settings field, an unknown header action, a repeated id or a nested workspace throws `ViewDefinitionError`. Pure helpers: `headerFor(row)`, `settingsFields(id?)`, `settingsPatch(id, values)`, `listFilter(id, row)`, `readinessFor(row)` (chip tones only), `readinessSummary(row)` (genesis-core/resource's `readinessOf`), and `isWorkspace`.
  - `genesis-ui`: `<ResourceWorkspace>` puts the header into `AppShellPageHeader` through `ResourceHeader`, registers the sections with `useAppShellSubNav`, draws list sections as embedded `ResourceView`, settings as `SettingsRow` and `ToggleRow` (saving only the section's keys, a zero-row save shown inline as a refusal), and readiness as the `ReadinessChip`. `ResourceHeader` gains a `leading` slot, used for the workspace's `switcher`.
  - `genesis-ui-native`: `<NativeResourceWorkspace>` and `getNativeResourceWorkspaceStackOptions` (title in the navigation bar, actions in the header menu): up to four sections as a segmented control and more as pushed rows, list sections as embedded `NativeResourceView` (its `filter` is the row's `listFilter`), settings as inset grouped rows, readiness as genesis-core/resource's `readinessChip` (its labels in the native messages catalogue) and the checks, and a `switcher` slot.

- 69f509a: Viewer-aware ResourceView guards. Guards, action guards and `when` get the viewer as their last argument (`create(viewer)`, `update(row, viewer)`, `delete(row, viewer)`, action `can(row, viewer)`, `when(row, viewer)`), and `view.can(...)`, `view.canAction(...)`, `workspace.settingsLocked(row, viewer)` and `workspace.headerFor(row, { viewer })` accept it. New `useViewer()` (`{ id, scope, roles }`, or `NO_VIEWER` outside a ViewerScope, so guards fail closed), the `Viewer` type, and `GenesisViewerRoles`, an empty interface apps fill by module augmentation. `ViewerScope` takes an optional `roles`, plain JSON compared by value with lists in any order (a Set, Map or class instance throws in development; in production it warns once and the roles count as unknown, so guards refuse): equal roles change nothing, roles arriving keep the cache, and different roles send the viewer's waiting writes and then reread every query, without remounting (a write the new roles refuse fails like any refused write). `ResolvedColumn.when`'s viewer is optional (no viewer answers for no one), and `view.can("create", row, viewer)` throws rather than reading the row as the viewer. One-argument guards keep working. Guards narrow what a page shows; row-level security stays the boundary.

  Features: resource-page, resource-workspace

### Patch Changes

- b779f13: `ViewTone` (genesis-core/resource-view) is now an alias of `ChipTone` (genesis-core/resource), so there is one tone set.
- 76ea9e4: ResourceView and ResourceWorkspace review fixes.

  - `genesis-core/resource-view`:
    - view actions can be `destructive`; names are trimmed before the checks; `canAction` allows only `true` and turns any other non-reason into a refusal.
    - `rowPicture` takes only http(s) or root-relative image sources.
    - workspaces reject settings that are JSON, lists, links or sensitive, and section keys they don't know.
    - new workspace helpers: `settingsLocked(row)`, `recordId(row)` (by key fields), and `headerFor(row, { can, runnable, served })`.
    - `listFilter` refuses an empty or non-single-valued filter in development; a bad readiness tone falls back to muted with a warning; readiness checks carry a stable `key`.
  - `genesis-ui`: `ResourceWorkspace` shows settings read-only with the reason when update is refused, takes a `can` prop, hides actions nothing can run or the provider doesn't serve, styles destructive actions, and never saves NaN.
  - `genesis-ui-native`: the workspace menu is an action sheet on iOS and a sheet elsewhere (Android alerts show at most three buttons), runs one action at a time, and prefixes accessibility action names. More than four sections open in place with a way back when there is no `onOpenSection`. Settings lock like the web's, and numbers accept a comma decimal and never save NaN. `NativeResourceView` keys rows by the view's key fields.

## 1.13.0

### Minor Changes

- 4712a93: `genesis-core/resource`: the resource workspace's pure rules, with no React: `readinessOf`, `readinessChip`, `dayLabel`, `SAVE_STATE_LABEL`, `prefilledUrl`, `embedSnippet` and the types `ChipTone`, `SaveState`, `Readiness`, `ReadinessFinding`, `ReadinessOptions`, `ReadinessLabels` and `PrefillChoice`, moved from genesis-ui. New `HeadlineNumber` (a headline number as data: `value` is a string or number) and `HeadlineTone`, which a server or a phone app can build.

  Features: resource-workspace

- eb4d080: Count modes for lists: `count: "exact" | "estimated" | "planned" | "none"` on a Supabase resource or per `getList`, with `totalIsEstimate` for approximate totals. `ViewerScope` takes a `scope` (practice, person, space or a set of people), read with `useViewerScope()` / `useOptionalViewerScope()`, plus the viewer's `timeZone` and today on their clock (`day`), which query keys take as their day.
- c098d74: ResourcePage `pagination="cursor"` now searches, sorts and filters on the server, as `pagination="server"` already did. Before, the toolbar's search, the status filter and a header sort worked only on the rows already loaded, so a match on an unloaded page never showed.

  - **What happens now:** each change restarts from the first page with the server's count, and search waits for a pause in typing.
  - **Search box:** it shows only when the list has `searchFields`, since the server needs to know which columns to match.
  - **`useResourceTable`'s `total`:** in cursor mode it's the server's count of matches.

  Cursor lists sort on the server only. Column headers aren't client-sortable there, since a header sort would reorder just the loaded rows, in an order the next page disagrees with. A URL sort on a computed column is ignored. A new search, sort or filter keeps the loaded rows on screen until it lands (core: `useInfiniteResource({ keepPreviousData })`). A shared link starts from its search and sort in one request.

- 2bf5afd: Resource facts from `@genesis` comments: tables take `noun` and `nounPlural`, columns `readonly` and `sensitive` (booleans). `genesis introspect` emits each resource as `as const satisfies ResourceContract<Row>` with a field-name union, so a bad setting fails to compile; row types are now type aliases. Core's `ResourceContract` gains `label`, `labelField`, `noun` and `nounPlural`, and `FieldSchema` gains `readOnly` and `sensitive`.
- f8df3a4: Live updates scale: the Supabase provider shares one realtime channel per resource and list filter (the first equality filter narrows inserts on the server; updates and deletes arrive unfiltered so a row leaving a list is still heard; no server filter for a resource read from a view or function). A write's own realtime echo is skipped once, matched by row and event kind, within `REALTIME_ECHO_MS` (2s). Updates carry the row for resources read from their own table: `live` patches the fields cached rows already have at once (values show as the payload has them until the refetch settles them) and refetches only the lists the change could touch. Each distinct filter value is its own channel; mind the realtime per-client channel limit for screens with many.
- 35145a1: `live` reads resync on an interval while the page is visible (`resyncMs`, default 60s; 0 turns it off). Realtime checks each change against the row's new state, so a row the viewer can no longer read (binned, made a draft, moved) sends them nothing; the resync removes it.
- a93108d: Cursor pages go both ways: the Supabase provider returns `prevCursor` (the rows before a page's first row, read in reverse and turned around), and `useInfiniteResource` takes `maxPages` to keep only that many pages loaded, loading dropped ones again when scrolled back. Realtime echo marks are now skipped once per channel, so two lists of one table don't refetch for your own write.
- bcb938c: **An edit never blanks what it didn't load.** `useResourceForm` (and so ResourcePage, ResourceView and ResourceForm) sends a field the opened record didn't carry only when the person changed it. A list that didn't load a column, or a value the server left out, can no longer be overwritten with an empty one by an unrelated edit. `updates: "all"` restores the old behaviour.

  On a create, a field's `defaultValue` now wins over the blank template ResourcePage builds.

  **ResourceView:**
  - A link named in a view's form is read-only until there's a relation picker, so no one sends a hand-typed id.
  - A screen's `filter` fills those fields on create.

- af29d35: `genesis-core/resource-view`: `defineView(contract, {...})` describes what a resource means to people (labels, display hints, column presets, tabs, form sections, guards, summary) with no React, checked once and frozen. A name the contract doesn't have throws `ViewDefinitionError` at start-up.

  `isSafeUrl` and `normalizeLinkUrl` move to core (`genesis-core/urls`, also the root), so native and the extension use the same link check; genesis-ui re-exports them. The CSV helpers move to `genesis-core/csv`, and a cell that starts with spaces and then a formula character is now neutralised too.

- 32bdd36: `genesis-core/resource-view`: a view's `summary` can carry a picture, `image: { src?, name?, alt? }`. `rowPicture(summary)` says what to draw: the image when `isSafeUrl` accepts its `src` (with initials for when it fails to load), the initials of `name` when the `src` is unsafe or missing, or `null`. `alt` defaults to empty, so the picture is decorative. `initialsOf(name)` takes whole characters, so an emoji or accented letter is never split.

  `genesis-ui`: `ResourceView` draws the summary's picture as an avatar beside the first column of the table.

- 32bdd36: `genesis-core/resource-view`: `scopeValues(view, scope)` returns `{ key: value }` for the scope keys a view declares, read from `ViewerScope`'s `scope` (`practice_id`, then `practiceId`), for a screen's `filter`. In development a declared key with no single value throws `ViewDefinitionError`. Action names `create`, `update` and `delete` are reserved for the view's own operations, and initials come from letters only, so a name with none (`"  "`, `"🎉🎉"`) has no initials and no picture.
- 32bdd36: `genesis-core/resource-view`: a view can declare `actions`, named operations on one row shaped like core's `RowAction` (`name`, `label`, `confirm`, `description`) plus an optional `can(row)` guard that returns `true` or a reason. `defineView` checks them at start-up (unique names, a name and label each, a function guard) and throws `ViewDefinitionError` otherwise. `view.actions()` lists them, frozen, and `view.canAction(name, row)` answers for one row; guards only narrow what the server allows.

### Patch Changes

- f0146a4: A failed search with `keepPreviousData` no longer keeps the old search's count, and a realtime channel reopened on the same topic just after your write hears a teammate's update instead of taking it for your echo.

## 1.12.0

### Minor Changes

- a9e6ea7: `createOrAdopt` takes `scope`: extra filters on the adopt lookup for a partial unique index (e.g. `deleted_at is null`, `kind = 'worksheet'`), so the row adopted is the one the index actually covers.

## 1.11.0

### Minor Changes

- e35cabb: `createOrAdopt` takes `final(existing)`: a row already there that's finished (a sent answer) comes back with `final: true` and is never merged into. The result now always carries `final`.

## 1.10.0

### Minor Changes

- 32c5146: New `@marktiderman/genesis-core/testing`: contract checks an app runs against its own schema (`expectRefused`, `expectServerOwned`, `expectNeverShows`, `expectSees`, `expectBinned`, `expectPlainMessage`), the shared fixture ids `genesis_testing` uses, and `fixtureAccessToken` for signing in as one on a test database.

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
