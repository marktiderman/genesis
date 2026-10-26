# ResourceView: one description per resource, one line per screen

Design v0.1, 2026-10-26. Status: **proposal, for review**. Nothing here is built yet.

## The problem

An app built on Genesis today describes each kind of record several times:

- once for the database provider (table, writes, recycle bin);
- once for its form and detail panel (labels, field types, limits);
- once per screen: columns, save and delete code, delete wording, who may edit, empty state,
  storage keys, header switches.

One app audited for this has 25 list screens at 54 to 345 lines each (about 4,400 lines), on top
of about 1,100 lines of its own list wrappers. Most of that is the same setup written 25 times,
so a change to how lists behave means 25 edits.

## The goal

> Describe a resource once. A standard screen is one line. Customise only what differs, at the
> smallest level that does the job. One change in one place applies everywhere, on web and
> native.

Non-goals:

- A visual app builder. The description is code: typed, reviewed and versioned.
- Discovering columns while the page runs. See "Why not read the schema at run time".
- Replacing `ResourcePage` or `useResourceTable`. ResourceView is built on them.

## What already exists (reused, not reinvented)

| Piece | Where | Role here |
| --- | --- | --- |
| `ResourceSchema`, `FieldSchema` | `genesis-core` schema model (from Data Studio) | The data contract: fields, storage types, labels, widgets, enums, references, per-user permissions |
| Provider `describe()` | `genesis-core` provider contract | Per-user field permissions (`read`/`update`) and create fields, decided by the database or the app's API |
| `genesis-cli introspect` | CLI | Writes a typed `resources.genesis.ts` from the Postgres catalog or OpenAPI, with `@genesis` settings read from table and column comments |
| Supabase resource config, `source` | `genesis-core` | Reads from a table, view or set-returning function, with paging, totals, cursors and live updates; writes go to the table |
| `ResourcePage`, `useResourceTable` | `genesis-ui` | The list behaviour and markup; `variant="embedded"`; the message catalogue |
| `ResourceForm`, `DetailPanel` | `genesis-ui` | Form and peek |
| `SheetView` | `genesis-studio` | The spreadsheet grid with inline editing, for one resource |
| `NativeResourcePage` | `genesis-ui-native` | The phone list over the same provider |

## The design in four layers

Each layer has one job. A screen uses the highest one that fits, and drops down only where it
differs.

### 1. The resource: what the data is (generated, then owned)

`genesis-cli introspect` already writes `resources.genesis.ts`. That file stays the data
contract: fields and their storage types, nullability, enums, references. It is regenerated when
the schema changes, and a review diff shows exactly what changed.

### 2. The view: how people work with it (one file per resource, written by hand)

A view adds what a database can't know: labels, which columns show and in what order, the form's
sections, defaults from the screen's context, and the rules for who may do what in the UI.

```ts
import { defineView } from "@marktiderman/genesis-ui/resource-view";
import { resources } from "./resources.genesis";

export const brandsView = defineView(resources.brands, {
  title: "name",                       // names a row: peek title, links, pickers
  noun: { one: "brand", many: "brands" },
  fields: {
    name: { label: "Brand name", required: true, max: 120 },
    is_default: { label: "Default", readOnly: true },
  },
  list: ["name", "is_default", "created_at"],
  form: ["name", { section: "Advanced", fields: ["slug"] }],
  defaults: (ctx) => ({ practice_id: ctx.scope.practiceId }),
  can: { delete: (row) => !row.is_default },
  empty: { title: "No brands yet", description: "Add a brand to get started." },
});
```

- **Typed against the resource.** `list: ["nmae"]` fails to compile.
- **Defaults are explicit.** Without `list`, every readable non-system field shows. Without
  `fields.x.label`, the label is the column comment's, else the name in words.
- **`can` is UI intent only.** It hides buttons. The database or the app's API still decides,
  and the provider's `describe()` permissions are applied on top: a field the user may not read
  never renders, and one they may not update renders read-only.
- **The scope context** (`ctx.scope`: the current practice, person or space) comes from a
  `ResourceScope` provider the app mounts once, so views never read routes or globals.

### 3. The screen: one line

```tsx
<ResourceView view={brandsView} />
```

`ResourceView` is `ResourcePage` wired from the view:

- the provider list, with `defaultFilters` from the scope;
- the embedded or page layout;
- the header (below);
- the peek, built from the view's fields;
- `ResourceForm` built from `form`;
- create defaults, a confirmed delete with recycle-bin-aware wording, and toasts.

Screen-level settings stay one-liners:

```tsx
<ResourceView view={brandsView} layout="page" paging="server" cards live />
```

### 4. Customise in steps

Use the smallest step that does the job:

1. **A setting** on the screen: `header={{ search: true, count: false }}`, `cards`, `paging`,
   `live`, `studio`.
2. **A field**, in the view, so every screen gets it: `fields.status.render`, `fields.notes.editor`,
   `fields.x.hidden`.
3. **A slot**, one part of one screen: `slots={{ peekExtra, card, toolbar, rowActions }}`.
4. **Headless:** `useResourceView(view)` returns the same state as `useResourceTable`, for a
   layout of your own.

A change at level 2 applies to every screen of that resource. A change to `ResourceView` itself
applies to every screen in every app.

## The header: parts, three levels deep

