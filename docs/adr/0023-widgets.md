# ADR 0023: Widgets

- Status: proposed
- Date: 2026-11-13
- Features: `widgets`
- Related: ADR 0018 (app brands, styles and themes), ADR 0009 (one resource contract),
  docs/RESOURCE-VIEW.md, docs/GLOSSARY.md ("Look and feel")

## Context

A dashboard in a Genesis app is a row of numbers and a few charts. Genesis drew the numbers three
ways (`StatCard`, `HeadlineNumbers`, `SummaryCard`), each a static tile the app filled in. Every
app fetched the number itself: a list query to count rows, or rows pulled into the browser to add
them up, with its own loading and error states and its own idea of the viewer's scope.
`DashboardPage` said why it had no data-bound twin: core had no aggregate contract
(`resource-view-shaping`, planned). An app style couldn't reach any of the three tiles: none
carried a part.

## Decision

1. **A totals query on the provider.** `DataProvider.aggregate(resource, { metrics, filters,
   search })` returns named totals: `count`, and `sum`, `avg`, `min`, `max` of a field, over the
   rows `getList` would return for the same filters, so row security decides what any total
   covers. It is optional: `resolveAggregate` uses it when it's there, else a count from
   `getList`'s total (one row read), else the rows themselves, paged, refusing past `maxRows`
   rather than leaving rows out. The mock provider implements it; the Supabase provider counts in
   the database and totals with PostgREST's aggregate functions when a project turns them on
   (`aggregateFunctions`). `useAggregate` caches totals under the resource's key, so a write
   through Genesis makes them stale, and `live` keeps them current. This is the smallest part of
   `resource-view-shaping` a widget needs; group totals and footers stay planned there.
2. **A widget is data, fed by a view.** `defineWidget` (genesis-core/resource-view, no React)
   names a view, a preset and a filter, a kind (`number`, `progress`, `streak`, `list`, `chart`),
   a label, a format and an optional `can`. Because it reads through its view, it inherits the
   view's resource, scope keys, presets and field permissions. The pure halves
   (`resolveWidgetRequest`, `resolveWidgetAccess`, `resolveStreak`, `resolveChartSeries`,
   `toWidgetText`) are what both platforms compute.
3. **`<Widget>` owns the states.** genesis-ui's `<Widget>` reads in the viewer's scope
   (ViewerScope), draws loading, an error with a retry, and an empty state, and is live by
   default. A widget over a field the viewer can't read isn't drawn; its `can` only narrows.
4. **One tile.** `WidgetTile` is the tile under `<Widget>`, `StatCard`, `HeadlineNumbers` and
   `SummaryCard`, in a variant each, keeping each one's markup and classes. Its root is a part
   per variant (`widget`, `stat-card`, `headline-number`, `summary-card`) and its pieces are
   shared parts (`widget-label`, `widget-value`, `widget-detail`, `widget-body`), so an app
   style changes every tile at once.
5. **Where widgets go.** A `DashboardPage`'s `stats` take `<Widget>`s as they are (the stat row is
   a grid already); `WidgetGrid` lays out a dashboard's body, with a chart or a list spanning more
   columns. `DetailPage`'s `sidebar` takes them too. Layouts stay free of data: they never import
   a widget.

## Glossary

- **widget**: a small tile on a dashboard or a record page's sidebar, fed by a view
  (`defineWidget`, `<Widget>`). A field's `widget` in core's field schema remains a form control
  hint (decision F renames it `control`).
- **total**: a number worked out over a list's rows (`aggregate`). Don't use: rollup, metric (for
  the value).

## Alternatives

- **A widget per app, on `useResource`.** What apps did: every dashboard re-fetched rows to count
  them and drew its own states. It is the recreation G5 removes.
- **Group totals in the first contract** (`groupBy` on `aggregate`). Charts want them, but the
  Supabase provider can only serve them with aggregate functions on; a chart widget reads a
  bounded set of rows instead until `resource-view-shaping` adds group totals.
- **A widget registry and a theme that picks widgets.** No app has asked to swap a kind's
  drawing; the kinds are a closed union until one does (`defineWidgetKind` would be the name).
  `AppThemeInput` gains no `widgets` defaults: what a theme would set for widgets is a tile's
  look, which is the style's parts.

## Consequences

- `StatCard`, `HeadlineNumbers` and `SummaryCard` render as before and carry the tile's parts.
- A provider without `aggregate` still totals, more slowly for anything but a count.
- Native has no `<Widget>` yet (`widgets` lists native as planned); the contract, its resolvers
  and `useAggregate` work there already, so a native twin draws the same definitions.
- A record page's own widget area waits on the record page templates (ADR 0021): `RecordView`
  has no sidebar to put them in yet.
