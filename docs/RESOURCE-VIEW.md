# ResourceView: one description per resource, one line per screen

Design v0.4, 2026-10-26. Status: **approved by the maintainer; building**. v0.4 adds the reuse map from a survey of every Genesis package: most pieces already exist and are promoted or extended, not rebuilt. v0.3 adds what the first adopter's lists need (presets with filters, grouping, manual rank, footer totals).

v0.2 folds in three adversarial reviews (security, speed and scale, API design) and reviews from
the data, layout, native, extension and coordination owners. What changed from v0.1 is listed at
the end.

## The problem

An app built on Genesis today describes each kind of record several times:

- once for the data provider (table, writes, recycle bin);
- once for its form and detail panel (labels, field types, limits);
- once per screen: columns, save and delete code, delete wording, who may edit, empty state,
  storage keys and header switches.

One app audited for this has 25 list screens at 54 to 345 lines each (about 4,400 lines), on top
of about 1,100 lines of its own list wrappers. A change to how lists behave means 25 edits.

## The goal

> Describe a resource once. A standard screen is one line. Customise only what differs, at the
> smallest level that does the job. One change in one place applies everywhere: web, native and
> other surfaces.

Non-goals:

- A visual app builder. Descriptions are typed, reviewed code.
- Reading the schema while the page runs (see "Why not read the schema at run time").
- Builders: one record edited in depth, like a form, course or lesson builder. Those keep
  `AppShellPageHeader`, `ResourceHeader` and `useAppShellSubNav` directly. ResourceView is for
  **collection screens**, lists of records; a plain record screen (header, child lists, a few
  settings) is a `ResourceWorkspace` (see "ResourceWorkspace").

## Reuse map: what already exists and how it's used

A survey of every package found that most of what ResourceView needs already exists. The rule is:
reuse what's there, promote pure pieces to `genesis-core` when a second package needs them, and
build only what's missing.

| Need | Existing piece | Plan |
| --- | --- | --- |
| The web screen | `ResourcePage`, `useResourceTable`, `ResourcePageSlotMap` (genesis-ui) | **ResourceView maps a view onto ResourcePage props and slots.** It isn't a second list page |
| The phone screen | `NativeResourcePage`, `NativeListItem` (title, subtitle, leading, trailing), `InboxPage` swipe actions, `SectionList` (genesis-ui-native) | `NativeResourceView` maps `native.row` onto these |
| Resource facts | `ResourceSchema` (`label`, `labelField`, `access`, `actions`, `createFields`), `FieldSchema` (`widget`, `enumValues`, `references`, `generated`), Supabase resource config (`noun`, `nounPlural`, `searchFields`, `source`, `select`, `writeColumns`, `deleteMode`, `realtime`) | Reuse. `introspect` adds only `readonly` and `sensitive` (boolean comment values) |
| Generated contracts | `emitContracts` → `contracts` (keyed `schema.table`), `GenesisRows` | Views import `contracts`. The name stays |
| Form, sections, conditional fields, validation | `ResourceFormFieldDef` (`group`, `visible`, `disabled`, `maxLength`, `relation`), `useResourceForm` with zod `buildSchema`; studio's `formSchema` and `StudioFormConfig` (`sections`, `visibleWhen`) | **Promote studio's `formSchema` and `form-config` to core.** The view's `form` compiles to `ResourceFormFieldDef[]`, so conditional fields ship in phase 1 |
| CSV export and import | studio `exportCsv` and `parseCsv` (paged through the provider, formula-safe); forms-studio `toCsv`; forms-builder `parseCsvRows` | **Promote one CSV helper to core**, and fix the leading-space formula case there |
| Grouping, sort and filter state | studio `query-state` (sorts, filters, group) | Promote to core, used by `groupBy` and presets |
| Relation labels with no N+1 | studio `usePageLinkLabels` (batched) | **Done:** core `useRelationLabel` batches every id asked for in one tick into one `in` query per linked resource; the `relation` hint uses it on web and native |
| Bulk, import, row actions | provider `updateMany`, `deleteMany`, `importRows({ dryRun })`, `runAction`; studio `BulkEditDialog`, `ImportDialog` | Reuse through the provider, gated on `capabilities()` |
| Header, peek, filters, saved views | `PageHeader`, `DataFilters`, `SavedViewItem`, `DataPageShell`, `DetailPanel`, `ResourceDetailPage`, `ResourceHeader`, `HeadlineNumbers`, `Chip` | Reuse as the header parts and summary chips |
| Drag order, sheet, kanban | `SortableList`, `SheetGrid`, `KanbanBoard` | Reuse |
| Storage | core `useStorage` / `StorageAdapter` | Reuse. `useSavedViews` and `option-storage` move onto it (today they call `localStorage`) |
| Copy | the typed catalogue pattern: `uiMessages` + `UiMessagesProvider` + `fillMessage`, `supportCopy` + `resolveSupportCopy` | A view's copy is a typed `DeepPartial` catalogue with `{name}` placeholders, not dotted string keys. **Plurals are new work:** a small `Intl.PluralRules` helper in core, since none exists |
| Dates | core `/dates`; ui `DateCell` | Reuse `/dates`. **Fix `DateCell`**, which does `new Date("YYYY-MM-DD")` and shifts a day west of UTC, and its hard-coded "—" |
| Tones | `ChipTone` (success, warning, danger, info, muted) | The one tone set for display hints |
| Safe URLs | `isSafeUrl`, `normalizeLinkUrl` (genesis-ui rich text) | **Move to core** so native and the extension use the same check |
| Renderer registries | forms-react / forms-native `createRendererRegistry({ type \| test, rank, Component })` | Display-hint renderers use this shape, passed through context |
| Define and register | Sites `defineSection` (validates and freezes), `Symbol.for` registries | `defineView` validates and freezes the same way |
| Scope and keys | `ViewerScope`, `defineQueryKeys` / `KeyScope { viewer, group, day }` | `scope` joins `KeyScope` |
| Testing | core `/testing` (`expectRefused`, `expectServerOwned`, `expectNeverShows`) | The generated cross-scope stubs use it |
| Refusals | `readFailureMessage`, `DataWriteError`, `showWriteErrorToast` | Reuse for inline refusals |
| Jobs | genesis-supabase `enqueueJob`, `runJobs` | Reuse. **A browser job-status read is new work** |
| Feature gate | features `useFeature`, `FeatureGate` | Gates the sheet toggle. ResourceView gets a FeatureId |
| Doctor | `page-layout` (`…Page`, `…PageShell`), `native-screen-layout` (`…Page`, `…Screen`) | Both rules learn `ResourceView` and `NativeResourceView`. A "lists use ResourceView" rule joins the built-in structure rules |

