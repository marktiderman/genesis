# ResourceView: one description per resource, one line per screen

Design v0.2, 2026-10-26. Status: **proposal, revised after review**. Nothing here is built yet.

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
- Resource workspaces: one record with child sections, like a form, course or lesson builder.
  Those keep `AppShellPageHeader`, `ResourceHeader` and `useAppShellSubNav`. ResourceView is for
  **collection screens**, lists of records. The view's shape is kept open so a later
  `ResourceWorkspace` can reuse it.

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

The provider config holds the data-side facts. These are owned by the data layer, not views:

- `source`: a table, a `security_invoker` view, or a set-returning function;
- `select` and `writeColumns`: the read fields come from the source and the write fields from the
  table. ResourceView passes `writeColumns` automatically, so a form built from a joined row never
  sends a joined column;
- the count mode: `exact`, `estimated`, `planned` or none.

### View: meaning, platform-neutral

```ts
// features/brands/brands.view.ts — no React, no DOM: native and the extension import it too
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { resources } from "../../resources.genesis";

export const brandsView = defineView(resources.brands, {
  messages: "brands",                      // copy keys: brands.noun, brands.empty.*, brands.fields.*
  fields: {
    name: { max: 120 },                    // feeds the derived validation
    status: { display: "badge" },          // a hint; each platform registers its renderer
    owner_id: { display: "relation" },     // picker and label via references and labelField
  },
  columns: { default: ["name", "status", "created_at"], compact: ["name"] },
  form: ["name", { section: "advanced", fields: ["slug"] }],
  validate: (s) => s.refine((r) => r.slug !== "admin", { path: ["slug"], message: "brands.slug.reserved" }),
  guards: { delete: (row) => (row.is_default ? "brands.guard.default" : true) },
  summary: (row) => ({ title: row.name, chips: [{ label: row.status, tone: "info" }] }),
});
```

- **Copy goes through the message catalogue** (`UiMessagesProvider`). A view names a namespace,
  and defaults come from the resource's `noun` and field labels. Plurals use the catalogue's
  plural rules, not `{one, many}`.
- **Display hints, not render functions.** `badge`, `date`, `currency`, `relation`, `url`,
  `image`. Each platform registers renderers once. A one-off renderer goes in a platform file
  (`brands.view.web.tsx`), keyed per platform, so the shared view never imports a platform.
  Icons are names, mapped per platform.
- **Validation is derived** from the contract (nullability, enums, `max`) as a Standard Schema
  (zod). `validate` only adds rules.
- **Computed columns** (`columns: { full_name: { value: (r) => ... } }`) and **row actions**
  (decorating the resource's `actions`) are part of the view.
- **`summary(row)`** gives a one-line title and chips for pickers, notifications, extension page
  bars and other non-list surfaces. It defaults to `labelField` plus a few columns.

### Screen: one line, presentation only

```tsx
<ResourceView view={brandsView} />
<ResourceView view={brandsView} columns="compact" layout="embedded" filter={{ practice_id }} />
<ResourceView view={sessionsView} layout="embedded" filter={{ client_id: id }} mode="cards" />
```

Screen settings:

- `layout`: `page`, `embedded` or `compact`;
- `columns`: a preset;
- `filter` and `defaults`, which override the scope;
- `mode`: `table`, `cards` or `sheet`;
- `header`: parts on or off, or one part filled;
- `slots`: `peekExtra`, `detail`, `card`, `toolbar`, `rowActions`, `header`;
- `onTotal`: for a parent tab's badge.

`useResourceView(view, options)` is the headless form, with the same state as `useResourceTable`.

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
- **Scope is never trusted.** A scope default such as `practice_id` comes from the browser. Every
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
cache. It gains an optional `scope` object that answers *where*: the current practice, person or
space, or a set of them (`personIds: string[]`).

- Scope becomes server filters, never a filter on loaded rows, so paging and totals stay right.
  It's part of every cache key.
- A view declares which scope keys it needs, so a missing scope fails loudly in development.
- A screen's `filter` and `defaults` override the scope: an admin screen across practices and a
  client screen can share one view.
- `ResourceView` requires `ViewerScope` above it.

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
- **Identity:** views are module constants. Derived columns and options are memoised. The
  messages provider is given a stable object.

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
| later | `ResourceWorkspace` (workspace header from the same view), grouping, conditional form fields | — |

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