```tsx
<ResourceView view={v} />                                      // the layout's default header
<ResourceView view={v} header={{ search: true, views: true }} /> // switch parts on or off
<ResourceView view={v} header={{ actions: <ExportButton /> }} /> // fill a part
<ResourceView view={v} header={<MyHeader />} />                  // replace it
```

The parts are `title`, `subtitle`, `count`, `search`, `filters`, `views` (saved views),
`viewToggle`, `settings`, `create` and `actions`. Each is also exported
(`ResourceView.Header.Search` and so on), so a custom header composes the same pieces. These are
today's PageHeader, DataFilters and DataPageShell parts behind one API, not new components.

## `studio`: the spreadsheet, one switch away

```tsx
<ResourceView view={v} studio />
```

`studio` swaps the table for Data Studio's `SheetView`: inline cell editing, column resize and
reorder, and keyboard navigation across cells. It keeps the same view, header, peek, permissions
and provider. The record panel stays the view's peek.

- **Optional dependency.** `genesis-studio` is an optional peer, loaded lazily when `studio` is
  on, so an app that never turns it on never ships it.
- **Same rules.** `SheetView` edits through the same provider. A field the user can't update is
  read-only in the grid, as in the form. Writes keep the provider's zero-row refusal and version
  check.
- **Off by default.** Without `studio`, a screen gets the table, title and header its layout
  defines, nothing more.
- **A toggle for users** is opt-in: `header={{ studio: true }}` adds a Table/Sheet switch,
  remembered per view.

## Native: the same view, a native screen

```tsx
<NativeResourceView view={brandsView} />
```

`NativeResourceView` reads the same view file and renders `NativeResourcePage`. The list shows
`cardFields` (from `list`), with search, a form sheet and swipe actions. Labels, rules, defaults
and empty states are shared with the web. Native-only settings live under `native: { ... }` in
the view.

## Why not read the schema at run time

Data Studio reads the schema at run time because it must work on any table. Product screens
shouldn't:

- Labels, order, hidden fields and rules are decisions. They belong in reviewed code.
- Hosted Supabase no longer serves its schema document to browser keys.
- A run-time read costs a round trip before the first paint.
- The compiler can't check names it only learns at run time.

The generator gives the same zero-effort start, ahead of time: run `introspect`, then
`defineView(resource, {})` is already a working screen.

## Security

- **No new authority.** ResourceView never decides access. Reads and writes go through the app's
  provider under row-level security, or through the app's API. `can` only hides controls. Every
  write path keeps the provider's refusal handling.
- **Field permissions come from the server.** `describe()` reports what this user may read and
  update. A column they can't read is never requested (`select` is built from readable fields)
  and never rendered.
- **Defaults aren't trusted.** Create defaults are a convenience. The database's own defaults,
  checks and RLS still apply to whatever the browser sends.
- **The scope isn't a filter for security.** `defaultFilters` from the scope narrow what's shown.
  RLS decides what's allowed.

## Speed and scale

- **Server paging** (`paging="server"`) or cursor paging is one setting, and the view's `select`
  asks only for the listed columns. Large lists never load whole tables.
- **Views and functions as sources** keep joins and counts in the database, not in the browser.
- **Live updates are opt-in** per screen, debounced, and paused while the tab is hidden.
- **Bundle:** `ResourceView` adds a thin layer over `ResourcePage`. `genesis-studio` and the
  native renderer load only where used.
- **Stable identity:** a view is a module constant, so React never sees a new configuration each
  render.

## How an app moves to it

1. Run `genesis-cli introspect` and check in `resources.genesis.ts`.
2. Write one view per resource. Most are 10 to 25 lines.
3. Replace each list screen with `<ResourceView view={...} />` plus its real differences, through
   settings, then fields, then slots, then the hook.
4. Delete the app's own list wrappers and field-rendering code.

For the app audited above, the rough end state is about 1,800 lines in place of about 5,500:

- about 25 views at about 20 lines (500);
- standard screens at 1 to 15 lines;
- complex screens keeping only their custom parts through slots.

The app's own list layer goes away entirely.

## What Genesis needs to build

| Piece | Package | Notes |
| --- | --- | --- |
| `defineView`, view types, `ResourceScope` | genesis-ui (`/resource-view`), types shareable with native | Typed against `ResourceSchema` |
| `ResourceView`, `useResourceView`, header parts | genesis-ui | Built on `ResourcePage` and `useResourceTable` |
| Peek built from view fields | genesis-ui | Uses the field renderers ResourceForm already has |
| Form parity: sections, choice cards, create-only and edit-only fields, defaults from the scope | genesis-ui ResourceForm | What the audited app's own form does today |
| `studio` switch | genesis-ui plus genesis-studio `SheetView` | Lazy optional peer |
| `NativeResourceView` | genesis-ui-native | Over `NativeResourcePage` |
| `introspect` writes view stubs (optional) | genesis-cli | A starting `defineView` per table |

Rough effort: about 4 to 5 days for the web pieces, 1 to 2 for native, then app migrations.

## Open questions for review

1. Should views live beside `resources.genesis.ts` (one folder per app), or beside the feature
   that owns each resource?
2. Is `can` in the view worth having, or should UI rights come only from `describe()`
   permissions plus RLS? The risk is two rule sets drifting.
3. Should `studio` be a developer switch, a user toggle, or both (as proposed)?
4. Should scoping (`ctx.scope`) be a view concern, or always a screen prop?