Naming follows what exists:
- Modes are the existing `ViewMode` (`table`, `grid`, `list`) plus `sheet`. "Cards" means `grid`,
  and the stored choice key is unchanged.
- The permission hook keeps ResourcePage's name, `can`. It returns `true` or a reason, and it can
  only narrow what the server allows.

## The layers

| Layer | Holds | Lives in | Written by |
| --- | --- | --- | --- |
| **Database** | What is allowed: RLS, grants, checks, triggers | Migrations | The app |
| **Resource** | What the data is: fields and types, `labelField`, `noun`, read-only columns, `source`, `select`, `writeColumns`, count mode | `resources.genesis.ts` (generated) plus the provider's resource config | `genesis-cli introspect`, from the catalog and `@genesis` comments |
| **View** | What the data means to people: labels, display hints, column presets, form layout, validation, row guards, empty copy, summary | `genesis-core/resource-view`, with no React; one file beside the feature that owns it | Hand-written |
| **Screen** | How it's shown here: layout, which column preset, scope, header parts, mode, slots | The route or component | Hand-written, usually one line |
| **Renderer** | Platform drawing | `genesis-ui` (web), `genesis-ui-native`, extension surfaces | Genesis |

Precedence is **screen > view > resource > derived**, using the same key names at every level
(`labelField`, not a second `title`), so the review diff shows where a value comes from.

### Resource: generated, then owned

`genesis-cli introspect` already writes the contract from the Postgres catalog. It changes so
that:

- each resource is emitted as `{ ... } satisfies ResourceContract<Row>`, so the row type reaches
  views. Field names come from a per-resource name union, not tuple digging, which keeps type
  checking fast at 200+ tables;
- table and column comments carry `@genesis` settings that become resource facts: `labelField`,
  `noun`, `readonly` (server-owned columns), `sensitive`, `widget`;
- the browser build includes only resources and fields that some view references, and no
  comment text other than `@genesis` labels. The full catalog stays out of client bundles.

A view in the database (`create view my_goals with (security_invoker) as select * from goals
where …`) that Postgres can update on its own (one table in `from`, no joins, grouping or
`distinct`) gets its table's facts: each plain column's nullability, default, link, enum values
and comment, the table's primary key when every key column is in the view, and the table's
`noun`, `nounPlural` and `labelField`. The view's own comments win. A computed column, and a view
that doesn't qualify, keep only what the catalog says about the view. A single-column `CHECK`
that lists values (`status in ('open', 'done')`, alone or `or status is null`) becomes the
field's `enumValues`, so the form offers a choice and the row type is a union.

Contracts are named `schema.table`, with a part quoted when it holds a dot (`"my.s"."we.ird"`).
The Supabase provider splits on the first dot outside quotes and sends a `public` resource to
`client.from(table)` and any other to `client.schema(name).from(table)`; a bare name still means
`public`. Its per-resource config, `binTables` and `realtime` match either spelling of a `public`
resource. With both `goals` and `public.goals` in `resources`, the key spelled the way the caller
names the resource wins, and the other spelling is used only when that key is absent.

Columns are traced by position, so one renamed with `alter view … rename column` keeps its own
facts. A view's own column (computed, or a view that doesn't qualify) leaves `nullable` out of the
contract, since Postgres reports every view column as nullable.

The provider config holds the data-side facts. These are owned by the data layer, not views:

- `source`: a table, a `security_invoker` view, or a set-returning function (`{ rpc, args }`), including `security definer` functions that mask values by policy;
- `select` and `writeColumns`: the read fields come from the source and the write fields from the
  table. ResourceView passes `writeColumns` automatically, so a form built from a joined row never
  sends a joined column;
- the count mode: `exact`, `estimated`, `planned` or none.

### View: meaning, platform-neutral

