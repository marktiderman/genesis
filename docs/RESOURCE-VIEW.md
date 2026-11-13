# ResourceView: one description per resource, one line per screen

Design v0.4, 2026-10-26. Status: **approved by the maintainer; building**. This page describes what ships today; anything not built yet says **Planned** and names its `features.ts` entry, and `pnpm check:docs-match-exports` keeps the rest in line with the packages' types. v0.4 adds the reuse map from a survey of every Genesis package: most pieces already exist and are promoted or extended, not rebuilt. v0.3 adds what the first adopter's lists need (presets with filters, grouping, manual rank, footer totals).

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
  settings) is a `RecordView` (see "RecordView").

## Reuse map: what already exists and how it's used

A survey of every package found that most of what ResourceView needs already exists. The rule is:
reuse what's there, promote pure pieces to `genesis-core` when a second package needs them, and
build only what's missing.

| Need | Existing piece | Plan |
| --- | --- | --- |
| The web screen | `ResourcePage`, `useResourceTable`, `ResourcePageSlotMap` (genesis-ui) | **ResourceView maps a view onto ResourcePage props and slots.** It isn't a second list page |
| The phone screen | `NativeResourcePage`, `NativeListItem` (title, subtitle, leading, trailing), `InboxPage` swipe actions, `SectionList` (genesis-ui-native) | `NativeResourceView` maps the view's `summary` and `groupBy` onto these |
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
| Doctor | `page-layout` (`…Page`, `…PageShell`), `native-screen-layout` (`…Page`, `…Screen`) | Both rules learn `ResourceView` and `NativeResourceView`. **Done:** the packages declare `ui/lists-use-resource-view`, `ui/records-use-record-view`, `ui-native/lists-use-native-resource-view` and `core/direct-data-access` (genesis-cli README, "Package rules") |

Naming follows what exists:
- Modes are the existing `ViewMode` (`table`, `grid`, `list`), plus `calendar` and, later,
  `sheet`. "Cards" means `grid`, and the stored choice key is unchanged.
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

<!-- api: ViewDefinition<any>, ViewField -->

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
- **Links are picked, never typed.** A link is read-only in a form unless the view opts it in;
  then it's a picker over the linked rows ([Links in forms](#links-in-forms)). Filtering a list by a linked row from its header is
  **Planned** ([`resource-view-links`](../features.ts)).
- **Validation is derived** from the contract (nullability, enums, `max`): the form's fields get
  `required`, `maxLength` and their choices. A view has no hook of its own for further rules; a
  rule the server must hold goes in the database and comes back as a refusal.
