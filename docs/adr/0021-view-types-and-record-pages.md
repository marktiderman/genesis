# ADR 0021: View types and record pages

- Status: proposed
- Date: 2026-11-13
- Features: `view-types`, `record-pages`, `resource-view-gallery`, `resource-view-board`,
  `resource-view-calendar`
- Related: ADR 0019 (custom views), ADR 0018 (app brands, styles and themes; parts), ADR 0017
  (proposed: what a view declares, detail routes), docs/RESOURCE-VIEW.md ("View types", "Record
  pages"), docs/GLOSSARY.md ("Look and feel")

## Context

A view shows as a table, list, grid, board or calendar, picked with `<ResourceView mode>`. The
choice is a hard-coded `if` chain in ResourceView, so an app that wants a timeline or a map can't
add one beside them; the gallery isn't a type at all but the grid plus a `gallery` block, and the
phone takes `list` or `grid` only.

How a record opens is split three ways. ResourcePage's `detail` (`panel`, `modal`, `route`) is a
screen prop the view can't declare; the board and the calendar ignore it and always open
DetailPanel; and a peek shows the view's columns in DetailPanel, never the record's own page
(`RecordView`), so a record looks different opened from a list than at its route. A record page
has one layout (header, then sections); nothing lays a record out as a document (a cover, an
icon, a title, properties, a body). The docs and features say "peek"; the code says "panel" and
"modal".

A field's `widget` (core's field schema) is a form-control hint, while "widget" is now the
dashboard tile (docs/GLOSSARY.md, decision F of the look-and-feel plan).

`pnpm features find "view type"` and `find peek` find `resource-page` (the `detail` prop),
`resource-view-board`, `resource-view-calendar` and `resource-view-gallery`: each a fixed mode,
none a registry or an open mode on the view.

## Decision

1. **A view-type registry** (genesis-ui `/data`): `defineViewType({ id, label?, render })` and
   `registerViewType(type, { replace? })` (returns an unregister), with `resolveViewType(id)` and
   `listViewTypes()`. `render` gets the screen's ResourceView props and draws with the headless
   hooks of ADR 0019. ResourceView dispatches through it; Genesis registers `table`, `list`, `grid`,
   `gallery`, `board` and `calendar`, which an app can't replace. Each type is its own component,
   so switching type swaps children rather than hooks. An unknown type throws, naming the
   registered ones.
2. **`type` is the prop.** `<ResourceView type>` takes every registered name and `{ mobile,
   desktop }`; `mode` stays as its alias (`type` wins). `type="gallery"` is the grid drawn as
   photos and asks for a gallery block; `type="grid"` with a gallery block still draws photos.
   `NativeResourceView` takes `type` (`list`, `grid`, `gallery`); its board and calendar are
   recorded "not yet" in the parity file.
3. **Open modes on the view** (genesis-core): `defineView(…, { open, recordView })`, `open` one of
   `side-peek` (default), `center-peek` or `page` (`RecordOpen`, `RECORD_OPEN_MODES`), and
   `recordView` a function returning the record view a peek draws (a function, because the record
   view is defined from the view; its return type is named, `(): AnyRecordView => …`, since
   TypeScript can't infer the two from each other). A screen's `open`, or ResourcePage's `detail`, wins.
   ResourcePage's `detail` takes the new words too and maps the old ones (`panel` is `side-peek`,
   `modal` is `center-peek`, `route` is `page`; `detailMode`, `recordOpen`).
4. **Every view type honours it.** The list (through ResourcePage), the board and the calendar
   open a record the same way: a side peek, a center peek, or the record's route through
   `onNavigate` (`/{resource}/{id}`, as ResourcePage's `route` has always done).
5. **A peek is the record page.** With a record view, a peek draws `RecordView` inline
   (`presentation="peek"`: the header, the actions, the readiness chip and the sections as tabs
   that switch in place), in a sheet or a dialog (`RecordPeek`, also exported on its own). Without
   one, it shows the view's columns in DetailPanel, as before. A full page is `RecordView` at its
   route, unchanged.
6. **Record page templates**: `defineRecordView(…, { template: "standard" | "document", document:
   { cover?, icon?, properties?, body? } })`. `document` draws a cover, an icon (an emoji, short
   text or an image), a large title (the summary's), the properties (each drawn as its cell) and
   the body text, above the sections; a document may have no sections. `defineRecordView` checks
   the fields.
7. **Decision F: `control`, not `widget`.** `FieldSchema.control` (`ControlHint`) is the
   form-control hint; `widget` (`WidgetHint`) stays as a deprecated alias that every reader still
   reads through `fieldControl(field)` (core, ui, ui-native, studio, studio-server's contract
   overrides, `genesis introspect`'s `@genesis` comments), `control` winning when both are set.
8. **Parts** (`THEME_PARTS`): `board`, `board-column` (`data-status`), `board-card`
   (`data-saving`), `calendar` (`data-layout`), `calendar-event`, `gallery`, `record-page`
   (`data-template`, `data-presentation`), `record-peek` (`data-open`), `record-page-cover`,
   `record-page-icon`, `record-page-title`, `record-page-properties` and `record-page-body`.
9. **Workspace aliases**: `defineWorkspace`, `isWorkspace`, `ResourceWorkspace` (core type and ui
   component) stay `@deprecated` (`@stability Deprecated`) and go in the next major.

All in the foundation layer (ADR 0005): the registry, the peeks and the template's drawing in
genesis-ui; the open modes, the template's description and `control` in genesis-core.

## Glossary

- **view type**: how a view shows: table, list, grid, board, calendar, gallery, or one an app
  registers (`<ResourceView type>`, `defineViewType`). Don't use: mode (except the alias), list UI.
- **record page**: one record shown on its own, opened as a side peek, a center peek or a full
  page (`open`), on a record page template (`standard`, `document`). Don't use: detail panel,
  workspace, modal (for a peek).
- **control** (a field's): the form-control hint (`FieldSchema.control`). Don't use: widget (for
  this; a widget is a dashboard tile).

## Alternatives

- **A `mode` union apps extend by module augmentation**: types only; ResourceView would still need
  a dispatch an app can't reach. A registry is one runtime place, and the type stays a string.
- **The open mode as a screen prop only** (as `detail` was): every screen of a view repeats it,
  and the board and calendar each need their own. The view is where a list's rules live.
- **Naming the record view on the view directly** (`recordView: brandRecordView`): a cycle, since
  `defineRecordView` takes the view. A function defers it without a registry keyed by view.
- **A document page template in the layout tier** (beside DetailPage): it would know nothing of the
  record's fields; a record page template reads them from the view, the same on every channel.

## Consequences

- Additive: `mode`, `detail` and `widget` keep working; a view without `open` or `recordView`
  opens records exactly as before.
- Detail routes stay `/{resource}/{id}`; typed and nested routes are ADR 0017's (proposed), which
  is where a view's route will be declared.
- Phone: `NativeResourceView` takes `type`; native peeks as sheets drawing `NativeRecordView`, the
  document template on the phone, and a native view-type registry are later work (recorded in
  `ui-parity.json` where a web export has no twin).