```ts
// features/brands/brands.view.ts — no React, no DOM: native and the extension import it too
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { contracts } from "../../resources.genesis";

export const brandsView = defineView(contracts["public.brands"], {
  copy: brandsCopy,                        // a typed catalogue (DeepPartial), like uiMessages
  fields: {
    name: { max: 120 },                    // feeds the derived validation
    status: {
      display: "badge",                    // a hint; each platform registers its renderer
      tones: { active: "success" },        // the chip's colour per value
      labels: { draft: "In progress" },    // the words per value; others show in title case
    },
    owner_id: { labelField: "full_name" }, // a link shows the linked row's words (default: its labelField)
  },
  columns: { default: ["name", "status", "created_at"], compact: ["name"] },
  form: ["name", { section: "advanced", fields: ["slug"] }],
  validate: (s) => s.refine((r) => r.slug !== "admin", { path: ["slug"], message: "brands.slug.reserved" }),
  can: { delete: (row) => (row.is_default ? copy.brands.defaultKept : true) },
  summary: (row) => ({ title: row.name, chips: [{ label: brandsView.valueLabel("status", row.status), tone: "info" }] }),
});
```

- **Copy goes through the message catalogue** (`UiMessagesProvider`). A view names a namespace,
  and defaults come from the resource's `noun` and field labels. Plurals use the catalogue's
  plural rules, not `{one, many}`.
- **Display hints, not render functions.** `badge`, `date`, `currency`, `relation`, `url`,
  `image`. Each platform registers renderers once. A one-off renderer goes in a platform file
  (`brands.view.web.tsx`), keyed per platform, so the shared view never imports a platform.
  Icons are names, mapped per platform.
- **Values have words.** `labels` gives an enum value its words once. Badges, form choices,
  native group titles and read-only form values all use them. A summary chip reads the same
  words through `view.valueLabel("status", row.status)`; `valueText(labels, value)` does it
  without a view. Keys must be the field's enum values, so a renamed value fails at start-up.