- **Computed columns** (an entry `{ key: "full_name", label: "Name", value: (r) => ... }` in a
  column list) and **row actions** (`actions`, shaped like the resource's) are part of the view.
- **Presets carry filters as well as columns.** `presets: { short: { filter: { term: "short" }, columns: "compact" } }` (a column preset by name) show as tabs (team or private, short- or long-term, this quarter).
- **Grouping:** `groupBy: "owner_id"`. NativeResourceView shows the groups as sections, sorted on
  the server. On the web, group headers with counts are **Planned** ([`resource-view-shaping`](../features.ts)).
- **Empty values in a sort:** `orderBy: { field: "rating", direction: "desc", nulls: "last" }` keeps rows
  with no value below the rated ones; unset, the store decides, and Postgres puts them first on a
  descending sort. Each of a screen's own sort options in the filters slot takes the same `nulls`,
  as does `resourceOptions.defaultSort`, and a header sort on the default's field and direction keeps it.
- **Order:** `orderBy: { field: "rank", direction: "asc" }` is the default sort. Drag to reorder
  with `manual: true` (keyboard pick-up, the Move menu, the rank written through the provider) is
  **Planned** ([`resource-view-shaping`](../features.ts)): today `manual` is accepted and ignored.
- **Footer totals** (a figure such as a week's completion %), overall and per group for
  assessment-style lists: **Planned** ([`resource-view-shaping`](../features.ts)).
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
- **`summary(row)`** gives a one-line title and chips for pickers, notifications, extension page
  bars and other non-list surfaces. Without one, the title is the `labelField`'s value (else the
  noun).

### Screen: one line, presentation only

<!-- api: ResourceViewProps -->

```tsx
<ResourceView view={brandsView} />
<ResourceView view={brandsView} columns="compact" layout="embedded" filter={{ org_id }} />
<ResourceView view={sessionsView} layout="embedded" filter={{ client_id: id }} mode="grid" />
```

Screen settings:

- `layout`: `page`, `embedded` or `compact`;
- `columns`: a preset;
- `filter`: filters on the list, which a new row also gets. `null` means "is empty" and a list
  means "any of" (`{ status: ["open", "blocked"] }`, sent as `in`; a new row doesn't get a list).
  A field the form shows starts at the filter's value; one it doesn't show is filled hidden and
  sent on create only. A link the filter pins is always filled hidden ([Links in forms](#links-in-forms));
- `defaults`: values a new row starts with (`{ author_scope: viewer.scope }`), sent on create only
  and never a list filter. A field the form shows starts at the value; one it doesn't show is
  filled hidden and sent on create, like `filter`. The filter wins a clash;
- `onSaved(row, action)`: after the built-in form saves, e.g. to open a builder for a new row.
  A pessimistic save gives the server's row with its key;
- `mode`: `table`, `grid` (cards), `list`, `calendar` ([Calendar](#calendar)) or `board`
  ([Board](#board)); `sheet` is
  **Planned** ([`resource-view-sheet`](../features.ts));
- `header`: `page` (the full header) or `toolbar` (its actions without the title block);
- `toolbar`: content beside the header's actions;
- `cells`: draw some cells this screen's way, by column key;
- `slots` and `slotProps`: replace or adjust ResourcePage's parts (`shell`, `filters`, `bulkBar`,
  `grid`, `table`, `detail`, `form`, `deleteDialog`);
- `tree`: nested rows from a flat list ([Tree mode](#tree-mode)).
- `calendar` and `board`: the screen's settings for those modes, over the view's blocks.

Every other ResourcePage prop passes through (`renderCard`, `renderDetail`, `live`, `pagination`).

`useResourceView(props)` is the headless form: the same props, returning `useResourceTable`'s state.

**A form without the list.** `<ResourceForm view={tasksView} action="create" …>` opens the form
ResourceView would, with no list around it: a form beside a sortable list that reorders in one
atomic write, say. Both build their fields with `useViewFormFields(view, { filter, defaults, scoped })`,
so they can't drift: only what a writer may send, links as pickers, the viewer's scope (and a
single-value `filter`) filled hidden on create, the view's noun and its `copy.form` words. The
form's own props win: `fields` replaces the view's fields; `title`, `submitLabel`, `description`
and `noun` replace its words. `resource` defaults to the view's. The view's fields are the whole
form, even when it leaves none (the form never makes one input per column of the row it edits),
and a value the `filter` fixes is never replaced from the page's URL (`?status=done`); other
fields still prefill from it unless the form's `prefillFromUrl` is false.

```tsx
<ResourceForm view={tasksView} action="edit" item={task} open={open} onOpenChange={setOpen} filter={{ project_id }} />
```

An input left empty is no value, when the contract says whether its column takes null (the view
passes `nullable` and `hasDefault` to the form; a hand-written `ResourceFormFieldDef` can set
them too). A create leaves it out, so the column's default (or null) applies; an edit sends null
once the person empties it. A text column that can't be null keeps `""` (on a create, only when
it has no default), and so does a value the screen started the field at (`filter`, `defaults`).
A field the contract says nothing about, and an edit of a field nobody touched, send what they
always did. The phone's NativeResourceView follows the same rule.

### Links in forms

<!-- api: ViewLink, ResolvedLink, ViewDefinition<any>, ResourceFormFieldDef -->

A link (a field with `references`) the view opts in is editable in a form, with a picker that
lists the rows it can point at. It shows the linked row's words and stores its key.

```ts
export const tasksView = defineView(contracts["public.tasks"], {
  form: ["title", "owner_id", "reviewer_id", "milestone_id", "client_id"],
  fields: {
    owner_id: { link: { view: peopleView } },              // the people list's own rules
    reviewer_id: { link: { view: () => peopleView, preset: "everyone" } },
    milestone_id: { link: { filter: (values) => ({ project_id: values.project_id as string }) } },
    client_id: { link: {} },                               // a picker, under row-level security only
  },
});
```

- **Opt in.** A link is editable only when the view says so: `fields.<link>.link` (`{}` is
  enough) for one link, or `editLinks: true` for every link in the view. Without it a link
  behaves as it always has in 2.x: read-only, never sent, and filled hidden from the screen's
  `filter` or `defaults` when a new row needs it. The default flips in 3.0, when every link not
  marked `readOnly` gets a picker.

- **What it lists.** The linked resource, through the same data provider as every list, so
  row-level security decides what the viewer can pick. `link.view` (the linked resource's view,
  or a function returning it when two views link each other) adds that view's rules: its `scope`
  keys from the viewer's scope (as its own lists apply them), its `default` preset's filter (or
  `link.preset`'s) and its `labelField`. `link.filter` adds more, fixed or from the form's values,
  for a picker that follows another field. A view of another resource, or a preset it doesn't
  have, fails `defineView`. A view given as a function is checked when the picker first asks:
  in development a wrong one throws; in production it is reported (`reportError`) and the picker
  lists under row-level security and the link's own `filter` only, so the form still opens.
- **Tenancy is the server's.** Without `link.view`, nothing adds the linked resource's scope:
  Genesis keeps no registry of views or tenant columns by resource, so the picker lists whatever
  row-level security lets the viewer read. Give `link.view` for a scoped resource. Either way the
  client can't stop a cross-tenant link (a request can name any key): the server must, with an
  INSERT and UPDATE policy `WITH CHECK` that the linked row is in the same tenant, or a
  composite foreign key (`(org_id, owner_id) references people (org_id, id)`).
- **Large tables.** It asks for nothing until it opens, then 25 rows at a time sorted by the
  naming field then the key (so rows that share a name never fall between pages; a provider
  without `multiSort` sorts by the name only), with Show more for the next page.
- **Order.** By name unless the link says otherwise. A link with a `view` and `orderBy: "view"`
  lists rows in the linked view's own `orderBy` (a `position` its list is sorted by), then the
  key; a linked view without one keeps the name. `orderBy: { field: "position", direction: "asc" }`
  names a linked field without a view. Opt in, so a picker's order never changes on its own. A
  hand-written `type: "relation"` field takes the same `relation.orderBy`, and core's
  `useLinkOptions` target takes `orderBy`; web and native both send it. A row whose
  name is empty shows `common.untitled`, never its key. Search goes to the server (`search` across
  `link.searchFields`, default the naming field) once typing settles. A table is never loaded
  whole. The chosen row's words come from the loaded rows, else the batched relation lookup.
- **Empty.** A link whose column takes null, or has a default, isn't required. Its picker has a
  None choice, which saves null. A create where the person never touched it leaves it out, so the
  column's default applies.
- **What stays read-only.** What the server owns: a generated field, `@genesis readonly`, a field
  the provider says this user can't update (its field permissions), and a field the view marks
  `readOnly`. **Scope (tenant) links** never appear in a form at all, even when listed: the scope
  fills them. **A link the screen's `filter` pins** (a client's sessions, a RecordView list
  section) is filled hidden on create and never sent on edit: a picker there would move the row
  out of the list it was made in. **A link the filter holds to a list** (`{ owner_id: ["a", "b"] }`,
  sent as `in`) keeps its picker, offering only those rows. A `defaults` value only starts the picker.
- **Derived forms** (a view with no `form`) include an opted-in link a new row can't do without
  (no default, never empty); other links are in a form when the view lists them.
- **Web:** `RelationField` (a button with `aria-haspopup="listbox"` opening a Popover with a cmdk
  Command list, labelled by the field, with the listbox's keyboard model; the search input is the
  only combobox, and the chosen row reads "selected"). A hand-written `type: "relation"` field
  keeps text keys (`""` for none) unless `relation.keys` is `"row"`, which a view's links use. **Native:** `NativeLinkPicker` in the form sheet: the field's row opens
  the list in place, with a search bar, None and Show more; each choice is a radio with its
  checked state, and an error is read in the field's label and announced as an alert. Both use core's
  `useLinkOptions(target, { filters, search })`, which a screen can call for its own picker.
- RecordView `settings` rows still don't edit a link in place; use the form.

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

1. **A screen setting**, such as `columns="compact"`, `mode="grid"` or `header="toolbar"`.
2. **The view**, so every screen of that resource gets it: a label, a display hint, a column, a
   form section or a guard.
3. **A slot** on one screen: `cells`, `toolbar`, `renderDetail`, or one of ResourcePage's
   `slots` (`detail`, `form`, the `shell` around it all).
4. **Headless**: `useResourceView` with your own layout.

A change to a view reaches every screen of that resource on every platform. A change to a
renderer reaches every app.

## Header and layout

<!-- api: ResourceViewProps -->

The header is ResourcePage's: DataPageShell's title, subtitle, count, view toggle, settings and
create button, with DataFilters' search and filters. `header="toolbar"` keeps the actions and
drops the title block, `toolbar` adds content beside them, and `slots.shell` replaces the shell
(wrap the default rather than dropping it).

There is one owner of the page header per route:

- **`layout="page"`:** the title, subtitle, count, create and actions go into
  `AppShellPageHeader`, above the shell's tabs, as on record views. Search, filters, views and
  the view toggle stay in the content. Back navigation comes from the shell only. A custom header
  also goes into `AppShellPageHeader`.
- **`layout="embedded"`:** a list inside a page or a record view tab. It never portals into the page
  header, never registers sub-navigation and never claims the title. It shows only its toolbar
  parts (ResourcePage's embedded variant).
- **`layout="compact"`:** a narrow surface such as an extension side panel or popup. It's one
  column and the peek opens as a sheet.

On phones:

- search collapses to an icon;
- filters and views open in a sheet;
- create stays the primary button;
- the bottom bar belongs to the shell and is never touched.

## Sheet mode

**Planned** ([`resource-view-sheet`](../features.ts)): none of this section is built. Today's modes are `table`, `grid`,
`list` and `calendar`.

`mode="sheet"` is the "studio" switch: a spreadsheet with inline editing for this one resource.

- It is built on genesis-ui's `SheetGrid`, loaded with `React.lazy` the first time it's used.
  `genesis-studio` already depends on genesis-ui, so the reverse dependency isn't possible.
- Edits go through `useResource`, so they get the same cache updates, undo and refusal handling as
  the form. Nothing writes around the provider.
- **Editable cells are an allow-list.** Only fields the view's `form` names are editable. Tenant,
  owner and `readonly` columns never are. Without that rule, a provider with no `describe()` would
  offer every column.
- **Multi-cell paste needs the provider's `bulkWrites` capability** (`updateMany` in one
  transaction; the Supabase provider reports `false`). Otherwise it is off, and it is never a
  non-transactional loop. When it's on, the paste is one undoable unit and each row is still
  checked for refusal.
- Version checks apply only where the provider supports them (`versionedWrites`). The Supabase
  provider doesn't today, and the doc doesn't claim otherwise.
- Rows and columns are virtualised.
- **Who can switch modes:**
  - The developer makes sheet mode available with `mode` or `modes={["table", "sheet"]}`.
  - A user toggle for it sits behind the feature gate and an admin permission. Otherwise every
    list grows a spreadsheet button.

## Phones

The list layouts below are switched on by the app or the screen. A few small defaults apply
everywhere without asking, listed under "Small default changes".

- **A screen's mode per screen size.** `mode={{ mobile: "grid", desktop: "table" }}` opens cards
  below 768px and a table above. Only the default is responsive: once a person picks a view with
  the switch, it is theirs on every screen size.
- **An app-wide phone default.** Set it once, near the root:

  ```tsx
  <ResourceViewDefaultsProvider phoneMode="grid" clipCells>
    <App />
  </ResourceViewDefaultsProvider>
  ```

  - `phoneMode` (`"grid"` or `"list"`) is the phone default of every `layout="page"` list whose
    screen sets no `mode`. Desktops keep the table.
  - Embedded and compact lists never get it. An embedded list hides the view switch, so cards there
    would leave no way back to the table; a compact list is rows already. An embedded screen that
    wants cards says so with its own `mode`.
  - A nested provider inherits what it doesn't set. `phoneMode={null}` turns the outer default off
    below it, and `clipCells={false}` does the same for clipping.
  - It is never a calendar: `mode="calendar"` stays a screen's choice.
- **The first frame.** The server has no viewport, so it renders the desktop default; a phone
  switches to its phone default right after hydration. A server-rendered page on a phone shows the
  table for one frame, then the cards. Rendering both and hiding one with CSS would double every
  row's markup and break the table's keyboard focus, so Genesis takes the frame. A client-only
  render has no flash.
- **Older saved picks.** Earlier versions stored the default under `genesis-view-<key>` on mount,
  so a value there may be a real pick or a stale default. A plain default still reads it (they
  agree, so nothing changes); a responsive default ignores it, or the first device to open a list
  would pin every other device to its view. Real picks are now stored under
  `genesis-view-choice-<key>`.
- **Clipped cells.** `clipCells` (on the provider, or `DataTable clipCells`) clips each cell at its
  column's edge on one line with an ellipsis, so a long link or email doesn't run over the next
  column on a narrow table. Inline editors keep their overflow. A screen's
  `slotProps={{ table: { clipCells: false } }}` wins.
- **Autofill is the field's call.** No input gets an `autocomplete` token from its type. Unset,
  the attribute is left off, which leaves the browser to its own heuristics: it can still offer to
  fill a field it recognises. A view field sets a token where the form is about the viewer, and
  `off` where it's about someone else (an admin editing a member), so the browser is asked not to
  fill in the person at the keyboard:

  ```ts
  defineView(people, { fields: { email: { autoComplete: "email" }, phone: { autoComplete: "tel" } } });
  defineView(members, { fields: { email: { autoComplete: "off" } } });
  ```

  A view field's `inputMode` (the keyboard) and `enterKeyHint` (the Return key's label) pass
  through the same way, to `ResourceView`'s form, `RecordView`'s settings and the native form sheet.
- **Phone numbers.** A field is a phone number when the contract says so, `widget: "tel"`. The
  web form and `RecordView`'s settings render `type="tel"`; the native form sheet shows the phone
  keypad. A column's name (`phone`, `mobile`) is never read as a type.

### Small default changes

These apply to existing screens without a switch:

- **Keyboards.** Email, url and `tel` inputs ask for their keyboard (`inputMode`). A number asks
  for the decimal keypad only when its `min` is 0 or more: that keypad has no minus key on an
  iPhone. A field's own `inputMode` wins.
- **List search.** The search box is named for screen readers, shows a search keyboard with a
  Search key, offers no autofill (`autocomplete="off"`), and its clear button is a bigger target.
- **Default rows and cards.** A list row (and a card) is titled by the page's title (`getTitle`,
  else `titleField`) rather than the first column's raw value, and the title's column isn't
  repeated as a cell. Cells read a column's `accessor` and `render`, as the table does. A row is
  two lines: the title (up to two lines), then up to three other columns, wrapping.

## Calendar

<!-- api: ResourceViewProps, ViewCalendar, ResourceCalendarOptions<any> -->

A view's `calendar` block says how its rows show on a calendar. It is part of the description, so
ResourceView draws it on the web and NativeResourceView will on the phone, with no change to the
type. `mode="calendar"` shows it.

```ts
export const eventsView = defineView(contracts["public.events"], {
  scope: ["household_id"],
  calendar: { field: "starts_at", endField: "ends_at", laneBy: "people", layout: "weeks", weeks: 2, weekStartsOn: 0 },
});
```

```tsx
<ResourceView view={eventsView} mode="calendar" />
<ResourceView
  view={eventsView}
  mode="calendar"
  calendar={{ layout: "agenda", weeks: 1, layouts: ["month", "weeks", "agenda", "lanes"], lanes, onSelect: openEvent }}
/>
```

- **The block** (`ViewCalendar`, plain values only): `field` (a date or timestamp), `endField`,
  `allDayField` (yes/no), `laneBy` (a field whose value or list of values names a row's lanes),
  `layout`, `phoneLayout`, `weeks` (1–4) and `weekStartsOn` (0 Sunday, 1 Monday), and
  `durationField` with `durationUnit` (below). `defineView` checks the field names and types.
- **The screen** overrides any of those through `calendar={…}` and adds what a description can't
  hold: `anchor`/`onAnchorChange` and `layout`/`onLayoutChange` (to keep them in the URL),
  `layouts` (a switch in the toolbar), `weeksOptions`/`onWeeksChange` and `toolbar` (below),
  `lanes` (labels and colours), `colorLanes` (below), `lanesOf(row)`,
  `colorsOf(row)`, `classNameOf(row)` and `statusOf(row)` (below), `onSelect(row)`, `timeZone`,
  `limit`, `showEmptyDays`. The peek honours the screen's `cells`, and an unknown `preset` throws,
  as in the list. The screen's `subtitle` (else the view's `copy.subtitle`) shows under the
  title, as it does over the list.
- **A row's look.** `classNameOf(row)` gives a row's event classes, on the grid and the printed
  agenda: `(r) => (r.status === "cancelled" ? "line-through opacity-60" : undefined)` strikes a
  cancelled event through rather than dropping it. `statusOf(row)` gives the words read out after
  its title ("Cancelled"), printed on paper too, so the look is never the only cue.
  `EventCalendar`'s `CalendarEvent` takes the same `className` and `status`.
- **On a phone.** `phoneLayout: "agenda"` opens the day-by-day agenda below 768px, where a month
  grid is too narrow to read, until the person picks a layout from the switch. Unset, a phone
  shows `layout`, as before. The server renders the desktop layout, so a server-rendered phone
  page shows it for one frame (as [Phones](#phones) explains for lists).
- **An end from a duration.** For rows with no end column, `durationField` (a number field) and
  `durationUnit` (`minutes`, the default, `hours` or `days`) give each row an end: its start
  plus the duration. A timestamp ends that long after it starts; a date runs that many days
  (rounded up, at least one). A row whose `endField` has a value keeps it; a row with no
  duration shows on its start alone. The window is still asked for by start only, so a row that
  began before the window and runs into it isn't loaded: give it an `endField` when that matters.
- **Layouts.** `month` (the month's whole weeks), `weeks` (1 to 4 weeks from the anchor's week, 2
  by default), `agenda` (the same weeks day by day) and `lanes` (a row per lane, a column per day).
- **The toolbar.** `weeksOptions` (`[1, 2, 4]`) adds a weeks switch beside `layouts`' switch, for
  every layout but `month`. Its pick is kept as the layout's is: with `onWeeksChange` the screen
  owns it (pass `weeks` back, from the URL say), else the calendar keeps it. `toolbar` puts the
  screen's own controls beside both, a Print button or a mode switch: a node, or a function given
  `{ layout, weeks, anchor }`. A switch between the list and the calendar is the screen's: keep
  `mode` in its state and put the switch in `toolbar` (and in the list's own toolbar).

  ```tsx
  <ResourceView
    view={eventsView}
    mode="calendar"
    calendar={{ layouts: ["weeks", "lanes"], weeksOptions: [1, 2, 4], toolbar: <PrintButton /> }}
  />
  ```
- **The list's options apply.** `resourceOptions.enabled` holds the requests (a screen waiting on
  its scope), `resourceOptions.select` goes with each request, and `live` refetches on changes,
  as in the list. A `select` must fetch the calendar's `field`, `endField`, `allDayField` and
  `laneBy`, or events can't be placed (development warns).
- **Data** goes through the view's provider rules: the scope, the screen's `filter` and a preset's
  filter, plus the visible window. Without an `endField` that is one `getList` for rows starting in
  the window. With one, a second `getList` adds the rows that started before the window and run
  into it (`start < windowStart` and `end > windowStart`, `>=` for a date end), so an event that
  began weeks ago is there. The two never overlap and leave no gap. A `layout` or `anchor` that
  isn't valid (a hand-edited URL) shows the month and today, with a warning in development.
  Both load as one query under core's list keys (`[resource, "list", …]`), so a
  save to the resource refreshes the calendar like any list. At most 500 rows per request
  (`limit`; with an `endField`, two requests); past that the calendar says "+N more not shown",
  in print too, rather than dropping rows silently. While a window loads the calendar is
  `aria-busy` and never says "Nothing scheduled".
- **Days.** A `date` field is that day everywhere. A timestamp lands on the day on the same clock
  its cells use: the field's own `timeZone` (the scope's or a fixed zone), else the viewer's
  (ViewerScope's `timeZone`), else the device's; the window's bounds use that clock too. A
  `timestamp without time zone` is a wall time: bounded by wall-clock midnights and read on that
  clock. **All-day rows should store days** (a `date` column, or `YYYY-MM-DD`): a day is drawn as
  that day on every clock, with no zone arithmetic. An all-day row (`allDayField` true) stored as
  instants at UTC midnight, as Google's API and most sources write one, is read on UTC, so it
  stays on its day for a viewer behind UTC (it used to show the evening before); the window asks
  for a day more each side so such a row on its edge loads. Other all-day instants (midnights on
  the viewer's clock) are read on the viewer's clock. An event with an `endField` shows on every day it covers (a date end is the last day, a
  timestamp end is exclusive, also for an all-day row stored as instants). All-day events sit
  above timed ones. A busy day shows its first few events and "+N more"; print shows them all.
- **People and dots.** An event shows once on the grid with a dot per lane in the lane's `color`
  (or `colorsOf(row)`), and its lanes are read out to screen readers: colour is never the only
  cue. `colorLanes` gives each lane with no `color` of its own `laneColor(i)` by its place; off by
  default, so a lane with no colour has no dot. `laneColor(i)` (`/data`) is the theme's five chart
  colours, then distinct colours made from them toward the foreground (theme-aware, gaining
  contrast rather than losing it), so lane six doesn't repeat lane one:
  `lanes={people.map((p, i) => ({ key: p.id, label: p.name, color: laneColor(i) }))}`. In `lanes`, a shared event sits in each person's row, and events with no lane get an
  "Unassigned" row.
- **Opening.** A click opens the view's peek (the same fields the list's peek shows), or calls
  `onSelect(row)`.
- **Keyboard.** The day grid and the lanes are each a `role="grid"` with one tab stop: arrow
  keys move a day or a week (a lane in `lanes`; Left and Right run on to the next week in the day
  grid), Home and End go to the row's ends, PageUp and PageDown move the window back or on
  (keeping the focused cell's place when its day isn't in the new window), an arrow past the
  grid's edge moves it too, and Tab reaches each
  event's button. A day is read with its date, year and count: "Tuesday, November 3, 2026, 2
  events". A title across New Year names both years.
- **Printing.** The agenda prints as a plain list: no controls, no fills, a day never split
  across pages, and AppShell's navigation left off the page. For one printed sheet per person,
  give the calendar `print`: it prints `PrintableAgenda` (a sheet per lane for the shown week,
  each on its own page, the app's `sections` under each week) from the same rows, scope and
  filters, so the screen never reads data itself. Put a `PrintButton` next to it.

  ```tsx
  <PrintButton />
  <ResourceView view={eventsView} mode="calendar" calendar={{ layout: "lanes", weeks: 1, lanes: people, print: { sections } }} />
  ```

  `PrintableAgenda` (`/data`) is the same sheet for events that aren't one view's rows; it needs
  `lanes` with their labels, since a lane's key is an id.
- **Not a list mode.** Calendar is ResourceView's own `mode`, not one of the list's view modes:
  it isn't in the header's toggle, and it is never stored as the user's remembered view, so other
  lists of the resource don't open in it.

`EventCalendar` (`/data`) is the same calendar for events that aren't one view's rows (a merged
feed, an expanded recurring series): give it `CalendarEvent`s (`start`/`end` as days or instants,
`lanes`, `colors`). An all-day event's `end` is its last day (inclusive); genesis-calendar's
`toCalendarEvent` already turns a feed's exclusive end into that, so its output draws as it is. Recurring series expand with `expandRecurrence` from
`@marktiderman/genesis-core/dates`, and the window helpers (`monthGridRange`, `weeksRange`,
`rangeIn`) are there too. Studio's calendar is drawn by it.

## Board

<!-- api: ResourceViewProps, ViewBoard, ResourceBoardOptions<any>, UseBoardColumnsOptions -->

A view's `board` block says how its rows show as a board: a column per value of one field, a card
per row. `mode="board"` shows it, and moving a card between columns writes that field.

```ts
export const tasksView = defineView(contracts["public.tasks"], {
  scope: ["project_id"],
  fields: { stage: { labels: { todo: "To do" }, tones: { done: "success" } } },
  board: { field: "stage", cardFields: ["due_on", "owner_id"], limits: { doing: 3 } },
  orderBy: { field: "due_on" },
});
```

```tsx
<ResourceView view={tasksView} mode="board" />
<ResourceView view={tasksView} mode="board" board={{ columns: ["todo", "doing"], onSelect: openTask }} />
```

- **The block** (`ViewBoard`, plain values only): `field` (an enum, or a yes/no field), `columns`
  (the values to show, in order; by default the field's choices in the contract's order, then a
  "No value" column when it can be empty), `cardFields` (shown under a card's title, drawn as their
  cells are), and `limits` (work-in-progress limits by value). `defineView` checks every name and
  value, and the board checks a screen's overrides the same way (`boardProblems`).
- **The screen** overrides any of those through `board={…}` and adds `onSelect(row)` (default: the
  view's peek), `renderCard(row)`, `onMoveError(error, row)` and `perPage` (default 50).
- **Columns.** Each shows its value's words (`labels`) and tone (`tones`), and its count. With a
  limit the count reads "4 / 3", and a column over its limit says so in words, not colour alone.
  Nothing stops a move into a full column.
- **Data** goes through the view's provider rules: one `getList` per column page, with the scope,
  the screen's `filter`, a preset's filter and the column's value (`is_null` for "No value"), under
  core's list keys, so a save to the resource refreshes the board like any list. A column loads
  50 cards and then "Load more", on its own. A filter on the board's own field is set aside, and
  the board says so. Cards are in the view's `orderBy` order.
- **Moving a card** works by mouse, by touch on its handle, from the keyboard and from its "Move
  to…" menu (`KanbanBoard`), and is announced. It is the resource's own `update(id, { [field]: value })`
  (`useResource`, pessimistic), so the provider's write rules apply. On a resource with a
  `version` rule a move carries the version the card was read at, so a card someone else changed
  is refused, not overwritten. A move needs the field to be writable in the view's edit form, and both the
  view's update guard and the screen's own `can` (`edit`) to allow the row: a card either refuses
  has no handle or menu and can't be dragged. A refusal from the server leaves the card where it
  was and shows why above the board, or goes to `onMoveError`.
- **A move someone else got to first** (a conflict) opens `ConflictSheet` with their column and
  yours: **Keep my version** sends the move again at the version their change left, through the
  resource's own `update` (`{ expectedVersion }`), so a move right after it is checked against the
  version it saved (a newer conflict shows the sheet again; any other failure, including a save
  that changed no row, shows in the sheet), and **Take their
  version**, or closing the sheet, leaves the card where their row puts it. Either way the sheet
  closes at once and the card moves when the board's columns refetch, a moment later. With `onMoveError` the
  screen gets the conflict instead, and the sheet doesn't open. A conflict that comes back after
  the board has gone is shown as a toast. While a card's move
  is saving the card is dimmed and a second move of it is turned away, so it is never sent from
  the column it is leaving. The screen's `resourceOptions` `invalidates`, `onError` and
  `onUpdateSuccess` apply to a move; a move is always pessimistic. A failed move shows on the board
  and isn't logged as well, and a conflict the sheet shows doesn't reach `onError`.
- **Order within a column** follows `orderBy`. Dragging to reorder inside a column, which writes
  the order field with the column in one update, is **Planned**
  ([`resource-view-shaping`](../features.ts)), with `orderBy.manual`.
- **Columns past the edge.** The columns scroll sideways, and a fade at either edge shows there
  are more columns that way, in either reading direction. The fade is the page's background; a
  board on another surface (a card) sets `--board-edge` to that surface's colour.
- **No toolbar.** Like the calendar, a board has no search box or filter bar of its own: its rows
  are the view's scope, the screen's `filter` and the preset's. A screen that wants a search puts
  it in its own header and passes the result as `filter`.
- **A bad override** (`board={{ columns: ["blocked"] }}` for a value the field doesn't have) warns
  in development and shows the view's own block; without a block of its own, the view throws.
- **Not a list mode.** Like the calendar, a board is never stored as the user's remembered view,
  and `useResourceView` has no table state for it.

`KanbanBoard` (`/data`) draws boards for rows that aren't one view's, and `useBoardColumns` loads
them, one paged request per column. Studio's board is those two over its own provider:

```tsx
const board = useBoardColumns({ provider, resource: "tasks", field: "stage", values: ["todo", "done"] });
<KanbanBoard columns={board.columns.map((c) => ({ key: c.value, label: c.value, items: c.items }))} renderCard={drawCard} />
```

On the phone, a board on `NativeResourceView` is **Planned** ([`resource-view-board`](../features.ts)).

## Gallery

<!-- api: ResourceViewProps, NativeResourceViewProps<any>, ViewGallery, ResourceView<any> -->

A view's `gallery` block says how its rows show as photos: `mode="grid"` then draws a photo per
row in justified rows, in place of cards, on the web (GalleryGrid) and on a phone
(NativeGalleryGrid). The rows pack the same on both, because the layout is one function in
genesis-core (`justifyRows` from `@marktiderman/genesis-core/gallery`).

```ts
export const photosView = defineView(contracts["public.photos"], {
  scope: ["album_id"],
  gallery: { image: "url", width: "width", height: "height", caption: "taken_at", rowHeight: 200 },
});
```

```tsx
<ResourceView view={photosView} mode="grid" />
<NativeResourceView view={photosView} mode="grid" onRowPress={(p) => router.push(`/photos/${p.id}`)} />
<ResourceView view={assetsView} mode="grid" gallery={{ image: "thumbnail_url" }} />
```

- **The block** (`ViewGallery`, field names only): `image` (a text field holding the image's URL),
  `width` and `height` (number fields with its size in pixels, both or neither; without them a
  photo packs as 4:3), `caption`, `alt` (default the row's label), and `rowHeight` (the target row
  height, default 180). `defineView` checks every name and type, and names every mistake at once.
- **A screen's `gallery`** overrides the block's settings, or turns grid mode into a gallery for a
  view without one.
- **What stays the list's:** paging, search, filters, the peek and the table and list views. Only
  the grid view changes, through ResourcePage's grid slot, so a screen's own `slots.grid` still
  wins. Pressing a photo opens the row as pressing a card does (the peek, or `onRowPress`).
- **A row without an image** is a placeholder tile (its `GalleryItem` has an empty `src`) showing
  its label and caption, so the gallery draws every row the count says.
- `view.galleryItem(row)` is the row as a `GalleryItem` (its key as `id`), for a screen that hands
  the same photos to a `Lightbox`. A row without an image comes back with an empty `src`: leave
  those out of what a viewer pages through (`items.filter((item) => item.src)`), as there's
  nothing to show full screen.
- **Not yet:** selecting photos, and a pull to refresh on the phone's gallery. GalleryGrid stays
  the component for photos that aren't records (a message's attachments, a form's uploads).

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

- **Hidden is not protected.** `columns`, `when` and `select` are presentation and bandwidth
  only. Any column some users must never read goes in a separate table, a
  `security_invoker` view over a base table whose SELECT is revoked, or a function. A field marked
  `sensitive` is refused at render time when the provider can't confirm the user may read it (fail
  closed).
- **Scope is never trusted.** A scope default such as `org_id` comes from the browser. Every
  scoped resource needs:
  - INSERT and UPDATE policies `WITH CHECK` membership;
  - the tenant column immutable after insert;
  - tenant columns left out of forms and the sheet always, and owner columns (links) read-only
    unless the view opts them in ([Links in forms](#links-in-forms)), with a `WITH CHECK` or a
    composite foreign key that keeps a link inside the tenant.

  `introspect` generates a `genesis-core/testing` stub per scoped resource, asserting that a
  cross-scope insert and update are refused.
- **References fail closed.** When RLS hides a referenced row, the cell shows the field's
  `missingLabel` (else `common.hiddenLink`), never the raw id or a title cached for someone else. `ViewerScope` resets the cache when the viewer changes.
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
`ViewerScope`. ResourceView, NativeResourceView and both record views read it themselves and pass it
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

<!-- api: ResourceViewProps, ResourceTree<any> -->

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
- **References** are read in batches, with no N+1: `useRelationLabel` asks for every id a screen
  shows in one `in` query per linked resource (see "Links have words"). A filtered child count
  comes from a `source` view.
- **Big exports, imports and pastes run as jobs** (**Planned** ([`resource-view-sheet`](../features.ts))). Above a
  threshold (about 500 rows, or wherever the provider doesn't serve `bulkWrites`), CSV export,
  import and multi-row paste go to
  `genesis-supabase/jobs` (`enqueueJob(admin, "resource.export", { resource, filters, viewer })`)
  through an app server function, with an idempotency key so a double click is one job. The
  browser watches the job instead of looping writes. Below the threshold they stay synchronous.
- **Identity:** views are module constants. Derived columns and options are memoised. The
  messages provider is given a stable object.

## RecordView

<!-- api: RecordViewDefinition<any>, RecordViewProps<any>, RecordView<any> -->

One record's screen from its view, defined once with no React and drawn on web and native:

```ts
export const brandRecordView = defineRecordView(brandsView, {
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
- **Web** `<RecordView view row section sectionHref can? onAction? />`: the header in
  `AppShellPageHeader` through `ResourceHeader` (a `switcher` in its leading area), sections as
  the shell's tabs, list sections as embedded `ResourceView`, settings as `SettingsRow` and
  `ToggleRow`, readiness as the `ReadinessChip`.
- **Native** `<NativeRecordView view row />` with
  `getNativeRecordViewStackOptions` for the title and the header menu (an action sheet on
  iOS, a sheet of rows elsewhere, destructive actions marked; one action runs at a time): up to
  four sections as a segmented control; more as rows that push through `onOpenSection`, or open
  in place with an "All sections" row back.
- **Saving** sends only the section's changed, listed, visible keys. A save that matches no rows
  is a refusal, shown inline; a number field never saves NaN.

## Custom views

<!-- api: CustomViewProps<any>, UseViewListOptions<any> -->

A **custom view** is a screen an app draws itself over a view (ADR 0019): a leaderboard whose
rows slide into place, a streak strip, a day's timeline. Genesis keeps the view's data and states;
the app draws the rows.

```tsx
import { CustomView } from "@marktiderman/genesis-ui/data";

<CustomView view={playersView} sort={{ field: "points", order: "desc" }} perPage={10} live>
  {({ rows, reducedMotion }) => <Leaderboard players={rows} animate={!reducedMotion} />}
</CustomView>;
```

- `type`: `list` (default, a page of rows), `board` (the board block's columns, with moves) or
  `calendar` (one window's rows; `range`, default this month's grid). Fixed for a component's life.
- **States are Genesis's.** Loading (skeleton rows), empty (EmptyState in the view's
  `copy.empty` words) and error (the reason and a retry) are drawn for you, as parts
  `custom-view-loading`, `custom-view-empty` and `custom-view-error` inside `custom-view`
  (`data-view-type`, `data-state`). `loading`, `empty` and `error` replace one; `empty={false}` hands
  an empty view to the function too (a calendar that still draws its days). The doctor's
  `custom-view-states` rule warns when a custom view draws its own.
- **The function gets** `rows`, `status`, `groups()` (the rows under the view's `groupBy`, through
  core's `groupRows`), `can` (the view's guards for the viewer, each `true` or its reason, narrowed
  by the screen's `can`), `params`, `reducedMotion`, and the data of its type: `list`
  (`useViewList`'s state), `board` (`useViewBoard`'s) or `calendar` and `range`
  (`useViewCalendarRange`'s).
- **The view's rules hold**: `preset`, `filter`, `scoped` and `resourceOptions` work as on
  `<ResourceView>`, and `urlState` keeps the page, sort, search and open record in the URL.
- **The app's own elements** inside are its parts: `data-slot="app-…"`, coloured from roles only
  (`bg-card`, `hsl(var(--primary))`), so an app style and brand reach them. The doctor's
  `app-part-name` and `app-part-colors` rules say when one isn't.

The headless pieces underneath are exported for a screen that needs them, and every view type
shares them, so a custom view asks for exactly what the table, board and calendar ask for:

| Hook | What it gives |
| --- | --- |
| `useViewListParams(options)` | the scope, preset and screen filters as provider params, with select, enabled and live |
| `useViewList(view, options)` | a page of rows with paging, sort, search, a selection by record key, the open record, `urlState` and `can` |
| `useViewBoard(view, options)` | the board's columns, paged per column, and `move` with the guards, a refusal's reason and the conflict sheet's choices (ResourceBoard draws it) |
| `useViewCalendarRange(view, range, options)` | one calendar window's rows, capped, on the field's clock (ResourceCalendar loads through it) |
| `useReducedMotion()` | the person's motion preference |

## Native

<!-- api: NativeResourceViewProps<any>, ViewDefinition<any> -->

`NativeResourceView` reads the same view and renders native patterns:

- **Rows, not columns:** each row is the view's `summary(row)` (title, subtitle, the first chip,
  the picture) in a `NativeListItem`. Without a `summary`, the title is the `labelField`'s value
  (else the noun). `groupBy` gives sections, sorted on the server and inset-grouped on iOS.
- **Form sheet:** Cancel and Save in the nav bar, sections as grouped sections, native date and
  time pickers, choices as a segmented control or a pushed list, links as a searchable list of the
  linked rows ([Links in forms](#links-in-forms)), and the keyboard toolbar from FormFocus.
- **Swipe actions:** guards drive the swipe Delete, and actions take icon names. Delete wording
  follows the provider's real capability (`bin.restorable`).
- **A row opens the peek**, the view's columns in a sheet. To push a detail screen instead (so
  deep links and notification taps land in the same place), pass `onRowPress` and navigate.
- **Paging and writes:** cursor paging with `onEndReached`. Search debounced at 300 ms. Zero-row
  refusals and optimistic updates with rollback.
- **Doctor:** `native-screen-layout` counts `NativeResourceView` as a layout.

### Cards and custom rows

<!-- api: NativeResourceViewProps<any>, NativeResourceCardActions -->

The same names as the web's `mode="grid"` and `renderCard`, all opt in. Without them the list is
exactly as above.

```tsx
<NativeResourceView view={brandsView} mode="grid" numColumns={3} />

<NativeResourceView
  view={brandsView}
  onRowPress={(b) => router.push(`/brands/${b.id}`)}
  renderCard={(brand, index, card) => (
    <Pressable {...card.pressableProps}>
      <BrandTile brand={brand} title={card.item.title} />
    </Pressable>
  )}
/>
```

- `mode="grid"`: cards in columns, each line one item of the same SectionList, so sections
  (`groupBy`), cursor paging, pull to refresh, the empty and error states, the peek, long press,
  accessibility actions and `swipeable` all stay. A card shows the row's picture, title, subtitle
  and first chip. The last line keeps its columns' width. Lines are cut from each section's real
  start, so when `maxPages` drops pages from the front (or they load back) every card stays on its
  line and nothing remounts. Swipe actions are cramped behind a half-width card: in a grid, prefer
  long press (always there) and pass `swipeable` only for one or two short actions.
- `numColumns`: columns in grid mode, React Native's FlatList name (the web's `gridCols` takes
  Tailwind classes instead). Default 2.
- `renderCard`: draw a row (list) or a card (grid) yourself. It gets the row, its index in its
  section, and `card` (`NativeResourceCardActions`):
  - `pressableProps`: spread on a Pressable for the same press (`onRowPress`, else the peek),
    long press (the row's actions), label and accessibility actions as a built-in row;
  - `item`: the summary (title, subtitle, chips, picture);
  - `actions`: edit and delete, each refusal with its reason;
  - `open` and `showActions`, to wire them yourself;
  - `first` and `last`: its place in its section.

  It owns the whole row: no inset group cell or separator is drawn around it, and the screen still
  wraps it in `swipeable` when it has actions. Pass a stable function (`useCallback`) for long lists.

## Other surfaces (extensions, popups, side panels)

- The view entry has no React and no DOM, so a service worker, content script or server code can
  use `summary`, labels, the `select` list and form data.
- The provider and session come from context, never a global browser client. A pluggable session
  store (`chrome.storage`, SecureStore) and a storage adapter for saved views and preferences
  replace direct `localStorage`.
- Nothing assumes a router, SSR or a full page. `layout="compact"` and `pagination="cursor"` cover
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

## What gets built, and in what order

| Phase | Piece |
| --- | --- |
| 0 | Resource facts from `@genesis` comments (`labelField`, `noun`, `readonly`, `sensitive`); `satisfies ResourceContract<Row>` emit and name unions; browser-only contract |
| 0 | Count mode; `ViewerScope.scope` (including sets); live: filtered shared channels, no echo, patch by id |
| 0 | Cursor-mode server search and sort in `useResourceTable`; lazy peek and form; virtualisation default |
| 1 | `genesis-core/resource-view`: `defineView`, view types, derived validation, `summary`, guards |
| 1 | `ResourceView`, `useResourceView`, header parts, page/embedded/compact layouts, renderer registry with web renderers, URL allow-list |
| 1 | Three pilot screens: one plain admin list, one list embedded in a record view tab, and one hard list (Tasks). Line counts measured before and after |
| 2 | `mode="sheet"` on `SheetGrid` (planned) |
| 2 | `NativeResourceView`: rows, form sheet, swipe actions, detail routes (about 3 days) |
| 2 | Session-agnostic provider and storage adapter, batched permissions feeding guards, `summary` → page bar, compact and detail layouts |
| 3 | Remaining app screens, then a doctor rule: new list screens use ResourceView |
| 2 | `RecordView` and `NativeRecordView`: header, sections, settings, readiness from the same view |
| 3 | Tree mode on the web: `tree={{ getParentId, defaultExpanded, cascadeSelect }}` on table and list ([Tree mode](#tree-mode)); logic in `genesis-core/resource-view` |
| later | Tree mode in NativeResourceView (reusing core's `treeRows`), children loaded on expand, conditional form fields |

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
- **Scoped to collection screens**, with record views named as a later, separate piece.