- **Links have words.** A field with `references` gets the `relation` hint, and its cell shows the
  linked row's words, not its id: the view's `labelField`, else the linked resource's
  `labelField` (`provider.describe`), else a `name`/`title`-like field. Every cell asks for its
  own id and `useRelationLabel` sends the ids asked for in the same moment as one
  `getList(resource, { filters: [{ field, operator: "in" }] })` per linked resource (100 ids a
  request, or the provider's `maxPerPage` if lower), selecting only the key and the naming field when one is known (the view's
  `labelField` or `describe`'s). With neither, it reads whole linked rows (still under the
  viewer's row-level security) and takes a `name`/`title`-like field, so set `labelField` where
  the linked rows carry more than a screen should load. A link never shows its raw id: a row the viewer can't see, one that's gone, or a failed read
  shows the field's `missingLabel` ("Someone you can't see"), else the catalogue's
  `common.hiddenLink`. Labels are cached for a minute and refresh when the linked resource is
  written. Native's read-only link in the form sheet shows the same words.
- **Validation is derived** from the contract (nullability, enums, `max`) as a Standard Schema
  (zod). `validate` only adds rules.
- **Computed columns** (`columns: { full_name: { value: (r) => ... } }`) and **row actions**
  (decorating the resource's `actions`) are part of the view.
- **Presets carry filters as well as columns.** `presets: { short: { filter: { term: "short" }, columns: [...] } }` show as tabs (team or private, short- or long-term, this quarter).
- **Grouping:** `groupBy: "owner_id"`, with group headers and counts.
- **Manual order:** `orderBy: { field: "rank", manual: true }` turns on drag to reorder, plus keyboard pick-up and the Move menu, on SortableList's engine (one drag engine). The rank is written through the provider.
- **Footer totals:** `totals: (rows) => ...` for a figure such as a week's completion %.
- **Dates are days or instants, never confused.** The `date` hint formats a calendar day
  (`YYYY-MM-DD`) from its parts, never `new Date(day)`. A timestamp renders on the viewer's clock
  with `genesis-core/dates` (`wallClock(personTimeZone(viewer), at)`). `timeZone: "scope"` renders it
  on the clock of whatever the screen is scoped to (ViewerScope's `scopeTimeZone`: a location's, a
  league's), and an IANA name on that zone, for example class times. `timeZone` is a closed type
  (`"viewer"`, `"scope"` or an IANA name), and `defineView` refuses a zone the runtime doesn't
  know, so a misspelt or removed name (`"practice"`) fails when the view loads instead of drawing
  times on the viewer's clock. "Today" and "this week" filters
  are person-days from the scope (`personDay`, `startOfWeek`, `dayRangeIn`), so no view or screen
  computes "today" itself, and Genesis code never slices an ISO string to get a date.
- **Columns shown only when the data allows.** A function source can mask a value by policy (an
  anonymous author, a hidden name) and return `null` with a flag column. `fields.author.when:
  (row) => row.author_visible` shows the column or cell only when the server says so. The masking
  itself is the server's.
- **Rollups:** `totals` can be per group as well as overall (an average and spread per team,
  then a combined row), for assessment-style lists.
- **`summary(row)`** gives a one-line title and chips for pickers, notifications, extension page
  bars and other non-list surfaces. It defaults to `labelField` plus a few columns.

### Screen: one line, presentation only

```tsx
<ResourceView view={brandsView} />
<ResourceView view={brandsView} columns="compact" layout="embedded" filter={{ org_id }} />
<ResourceView view={sessionsView} layout="embedded" filter={{ client_id: id }} mode="cards" />
```

Screen settings:

- `layout`: `page`, `embedded` or `compact`;
- `columns`: a preset;
- `filter`: filters on the list, which a new row also gets. `null` means "is empty" and a list
  means "any of" (`{ status: ["open", "blocked"] }`, sent as `in`; a new row doesn't get a list).
  A field the form shows starts at the filter's value; one it doesn't show is filled hidden and
  sent on create only;
- `defaults`: values a new row starts with (`{ author_scope: viewer.scope }`), sent on create only
  and never a list filter. A field the form shows starts at the value; one it doesn't show is
  filled hidden and sent on create, like `filter`. The filter wins a clash;
- `onSaved(row, action)`: after the built-in form saves, e.g. to open a builder for a new row.
  A pessimistic save gives the server's row with its key;
- `mode`: `table`, `grid` (cards), `list` or `sheet`;
- `header`: parts on or off, or one part filled;
- `slots`: `peekExtra`, `detail`, `card`, `toolbar`, `rowActions`, `header`;
- `onTotal`: for a parent tab's badge;
- `tree`: nested rows from a flat list ([Tree mode](#tree-mode)).

`useResourceView(view, options)` is the headless form, with the same state as `useResourceTable`.

An input left empty is no value, when the contract says whether its column takes null (the view
passes `nullable` and `hasDefault` to the form; a hand-written `ResourceFormFieldDef` can set
them too). A create leaves it out, so the column's default (or null) applies; an edit sends null
once the person empties it. A text column that can't be null keeps `""` (on a create, only when
it has no default), and so does a value the screen started the field at (`filter`, `defaults`).
A field the contract says nothing about, and an edit of a field nobody touched, send what they
always did. The phone's NativeResourceView follows the same rule.

### Words: each step overrides the one before

Every piece of text has a Genesis default, and the app can always override it:

1. **The resource name.** `my_goals` gives the noun "my goal" and the title "My Goals". Plurals
   invert the singulars (entry → entries, person → people); with only a derived noun, a label that
   reads as a plural ("People") is used for several.
2. **The contract:** `noun`, `nounPlural` and `label`, which `introspect` reads from the table
   comment (`comment on table goals is '@genesis {"noun": "goal"}'`). A simple view inherits its
   table's noun.
3. **The view's `copy`:** `noun`, `nounPlural`, `title`, `create`, `form.createTitle` /
   `form.editTitle`, and `count.one` / `count.other` / `count.filtered`. Templates take `{noun}`,
   `{nouns}`, `{count}` and `{total}`.
4. **The screen's props:** `title`, `noun`, `nounPlural`, `formTitles`, `countFormat`,
   `createLabel`.

ResourceView hands the resolved noun to the count ("1 goal", "3 goals", "2 of 3") and to the form
("New goal", "Edit goal"). The default templates are the UI catalogue's (`page.countOne`,
`page.countOther`, `page.countFiltered`, `form.createTitle`, `form.editTitle`), so an app rewords
or translates them once with `UiMessagesProvider`. A ResourceForm without a noun keeps its old
title ("Create My Goal").

## Customise in steps

Use the smallest step that does the job:

1. **A screen setting**, such as `columns="compact"`, `mode="cards"` or
   `header={{ search: true }}`.
2. **The view**, so every screen of that resource gets it: a label, a display hint, a column, a
   form section or a guard.
3. **A slot** on one screen: `peekExtra`, `detail`, `toolbar`, `rowActions`, or the header.
4. **Headless**: `useResourceView` with your own layout.

A change to a view reaches every screen of that resource on every platform. A change to a
renderer reaches every app.

## Header and layout

The header parts are `title`, `subtitle`, `count`, `search`, `filters`, `views`, `viewToggle`,
`settings`, `create` and `actions`. They are today's PageHeader, DataFilters and DataPageShell
pieces, re-exported, not a new namespace. `header={{...}}` switches or fills parts, and
`slots.header` replaces the header.

There is one owner of the page header per route:

- **`layout="page"`:** the title, subtitle, count, create and actions go into
  `AppShellPageHeader`, above the shell's tabs, as on workspace pages. Search, filters, views and
  the view toggle stay in the content. Back navigation comes from the shell only. A custom header
  also goes into `AppShellPageHeader`.
- **`layout="embedded"`:** a list inside a page or a workspace tab. It never portals into the page
  header, never registers sub-navigation and never claims the title. It shows only its toolbar
  parts (the `variant="embedded"` rules already in genesis-ui).
- **`layout="compact"`:** a narrow surface such as an extension side panel or popup. It's one
  column and the peek opens as a sheet.

On phones:

- search collapses to an icon;
- filters and views open in a sheet;
- create stays the primary button;
- the bottom bar belongs to the shell and is never touched.

## Modes: table, cards, sheet

`mode="sheet"` is the "studio" switch: a spreadsheet with inline editing for this one resource.

- It is built on genesis-ui's `SheetGrid`, loaded with `React.lazy` the first time it's used.
  `genesis-studio` already depends on genesis-ui, so the reverse dependency isn't possible.
- Edits go through `useResource`, so they get the same cache updates, undo and refusal handling as
  the form. Nothing writes around the provider.
- **Editable cells are an allow-list.** Only fields the view's `form` names are editable. Tenant,
  owner and `readonly` columns never are. Without that rule, a provider with no `describe()` would
  offer every column.
- **Multi-cell paste needs the provider's `bulkWrites`.** Otherwise it is off, and it is never a
  non-transactional loop. When it's on, the paste is one undoable unit and each row is still
  checked for refusal.
- Version checks apply only where the provider supports them (`versionedWrites`). The Supabase
  provider doesn't today, and the doc doesn't claim otherwise.
- Rows and columns are virtualised.
- **Who can switch modes:**
  - The developer makes sheet mode available with `mode` or `modes={["table", "sheet"]}`.
  - A user toggle for it sits behind the feature gate and an admin permission. Otherwise every
    list grows a spreadsheet button.

## Security model

ResourceView adds **no authority**. The layers, in order:

1. **The database decides.** RLS, grants, checks and triggers. This is the guarantee.
2. **The provider reports, where it can.** `describe()` (studio-server today) narrows what the UI
   offers. The Supabase provider has no `describe()`, and every signed-in user shares the
   `authenticated` role, so per-user field permissions don't exist in the browser. There, server-
   owned columns are marked once with `@genesis readonly`.
3. **The feature gate** decides whether a capability shows at all.
4. **View guards** only narrow, for row-state rules the server can't cheaply express ("the
   default brand can't be deleted"). Every guard gives a reason, shown on the disabled control. The
   effective right is `server AND guard`, never OR. If a guard encodes an invariant, the database
   must enforce it too, with a contract test.
5. **Refusals are shown inline** in plain words: forbidden, gone, or a P0001 guard message. That's
   the safety net that makes drift visible instead of silent.

What's needed from the app's database:

- **Hidden is not protected.** `columns`, `fields.x.hidden` and `select` are presentation and
  bandwidth only. Any column some users must never read goes in a separate table, a
  `security_invoker` view over a base table whose SELECT is revoked, or a function. A field marked
  `sensitive` is refused at render time when the provider can't confirm the user may read it (fail
  closed).
- **Scope is never trusted.** A scope default such as `org_id` comes from the browser. Every
  scoped resource needs:
  - INSERT and UPDATE policies `WITH CHECK` membership;
  - the tenant column immutable after insert;
  - tenant and owner columns left out of forms and the sheet by default.

  `introspect` generates a `genesis-core/testing` stub per scoped resource, asserting that a
  cross-scope insert and update are refused.
- **References fail closed.** When RLS hides a referenced row, show "—", never the raw id or a
  title cached for someone else. `ViewerScope` resets the cache when the viewer changes.
- **Live updates stream rows.** Every table in `supabase_realtime` needs RLS with SELECT policies.
  Tables with sensitive columns aren't published, or publish a column list, with the default
  replica identity. `live` on a `source` view streams the base table's events.
- **URLs are checked.** `url` and `image` fields go through the same http(s), mailto and tel
  allow-list as rich text, on web and native, and an invalid value renders as text instead of
  crashing the list.
- **CSV export** requests only the exported fields and escapes formula-leading cells, including
  ones with leading spaces.

## Scope

`ViewerScope` (core) stays the one boundary. It already answers *who* is looking and resets the
cache. It gains an optional `scope` object that answers *where*: a person or space, a set of people
(`personIds: string[]`), or whatever the app scopes to, under its own key in the open slot
(`scope={{ orgId }}`, `scope={{ leagueId }}`, `scope={{ locationId }}`). Genesis names no tenant:
each app's word for it is its own. To read an app key typed, augment `ResourceScope` once, as with
`GenesisViewerRoles`:
`declare module "@marktiderman/genesis-core" { interface ResourceScope { leagueId?: string } }`.
`scopeTimeZone` is that scope's clock, for columns with `timeZone: "scope"`.

- Scope becomes server filters, never a filter on loaded rows, so paging and totals stay right.
  It's part of every cache key.
- A view declares which scope keys it needs, so a missing scope fails loudly in development.
  `scopeValues(view, useViewerScope().scope)` turns them into a screen's `filter` (`league_id`
  read as `league_id` or `leagueId`), and throws in development when one is missing.
- A screen's `filter` and `defaults` override the scope: an admin screen across organizations and a
  client screen can share one view.
- `ResourceView` requires `ViewerScope` above it.

## Viewer-aware guards

Guards, action guards and `when` get the viewer as their last argument: `create(viewer)`,
`update(row, viewer)`, `delete(row, viewer)`, an action's `can(row, viewer)` and a field's
`when(row, viewer)`. The viewer is `{ id, scope, roles? }`, read by `useViewer()` from the nearest
`ViewerScope`. ResourceView, NativeResourceView and both workspaces read it themselves and pass it
to every cell, the peek, swipe actions, the create button, header actions and the settings lock.
Outside a renderer, pass it yourself: `view.can("update", row, viewer)`,
`view.canAction("archive", row, viewer)`, `workspace.settingsLocked(row, viewer)`,
`workspace.headerFor(row, { viewer })`.

```ts
// Once in the app: the roles it knows. Core's interface is empty; the app fills it.
declare module "@marktiderman/genesis-core" {
  interface GenesisViewerRoles {
    teamRoles?: readonly ("owner" | "editor" | "reader")[];
  }
}

<ViewerScope viewer={userId} scope={{ teamId }} roles={{ teamRoles }}>…</ViewerScope>

export const notesView = defineView(contracts["public.notes"], {
  can: { update: (row, viewer) => (row.owner_id === viewer.id ? true : "Only its owner edits a note.") },
  actions: [{ name: "share", label: "Share", can: (_row, viewer) => (viewer.roles?.teamRoles?.includes("editor") ? true : "Editors share notes.") }],
  fields: { private_note: { when: (row, viewer) => row.owner_id === viewer.id } },
});
```

- **Guards narrow what the page shows; RLS is the boundary.** A guard is never a security check:
  it hides or refuses a control the server would refuse anyway. Anything a guard enforces, the
  database enforces too.
- **Fail closed.** Without a ViewerScope the viewer is `NO_VIEWER` (`{ id: null, scope: {} }`),
  and so are calls that don't pass one, so a guard that needs the viewer refuses with its reason.
  Roles are undefined until the app knows them, and a guard that needs them refuses meanwhile.
- **Pure and synchronous.** Guards read the row and the viewer, nothing else. A new viewer or new
  roles asks every guard again.
- **One-argument guards still work**: `(row) => …` ignores the viewer.
- **Roles compare by value.** ViewerScope compares `roles` as plain JSON with sorted keys and
  lists in any order, so a new object with equal roles each render changes nothing. Roles arriving
  (undefined → roles) or going back to undefined while they reload change nothing. Different roles
  for the same viewer send the viewer's waiting writes (the session is still theirs; a write the
  new roles refuse fails like any refused write), then reread every query, with nothing remounted
  or emptied. Until the reread lands, rows the old roles could see stay on screen; guards already
  use the new roles, and row-level security refuses any write they no longer allow. Only a
  different viewer empties the cache and remounts the screens, dropping waiting writes. Roles that
  aren't plain JSON (a Set, Map or class) throw in development; in production they warn once and
  count as unknown, so guards refuse.

The augmentation is TypeScript's interface merging into a module ("Module augmentation" in the
handbook's Declaration Merging page): it patches the existing `GenesisViewerRoles`, so it must
target a module that exports it (`@marktiderman/genesis-core`, or its `/resource-view` subpath),
and adds no new top-level declarations.

## Tree mode

`tree` on a screen nests rows under their parent, built from the flat list the screen already
loads. It is a screen option, not a `mode`: it applies to the table and list views; grid and sheet
ignore it for now.

```tsx
<ResourceView
  view={leaguesView}
  tree={{ getParentId: (league) => league.parent_id, defaultExpanded: 1, cascadeSelect: false }}
/>
```

- **Built from data.** `getParentId(row)` names the parent's key (the row key ResourcePage uses:
  `getKey`, else `id`); `null`, `undefined` or `""` is a root. Nested input is never needed. A
  row whose parent isn't loaded is a root, and a cycle loses one link rather than hiding rows.
- **Depth is computed** from the tree, and the indent and the expand arrow sit in the first cell
  (the list view's title). Nothing else in the row changes.
- **Open state** is uncontrolled (`defaultExpanded`: `true` every parent, a depth such as `1` for
  the roots' children, `false` none, the default) or controlled (`expanded`, a set of keys, with
  `onExpandedChange`), as selection is.
- **Sort applies within siblings.** A header sort reorders each set of siblings; a child never
  leaves its parent.
- **A filter keeps ancestors.** Search and the status filter keep every match and each of its
  ancestors, opened so the match shows, and drawn muted (`data-tree-context`) so the match stands
  out. Anything else is left out, a match's own non-matching children included.
- **Selection doesn't cascade** by default. `cascadeSelect: true` makes selecting a row select its
  descendants (collapsed ones too) and clearing it clear them.
- **Accessible.** The table is a WAI-ARIA treegrid: rows carry `aria-level`, `aria-expanded`
  (parents only), `aria-posinset` and `aria-setsize`; on a row's open button → opens a closed row,
  then moves to its first child, and ← closes an open row, then moves to its parent. The arrow is
  a labelled button ("Expand North"), out of the tab order where the row's keys do its job.
- **Pages can split a family.** The table's client-side pager cuts the visible rows into pages
  of a fixed size, in tree order, so an expanded parent can sit at the bottom of one page with
  its children at the top of the next. A child's indent and `aria-level` still say where it
  belongs, and opening or closing a row keeps the current page. Keeping a family on one page
  would make page sizes uneven and page counts change as rows open; for a tree that shouldn't
  split, raise the page size or turn the table's paging off (`slotProps={{ table: { pagination: false, virtualize: true } }}`).
- **Client data only.** A tree needs every row, so `tree` loads the whole list
  (`pagination="client"`, up to `clientRowLimit`, with the usual "only N loaded" warning).
  `pagination="server"` or `"cursor"` with `tree` throws, and `genesis doctor`'s
  `resource-view-tree` rule says so in CI. Children loaded from the server on expand are not part
  of this.
- **Headless.** The logic is genesis-core's `treeRows` (no React: build, visible rows, sort within
  siblings, filter with ancestors), with `initialExpanded`, `setExpanded` and
  `cascadeSelection`. `useResourceView` runs it: `rows` are the visible rows in order, and
  `tree` holds each row's node (depth, open state, position), the open set and `setExpanded`.
  NativeResourceView doesn't draw trees yet; it can reuse the same core logic.

## Speed and scale

The defaults are chosen for large data:

- **Paging defaults to server.** Use cursor paging for feeds. Client paging is opt-in, for
  resources the contract marks small, with virtualisation on and a development warning above about
  1,000 rows.
- **Counts:** `estimated` above a threshold, and none at all when the header shows no count.
- **Search** needs `searchFields` and an index able to serve `ilike` (`pg_trgm`). `introspect`
  warns when one is missing. Search is debounced.
- **Cursor mode searches and sorts on the server.** Today it searches only the pages already
  loaded; that gets fixed in genesis-ui.
- **Live:**
  - it is opt-in;
  - one channel per resource per client, filtered by the scope's equality filters;
  - the user's own writes are not echoed back;
  - a changed row is patched by id where the payload allows, with an invalidation as the fallback;
  - only queries whose filters could match are invalidated;
  - infinite queries keep a page cap;
  - `ResourceView` warns in development when `live` is set but the table isn't published.
- **Peek and form** fetch their row by id when they open, rather than widening the list's
  `select`. They load lazily on first open.
- **References** become bounded PostgREST embeds (`brand:brands(name)`), with no N+1. A filtered
  child count never goes through embeds: it comes from a `source` view.
- **Big exports, imports and pastes run as jobs.** Above a threshold (about 500 rows, or past the
  provider's `bulkWrites` limit), CSV export, import and multi-row paste go to
  `genesis-supabase/jobs` (`enqueueJob(admin, "resource.export", { resource, filters, viewer })`)
  through an app server function, with an idempotency key so a double click is one job. The
  browser watches the job instead of looping writes. Below the threshold they stay synchronous.
- **Identity:** views are module constants. Derived columns and options are memoised. The
  messages provider is given a stable object.

## ResourceWorkspace

One record's screen from its view, defined once with no React and drawn on web and native:

```ts
export const brandWorkspace = defineWorkspace(brandsView, {
  header: { actions: ["archive"] },          // view actions; default: all of them
  sections: [
    { id: "products", label: "Products", list: { view: productsView, filter: (b) => ({ brand_id: b.id }) } },
    { id: "settings", label: "Settings", settings: ["name", "website"] },
    { id: "activity", label: "Activity" },   // the screen fills it: slots.activity
  ],
  readiness: (b) => [{ title: "Has a website", ok: !!b.website, reason: "Add the website." }],
});
```

- **Checked at start-up** (`ViewDefinitionError`): settings fields must be in
  `view.writable("edit")` and edit in place (not JSON, a list, a link or sensitive), header actions
  must be view actions, section ids are unique, a section has only `id`, `label` and one of `list`
  or `settings`, and sections don't nest.
- **Helpers** the renderers share: `headerFor(row, { can, runnable, served })` (the summary plus
  actions, narrowed by the view's guards, the screen's `can` and what the provider serves),
  `settingsFields(id?)`, `settingsLocked(row)` (the view's `can("update")` reason, shown with the
  settings read-only), `settingsPatch(id, values)`, `recordId(row)` (by the key fields),
  `listFilter(id, row)` (at least one key, single values; checked in development),
  `readinessFor(row)` and `readinessSummary(row)`.
- **List sections** pass `listFilter(id, row)` as the child list's `filter`, which also fills
  those fields, hidden, on create.
- **Web** `<ResourceWorkspace workspace row section sectionHref can? onAction? />`: the header in
  `AppShellPageHeader` through `ResourceHeader` (a `switcher` in its leading area), sections as
  the shell's tabs, list sections as embedded `ResourceView`, settings as `SettingsRow` and
  `ToggleRow`, readiness as the `ReadinessChip`.
- **Native** `<NativeResourceWorkspace workspace row />` with
  `getNativeResourceWorkspaceStackOptions` for the title and the header menu (an action sheet on
  iOS, a sheet of rows elsewhere, destructive actions marked; one action runs at a time): up to
  four sections as a segmented control; more as rows that push through `onOpenSection`, or open
  in place with an "All sections" row back.
- **Saving** sends only the section's changed, listed, visible keys. A save that matches no rows
  is a refusal, shown inline; a number field never saves NaN.

## Native

`NativeResourceView` reads the same view and renders native patterns:

- **Rows, not columns:** `native.row: { title, subtitle, leading, trailing }`, where `subtitle` can
  join fields. `sectionBy` gives inset-grouped sections. The fallback is `labelField` plus two
  columns.
- **Form sheet:** Cancel and Save in the nav bar, sections as grouped sections, native date and
  time pickers, choices as a segmented control or a pushed list, and the keyboard toolbar from
  FormFocus.
- **Swipe actions:** guards drive the swipe Delete, and actions take icon names. Delete wording
  follows the provider's real capability (`bin.restorable`).
- **The peek pushes a detail screen** when a view declares `native.detail` (a route), so deep
  links and notification taps land in the same place.
- **Paging and writes:** cursor paging with `onEndReached`. Search debounced at 300 ms. Zero-row
  refusals and optimistic updates with rollback.
- **Doctor:** `native-screen-layout` counts `NativeResourceView` as a layout.

## Other surfaces (extensions, popups, side panels)

- The view entry has no React and no DOM, so a service worker, content script or server code can
  use `summary`, labels, the `select` list and form data.
- The provider and session come from context, never a global browser client. A pluggable session
  store (`chrome.storage`, SecureStore) and a storage adapter for saved views and preferences
  replace direct `localStorage`.
- Nothing assumes a router, SSR or a full page. `layout="compact"` and `paging="infinite"` cover
  narrow surfaces. A `detail` slot covers rich detail layouts (a player with a transcript).
- `describe()` and the batched permissions check are cached per user, scope and resource, so a
  popup opened many times a session doesn't pay round trips each time.

## Alignment with Genesis Sites

Sites already has the pattern this design needs, so ResourceView follows it rather than inventing
a second one:

| Sites (`defineSection`) | ResourceView (`defineView`) |
| --- | --- |
| A zod `schema` drives the editor's fields and checks | Validation is derived as a Standard Schema (zod), with `validate` adding rules |
| `variants` and `presets` | `layout` and `presets` (columns plus filters) |
| `version` plus `migrations` on stored props | `version` plus `migrations` on stored user preferences (saved views, column order) |
| Manifests with no renderers (`sectionManifests()`) | View definitions with no React (`genesis-core/resource-view`) |
| A registry from section type to renderer | Per-platform renderer registries keyed by display hint |

Later, page types meet. A Sites section type `resource-list` (a view plus a preset) would let an
admin page be composed like a landing page: a hero, headline numbers, then a list. The same
document model and renderer registry would serve both public and admin pages. That isn't in phase
1. The shapes above are chosen so it can be added without changing either side.

## Why not read the schema at run time

Data Studio reads it at run time because it must work on any table. Product screens shouldn't:

- labels, order, hidden fields and rules are reviewed decisions;
- hosted Supabase no longer serves its schema to browser keys;
- a run-time read costs a round trip before the first paint;
- the compiler can't check names it learns at run time.

`introspect` gives the same zero-effort start ahead of time: `defineView(resource, {})` is
already a working screen.

## Who builds what, and in what order

| Phase | Piece | Owner |
| --- | --- | --- |
| 0 | Resource facts from `@genesis` comments (`labelField`, `noun`, `readonly`, `sensitive`); `satisfies ResourceContract<Row>` emit and name unions; browser-only contract | Less (core, introspect) |
| 0 | Count mode; `ViewerScope.scope` (including sets); live: filtered shared channels, no echo, patch by id | Less |
| 0 | Cursor-mode server search and sort in `useResourceTable`; lazy peek and form; virtualisation default | Shell |
| 1 | `genesis-core/resource-view`: `defineView`, view types, derived validation, `summary`, guards | Shell |
| 1 | `ResourceView`, `useResourceView`, header parts, page/embedded/compact layouts, renderer registry with web renderers, URL allow-list | Shell |
| 1 | Three pilot screens: one plain admin list, one list embedded in a workspace tab, and one hard list (Tasks). Line counts measured before and after | Shell |
| 2 | `mode="sheet"` on `SheetGrid` | Shell |
| 2 | `NativeResourceView`: rows, form sheet, swipe actions, detail routes (about 3 days) | Scout |
| 2 | Session-agnostic provider and storage adapter, batched permissions feeding guards, `summary` → page bar, compact and detail layouts | Port |
| 3 | Remaining app screens, then a doctor rule: new list screens use ResourceView | Shell with app owners |
| 2 | `ResourceWorkspace` and `NativeResourceWorkspace`: header, sections, settings, readiness from the same view | — |
| 3 | Tree mode on the web: `tree={{ getParentId, defaultExpanded, cascadeSelect }}` on table and list ([Tree mode](#tree-mode)); logic in `genesis-core/resource-view` | Shell (review) |
| later | Tree mode in NativeResourceView (reusing core's `treeRows`), children loaded on expand, conditional form fields | — |

Web phase 1 is about 5 days. Each phase ships as its own release.

## What changed from v0.1

- **Removed false claims:**
  - the Supabase provider has no `describe()`, so per-user field permissions in the browser and
    "never requests unreadable columns" are gone;
  - version checks exist only where the provider supports them;
  - `genesis-studio` can't be an optional peer, so sheet mode is built on genesis-ui's `SheetGrid`.
- **Added a security model**, with the five layers named and the database requirements spelled
  out: tenant `WITH CHECK` and an immutable tenant column, real separation for sensitive columns,
  realtime RLS, URL checks and CSV export.
- **Changed the defaults for scale:** server paging, estimated counts, search indexes, and the
  live-update changes.
- **Split view from screen:** views carry meaning and column presets, screens carry presentation.
  The same key names are used at every level, with a precedence rule.
- **Moved view types into genesis-core** with no React; display hints and per-platform renderer
  registries replace render functions in shared views.
- **Copy goes through `UiMessagesProvider`**, with real plurals.
- **Replaced the second scope context** with `ViewerScope.scope`, and made scope a screen
  override.
- **Renamed and narrowed things:**
  - `can` became `guards`, which only narrow and need a reason;
  - `studio` became `mode="sheet"`, with an allow-list of editable fields;
  - `header` is now split from `slots.header`.
- **Added:** `summary`, `compact` layout, `detail` slot, native row mapping and the native detail
  route, computed columns, row actions, derived validation.
- **Cut:** codegen view stubs, the separate `ResourceScope` provider, and native in the first slice.
- **Scoped to collection screens**, with workspaces named as a later, separate piece.
