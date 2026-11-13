# ADR 0017: Lists v-next: what a view declares

- Status: accepted (2026-11-13)
- Date: 2026-11-10
- Features: `view-filters`, `view-actions`, `saved-views`, `view-export`, `list-emphasis`,
  `resource-view-shaping`, `resource-page`, `data-views`, `list-url-state`, `resource-view-sheet`,
  `native-resource-view-cards`
- Related: docs/RESOURCE-VIEW.md, ADR 0009 (one resource contract), ADR 0013 (the customization
  layer), ADR 0019 (custom views), ADR 0020 (the app client layer), ADR 0021 (view types),
  docs/FRAMEWORK.md (G1–G6)

## Context

A list is the screen apps build most. Genesis's answer is a view (`defineView`) rendered by
`<ResourceView>` on the web and `<NativeResourceView>` on a phone. A baseline audit compared
Genesis lists with the lists people already know: Linear, Notion, Airtable, HubSpot, Stripe and a
leading coaching platform. It found the table engine strong: `DataTable` and `ResourcePage`
already sort, page, resize, pin, reorder and virtualise columns, select rows, run bulk actions,
keep state in the URL and save views. The view layer is thin. Much of what people expect exists
lower down or in a type, but a view can't declare it, so every app wires it again by hand, or
does without.

Parity here covers form and function. How a list looks and feels (what stands out in a row,
how dense it is, how a card is put together, the surface it sits on) counts as much as what it
does. A list that works but looks like every other Genesis app is a gap too.

Each gap below was checked against the code on `main` (2026-11-10).

1. **Filters, chips and segments.** A view has `presets` (`packages/core/src/resource-view/types.ts`,
   `ViewPreset`): columns plus an equality filter, and a screen picks one with `preset`
   (`packages/ui/src/components/data/resource-view/view-list.tsx`, `presetOf`). Nothing draws the
   presets as tabs, and nothing counts them. `ResourcePage` has `statusFilter` (chips, with an
   optional `count` per chip in `DataFilters.tsx`, `StatusChipOption`) and `filters`
   (`DataFilterConfig[]`), which is hands-off by design: the caller owns each filter's state, it is
   invisible to "Clear filters", and client mode doesn't apply it (`ResourcePage.tsx`, the
   `filters` prop). A view can't declare a filter. On a phone, `NativeResourceView` takes a
   `preset`, a `filter` and search (`packages/ui-native/src/data/resource-view/use-native-resource-view.ts`,
   `NativeResourceViewOptions`) and has no filter or segment control; a screen draws one in `header`.
2. **Row actions.** A view declares `actions` with a `can` guard that returns a reason
   (`types.ts`, `ViewAction`, `ResourceView.canAction`). Only the record page reads them
   (`packages/core/src/resource-view/record-view.ts`). The web list draws no row menu: `DataTable`
   has `renderActions` (`DataTable.tsx`), but `ResourcePage` never passes it. On a phone, swipe and
   long press offer edit and delete from the guards only (`mapping.ts`, `swipeActionsFor`), never
   the view's own actions. There is no right-click menu on the web list.
3. **Bulk actions.** `ResourcePage` takes `bulkActions` with `onAction(ids)` (`ResourcePage.tsx`).
   They are screen props, not view declarations, so nothing ties them to `actions` or to the
   guards. The bar's total is the loaded rows (`ResourcePage.tsx`, `totalCount: page.data.length`),
   so "select all" means "this page". Shift-click in `DataTable` extends the sort
   (`DataTable.tsx`, `nextSort`), not a selection range. A phone has no multi-select.
4. **URL state and saved views.** `urlState` is opt-in and keeps the open record, page, sort and
   search (`packages/ui/src/hooks/use-resource-url-state.ts`, keys `id`, `page`, `sort`, `q`). The
   preset and filters are not in the URL, so a filtered list can't be shared. `useSavedViews`
   (`packages/ui/src/hooks/use-saved-views.ts`) stores views in the browser through
   `usePersistedUiState`: one person, one device, and `ResourceView` doesn't wire it. The view's
   `version` (`types.ts`) already says it guards saved views' shape.
5. **Paging and scale.** `ResourceView` already pages on the server by default
   (`ResourceView.tsx`, `useResourceViewProps`), while `ResourcePage`'s own default stays `client`.
   With `pagination="cursor"`, search, sort and filters act only on the rows loaded so far
   (`ResourcePage.tsx`, the `pagination` prop; RESOURCE-VIEW.md, "Speed and scale", says the same).
   `virtualize` is a `DataTable` prop, switched off whenever the table pages (`DataTable.tsx`), and
   reachable from a view's list only through `slotProps.table`.
6. **Grouping.** A view declares `groupBy` (`types.ts`) and `defineView` checks it
   (`define-view.ts`). A phone draws it as sections (`mapping.ts`, `sectionsFor`). The web ignores
   it: `useResourceViewProps` never reads it, and neither `DataTable` nor `DataGrid` has group
   rows. Feature `resource-view-shaping` (planned) names the gap.
7. **Emphasis and hierarchy.** The display hints (`types.ts`, `DisplayHint`) say how a value is
   drawn, never how much it matters. The first column gets the summary's picture
   (`ResourceView.tsx`), and `sizeColumns` lets the label column take the spare width; that is the
   only hierarchy. There is no row tone (an overdue row, a paused client), no leading indicator,
   and no `rowClassName` or `cellClassName` on `DataTable`. `DisplayRenderersProvider`
   (`resource-view/display.tsx`, web and native) replaces a hint's renderer, but the hints are a
   closed set, so an app can't add one.
8. **Export.** `exportCsv` (`packages/core/src/csv.ts`) pages through the provider with the
   list's filters, sort and search, capped at 10,000 rows. Only the Data Studio calls it
   (`packages/studio/src/DataStudio.tsx`). A list has no export. Exports that run as jobs are
   planned under `resource-view-sheet`.
9. **Cards.** A row's summary has a title, subtitle, chips and a picture (`types.ts`,
   `RowSummary`). Without a `summary`, a view's summary is the title alone (`define-view.ts`), so a
   phone row, which draws only the summary (`mapping.ts`, `rowItem`), shows one line while the web
   table shows every column. Beyond that, a card is all or nothing: `renderCard` on the web
   (`ResourcePage.tsx`) and on a phone (`NativeResourceView.tsx`) replaces the whole card.
10. **Detail routes and surfaces.** `detail="route"` navigates to `/{resource}/{id}` as a string
    (`use-resource-table.ts`, `handleRowClick`), which fits neither typed routers nor nested
    routes. A phone takes `onRowPress`. A list's surface varies only by density
    (`DataTable.tsx`, compact, comfortable, spacious), so lists on two brands look the same.

Across gaps 2 and 3, refusals lose their reason on the web: `useResourceViewProps` turns each
guard's `Allowed` into a boolean for `ResourcePage`'s `can` (`ResourceView.tsx`, `allows`), so a
refused edit or delete is hidden with no word on why. A phone keeps the action and its reason
(`mapping.ts`, `swipeActionsFor`).

`pnpm features find` for filter, segment, bulk, export, group and saved view finds the pieces
above and nothing that declares them on a view. Every gap is an extension of what exists (G2),
never a new list: the engine stays `ResourcePage` and `DataTable` on the web and the SectionList
behind `NativeResourceView` on a phone.

## Principles this decision serves

1. **The most functionality for the least time and custom code.** A behaviour people expect in a
   list is a line in the view, on by default where that is safe, and the same line on the phone.
2. **A trellis, not a ceiling.** Every declaration below has an app-level extension point, named
   in its section, at the lowest customization level that reaches it (ADR 0013). A defensible
   customization is always possible without ejecting a component.
3. **Checks align, they don't stop.** Doctor rules that come with this work warn toward the
   declaration (a hand-built filter bar beside a view, say); they never refuse an extension point.

## Decision

The view declares what a list does; each platform decides how it looks there. Every key is
optional and additive: a view that sets none of them behaves exactly as today. Declarations are
plain data where they can be (so web, native and other surfaces read the same view) and pure
functions of the row or the viewer where they must be. Screens keep their props, and a screen's
prop wins over the view's, as today (RESOURCE-VIEW.md, "Words: each step overrides the one before").

A view with the keys this release ships (the later ones, `leading`, `card` and `detail.route`, are
in their sections below):

<!-- docs-check: skip -->
```ts
export const tasksView = defineView(tasksContract, {
  fields: {
    title: { emphasis: "title" },
    status: { tones: { todo: "muted", doing: "info", done: "success" } },
    due_on: { emphasis: "secondary", hideBelow: "md", width: 120 },
    estimate_hours: { sortable: false },
  },
  filters: [{ field: "status" }, { field: "due_on" }, { field: "notes" }],
  segments: [
    { id: "open", label: "Open", where: { status: ["todo", "doing"] }, count: true },
    { id: "mine", label: "Mine", where: (viewer) => ({ owner_id: viewer.id }), count: true },
    { id: "all", label: "All" },
  ],
  actions: [
    { name: "complete", label: "Mark done", bulk: true, can: (t) => (t.status === "done" ? "It's already done." : true) },
    { name: "archive", label: "Archive", destructive: true, bulk: { confirm: "Archive {count} tasks?", matching: true, run: archiveMatching } },
  ],
  types: ["table", "board", "calendar"],
  groupBy: "status",
  totals: { estimate_hours: "sum" },
  rowTone: (t) => (t.overdue ? "danger" : undefined),
  export: true,
  board: { field: "status" },
  calendar: { field: "due_on" },
});
```

### 1. Filters, chips and segments

- **The view declares** `filters`: a list of fields a person can filter by, each drawn from what
  the contract and the view already know. A field with choices (an enum, a yes/no) gets
  multi-select chips with its `labels` and `tones`; a link gets a searchable picker from its
  `fields.<link>.link` (the same picker forms use, so row-level security decides what can be
  picked); a date or number gets a range (`kind: "range"`); a text field gets "contains". A filter
  can name `options` to narrow the choices and `default` to start set.
- **The view declares** `segments`: the named tabs over a list ("Open", "Mine", "All"), each with
  an `id`, a `label`, a `where` (the equality, list and `null` filter shape presets already use,
  plus `{ gte, lte }` ranges, or a function of the viewer) and `count: true` for a count beside the
  label. A segment may name a column `preset`. `presets` stay as they are: a screen still picks
  one, and pickers still read them (`ViewLink.preset`).
- **Default behaviour.** With `filters` or `segments`, the list draws them with no screen code: on
  the web a segmented control above `DataFilters` and the filters in its row, on a phone a
  scrolling chip row under the search and the filters in a sheet. Every filter and segment is
  sent to the server, never applied to loaded rows. A count is one count request per segment
  through the provider, in the list's count mode (estimated above the threshold), cached with the
  list's query, and left out where the provider can't count. Declared filters count toward
  "Clear filters" and the empty state's "filtered" wording, which `DataFilterConfig` can't.
- **Extension points.** `slots.filters` (exists) replaces the row; a filter's `component` draws
  one filter the app's own way and receives its value and `onChange`; a screen's `filterSlot`
  adds controls beside the declared ones. `filter` on the screen still fixes values the person
  can't change.

### 2. Row actions in lists

- **The view declares** nothing new: `actions` and `canAction` already describe a row's
  operations. The list now draws them.
- **Default behaviour.** On the web, a row gets a trailing "More" menu (edit, the view's actions,
  delete, in that order, destructive last) and the same menu on right-click, through the
  existing `ContextMenu`. On a phone, the view's actions join edit and delete in long press, the
  accessibility actions and `swipeable`; a view action can say `swipe: "leading" | "trailing"` to
  sit on a swipe edge. Every action runs through the provider, so the server still decides.
- **Refusals keep their reason, on both platforms.** A refused action shows disabled with the
  guard's sentence as its description (and its accessible name), so people learn why. The web
  list stops reducing `Allowed` to a boolean for its row menu. A view or screen sets
  `refusals: "hide"` where a refusal is noise (an action only admins ever see); the default is
  `"disable"`. An action the server doesn't offer (`RowAction` absent from the provider) is
  hidden, never disabled.
- **Extension points.** `rowActions` on the screen: a render override that gets the resolved
  actions and the row, to add, reorder or draw them its own way; `renderCard`'s actions object
  (web) and `NativeResourceCardActions.actions` (phone) carry the view's actions too.

### 3. Bulk actions

- **The view declares** `actions[i].bulk`: `true`, or `{ label, confirm, run }`, where `confirm`
  takes `{count}`. Without `run`, a bulk action runs the row action once per selected row through
  the provider (in one batch where the provider serves `bulkWrites`), checking `can` per row and
  reporting the rows it skipped and why. A view's delete is bulk when the view allows delete.
- **Default behaviour.** On the web, selection appears when the view has a bulk action. Shift-click
  selects a range (the multi-sort moves to Shift-click on the header only, where it already is),
  and the bar offers "Select all {total} matching" after a full page is selected; a selection of
  everything matching is sent as the list's filters, never as ids, and only to a `run` that
  accepts filters (otherwise the bar caps it at the loaded rows and says so). On a phone, a
  "Select" button in the header puts the list in edit mode (checkmarks, a bottom action bar), as
  in the platform's own lists.
- **Extension points.** `slots.bulkBar` (exists) and `slotProps.bulkBar`; a screen's `bulkActions`
  (exists) still adds screen-only actions beside the view's.

### 4. URL state and saved views

- **The view declares** nothing new beyond `filters` and `segments`; their state joins what the
  URL already keeps.
- **Default behaviour.** On the web, a page-layout list keeps its segment (`seg`), declared filters
  (`f.<field>`), search, sort and page in the URL by default whenever an app has registered its
  router's search-params adapter once (`ResourceViewDefaultsProvider`); embedded lists stay out of
  the URL unless they ask, so two lists on one page don't fight. Only declared filters are read
  from the URL (the allow-list in RESOURCE-VIEW.md, "Security model"), and a value a filter
  doesn't accept is dropped. Saved views store the segment, filters, search, sort, columns, mode
  and grouping, stamped with the view's `version`; a stored view of an older version is offered
  as far as it still applies.
- **Extension points.** A `SavedViewStore` interface (`list`, `save`, `remove`, with `scope:
  "personal" | "team"`), passed once to `ResourceViewDefaultsProvider`. The default store is the
  existing `useSavedViews` storage (personal, this device). An app supplies a team store over its
  own table under row-level security; Genesis ships no table for it. `urlState={false}` opts a
  list out; `urlState` with renamed keys still works.

### 5. Paging and scale

- **The view declares** nothing new; the defaults change where they are unsafe.
- **Default behaviour.** `ResourceView` keeps server paging (as today). Cursor paging searches,
  sorts and filters on the server, not on the loaded rows (the fix RESOURCE-VIEW.md promises).
  `virtualize` becomes a `ResourceView` and `ResourcePage` prop, on by default for cursor lists
  and for client lists past a few hundred rows, and allowed with "Load more". `ResourcePage`'s own
  default stays `client` so existing pages don't change.
- **Extension points.** `pagination` and `virtualize` on the screen; `resourceOptions` (exists).

### 6. Grouping on the web

- **The view declares** `groupBy` (exists), plus `totals`: per field, `"sum" | "avg" | "min" |
  "max" | "count"`, shown per group and in a footer.
- **Default behaviour.** The web draws a group header row in the table (and a header in grid and
  list modes) with the value's words and tone, a count and a collapse toggle; collapsed groups are
  remembered per person. The list sorts by the group field first, as the phone does. With server
  paging, a group's count is the server's where the provider can count by group, else the loaded
  rows', marked as partial. The phone keeps its sections and gains the same counts, collapse and
  totals.
- **Extension points.** `renderGroupHeader(group)` on the screen (web and phone), and `groupBy` on
  the screen to change or turn off the view's.

### 7. Emphasis and hierarchy

- **The view declares** `fields.<name>.emphasis`: `"title"` (the row's name, strongest, one per
  view; it defaults to `labelField`), `"secondary"` or `"muted"`. It declares `rowTone(row)`,
  returning a `ViewTone` (or nothing) that the platform draws as a token (a leading bar and a
  tinted surface on the web, a tinted indicator on a phone), never a raw colour. It declares
  `leading`: `{ kind: "avatar" }` (the summary's picture, as today), `{ kind: "icon", icon(row) }`
  or `{ kind: "indicator", field }` (a status dot in the field's tone).
- **Default behaviour.** Without them, nothing changes. With them, both platforms put the title
  first and strongest, demote secondary and muted values in type and colour, and keep the tone
  readable in light and dark (tones are the one `ChipTone` set).
- **Extension points.** `rowClassName(row)` and `cellClassName(column, row)` on the web screen,
  `rowStyle(row)` on a phone; and **registered display hints**: an app names its own hint
  (`display: "app:rating"`) and registers its renderer in `DisplayRenderersProvider` on each
  platform, so the shared view still imports no platform code. An unregistered hint falls back to
  `text` with a development warning.

### 8. Export

- **The view declares** `export`: `true`, or `{ columns, filename, maxRows }`. The default columns
  are the current column preset's, minus sensitive fields and computed columns that have no value
  function; values are written as the list shows them (words, not codes) unless `raw: true`.
- **Default behaviour.** An "Export CSV" item in the list's header menu exports the current list
  (segment, filters, search, sort) through `exportCsv`, formula-safe as today. Past a threshold
  (where the provider doesn't serve the rows quickly, or above about 500 rows), the export runs as
  a job through `genesis-supabase/jobs` behind an app server function and the person is told when
  it is ready (the job path planned under `resource-view-sheet`). A phone shares the file through
  the system share sheet.
- **Extension points.** `onExport({ filters, sort, search, columns })` on the screen or the view
  replaces the export (another format, a server report); `export: false` on a screen turns it off.

### 9. Cards from parts

- **The view declares** `card`: `title`, `subtitle` (a field or a list, joined), `media` (an image
  field, or the gallery block's), `chips` (fields drawn as badges), `meta` (small values with
  their labels) and `footer` (fields along the bottom). Each is a field name, so the block is plain
  data. Without `card`, the card is built from `summary` and, when the view has no `summary`, from
  the first columns of the default preset: the second column becomes the subtitle and badge
  columns become chips. That closes the phone's one-line rows.
- **Default behaviour.** The web's grid and list cards and the phone's rows and grid cards draw
  the same parts in the same order, each in its platform's idiom, with `emphasis` and `rowTone`
  applied.
- **Extension points.** `cardParts` on the screen overrides one part's renderer (`{ media:
  (row) => <Cover … /> }`) and keeps the rest; `renderCard` (exists, both platforms) still owns the
  whole card.

### 10. Detail routes and list surfaces

- **The view declares** `detail.route(row)`, returning `{ to, params, search }`, the shape typed
  routers take. A phone reads the same builder through the app's router adapter.
- **Default behaviour.** With a route, a row is a real link (web: an anchor, so open in a new tab
  and middle-click work; the peek is off unless the screen asks for it), and the record view
  opens there. Without one, the peek opens as today. `detail="route"` with a string path keeps
  working.
- **Surfaces.** A list's `surface`: `"plain"` (today's), `"inset"` (rows in a rounded group, the
  phone's look on the web) or `"striped"`, set app-wide in `ResourceViewDefaultsProvider` or per
  screen. Each surface reads tokens only (`--list-*` in the design system: row height, rule,
  stripe, hover, radius), so a brand changes how every list looks by changing tokens.
- **Extension points.** `onNavigate` (exists) for a router Genesis has no adapter for; brand
  tokens for the surface; `slotProps.table` (exists) for one table's props.

### 11. A switcher across every view type

- **The view declares** `types`: the view types a person may switch between, of `table`, `list`,
  `grid`, `board`, `calendar`, `gallery` and any type the app registers (ADR 0021). Without it the
  view supports table, list and grid, plus each type it has a block for (`gallery`, `board`,
  `calendar`). `defineView` refuses a type whose block is missing.
- **Default behaviour.** A page list whose view supports a type past table, list and grid (or
  declares `types`) shows one switcher in its header, in place of ResourcePage's table, list and
  grid toggle, unless the screen fixes `type`. Every type reads the same list state: the segment,
  the declared filters and the grouping carry across a switch, and above a board, a calendar or an
  app's type a bar draws the segments and filters. Each person's choice is kept through the app's
  `SavedViewStore` (`readCurrent`, `writeCurrent`), so it follows them where the store does, and a
  saved view stores the type with the rest.
- **Extension points.** `types` and `switcher` on the screen narrow or turn it off; a registered
  view type joins it by being listed; `ViewTypeSwitcher` draws it in an app's own layout.

## Extension points, at a glance

| Gap | The view declares | Extension point | Level (ADR 0013) |
| --- | --- | --- | --- |
| 1 | `filters`, `segments` | filter `component`, `filterSlot`, `slots.filters` | Configure, Compose |
| 2 | `actions` (exists) | `rowActions`, `refusals` | Configure, Compose |
| 3 | `actions[i].bulk` | `slots.bulkBar`, screen `bulkActions` | Configure, Compose |
| 4 | (filters and segments in the URL) | `SavedViewStore`, `urlState` | Adapt |
| 5 | (defaults) | `pagination`, `virtualize` | Configure |
| 6 | `groupBy` (exists), `totals` | `renderGroupHeader` | Configure, Compose |
| 7 | `emphasis`, `rowTone`, `leading` | `rowClassName`, `cellClassName`, `rowStyle`, registered hints | Brand, Compose |
| 8 | `export` | `onExport` | Configure, Adapt |
| 9 | `card` | `cardParts`, `renderCard` | Compose |
| 10 | `detail.route` | `onNavigate`, `surface` tokens | Configure, Brand |
| 11 | `types` | `types`, `switcher`, registered view types | Configure, Compose |

## Form: how apps keep their own look

Defaults make a list correct; they must not make every app the same.

1. **Tokens, not styles.** Every new visual (row tone, surface, emphasis, group header, chips) is
   drawn from design-system tokens, so a brand file changes them for every list at once (Brand).
   No new component takes a raw colour.
2. **Emphasis is meaning, not markup.** A view says what matters (`title`, `secondary`, a tone);
   the platform and the brand decide what that looks like. Two apps can give the same view
   different weight, type and colour without touching it.
3. **Parts before wholes.** `cardParts` and the filter's `component` change one part and keep the
   wiring (press, long press, accessibility, selection); `renderCard` remains for a card that is
   entirely the app's own.
4. **Surfaces and density are a set, chosen per app.** `surface` and `density` sit in
   `ResourceViewDefaultsProvider`, so an app picks its feel once.
5. **App hints are first-class.** A registered display hint (a rating, a progress ring, a streak)
   is drawn wherever the column shows: table, card, peek, export words.
6. **Each round ships with a Figma pass.** The library gains the list surfaces, group header,
   segmented control, row menu and bulk bar as components with their variants, so app files design
   with them before code (docs/FIGMA-GUIDELINES.md).

## Migration and compatibility

All of it is additive, in minor releases:

- Every new view key is optional; a view without it renders as today. `presets`, `groupBy`,
  `actions`, `summary` and `renderCard` keep their meaning.
- Two defaults change, and each is limited to `ResourceView`: declared filters and segments reach
  the URL once an app registers its adapter (nothing changes until it does), and row actions
  appear in lists for views that already declare `actions`. The second is visible to existing
  screens, so it ships behind `ResourceViewDefaultsProvider rowActions` (on in new apps' templates)
  for one minor, and on by default in the next.
- Web refusals change from hidden to disabled-with-reason for row and bulk actions; `refusals:
  "hide"` restores today's behaviour per view or app-wide.
- A string `detail="route"`, `bulkActions`, `filters` (`DataFilterConfig`), `statusFilter`,
  `savedViews` and `urlState` all keep working on `ResourcePage`. `genesis doctor` warns (never
  fails) when a screen passes a hand-built `filters` or `bulkActions` that a view declaration could
  replace, with the declaration to use.
- `DisplayHint` widens to accept registered `app:` names; existing hints are unchanged.

## Delivery

**What shipped (2026-11-13), on the web.** Filters and segments with counts, kept in the URL
(`seg`, `f.<field>`) once the app registers its adapter; row actions with their reasons (a "More"
menu and right-click, behind `rowActions` for this minor); bulk actions on the view with refusals
named, Shift-click range select and "Select all matching" for a `run` that takes filters; the
`SavedViewStore` with a device default; the view-type switcher (section 11); grouping with group
and footer totals in the table, grid and list; `emphasis`, `rowTone` and the column hints
(`sortable`, `hideBelow`, `width`); CSV export through `exportCsv`, in words, capped at `maxRows`.
ResourcePage's own users get the row menu (`rowMenu`), the matching selection, `onExport`,
`heldFilters` and the table's `groups`, `footer`, `rowTone` and `rowContextMenu` through the same
props.

**Next.** On the phone: filters, segments, row actions in long press and swipe, and the edit-mode
selection (`NativeResourceView`; the parity file records them). Link filters with a picker, a
filter's own `component`, `leading`, cards from parts (section 9), `detail.route` and surfaces
(section 10), cursor search on the server and `virtualize` by default (section 5), export jobs past
a threshold and sheet mode (`resource-view-sheet`). Saved views restore search and sort only
through the URL for now: a saved view keeps them, and loading one sets the segment, filters, type
and grouping.

**Round 1, gaps 1 to 4: what people do with a list.** Filters and segments with counts (web and
phone), row actions with reasons (menu, right-click, long press, swipe), bulk actions on the view
(range select, select all matching, phone edit mode), and URL state with the `SavedViewStore`.
These share the filter state, so they ship together. Each gets its `features.ts` entry when it
starts building.

**Round 2, gaps 5 to 10: scale and form.** Cursor search on the server and `virtualize`, web
grouping and totals (`resource-view-shaping`), emphasis, tone and leading, export (with the job
path from `resource-view-sheet`), cards from parts, route builders and surfaces.

Each round is measured as RESOURCE-VIEW.md's phase 1 was: the line count of a consumer app's list
screens before and after, and the parity gaps it closes from the list below.

## Glossary

- **Segment**: a named tab over a list, with its own filter and an optional count. Not "preset"
  (a preset is a screen's fixed columns and filter) and not "saved view" (a person's own).
- **Filter** (on a view): a field a person can narrow the list by, drawn by the platform.
- **Saved view**: a person's or a team's stored segment, filters, search, sort, columns and mode.
- **Surface**: the look a list sits on (plain, inset, striped), from tokens.
- **Emphasis**: how much a field matters in a row (title, secondary, muted).
- **Saved-view store**: where a list's saved views and each person's current choices live
  (`SavedViewStore`), passed once to `ResourceViewDefaultsProvider`. Not "preferences table".
- **Type switcher**: the control that switches a list between its view types (`ViewTypeSwitcher`).
  Not "view toggle", which is ResourcePage's older table, list and grid control.

## Alternatives

- **Keep it at the screen.** `ResourcePage` already takes `filters`, `bulkActions`, `savedViews`
  and `urlState`. Lost: each app wires them per screen, the phone gets none of it, and the hands-off
  filter shape can't count, clear or reach the URL. It is the duplication views exist to remove.
- **Draw `presets` as tabs.** Lost: presets are also screens' fixed tabs and pickers' filters
  (`ViewLink.preset`); drawing them would change existing screens, and they have no count or
  viewer-relative filter. Segments may still name a preset for their columns.
- **A filter-builder (any field, any operator) by default.** Lost for now: it fits a data tool
  (the Data Studio already is one) better than a product list, and it widens what the URL accepts.
  A view can opt into it later as one more filter `kind`.
- **Render props for everything** (row, card, group header). Lost as the default: each one is a
  whole-part takeover that drops the wiring (accessibility, selection, swipe). They stay as the
  last step after declarations and parts.
- **A Genesis table for saved views.** Lost: storage and sharing rules are the app's, and a store
  interface keeps Genesis free of schema (ADR 0009's split between contract and app).
- **Hide refused actions (today's web behaviour).** Lost as the default: people can't tell a
  missing feature from a missing permission. Kept as `refusals: "hide"`.

## Consequences

- Views get longer by a few lines each; screens get shorter, and the phone gets the same lists.
- `ResourcePage` gains row menus, group rows, range selection and surfaces that its direct users
  get too, through the same props.
- Providers that can count by group or accept filter-based bulk writes get better counts and
  "select all matching"; others get the honest fallback, marked as partial.
- The design system gains `--list-*` tokens and the library gains the components above.
- Left for later: a filter builder, per-group manual order (with `resource-view-shaping`), and
  saved views shared across apps.

## Open questions, decided

1. **Row actions on by default.** Behind `ResourceViewDefaultsProvider rowActions` (and a screen's
   `rowActions`) for this minor; on by default in the next. Bulk actions show at once: `bulk` is a
   new key, so a view that sets it asked for them.
2. **URL by default.** Page-layout lists only, once the app registers its adapter; an embedded list
   passes `urlState` to join.
3. **Team saved views.** A store interface only (`scope: "personal" | "team"`); the app's store
   decides sharing under its own row security.
4. **Counts.** One count per segment, through the provider's `aggregate` (estimated where it can
   be), cached with the resource's queries. A grouped count function stays a later option.
5. **Tone on the web.** A leading bar plus a tinted row, both from the status tokens.

## Consumer gaps to fold in

Parity and form gaps that consumer apps report while moving their lists onto views. Each names
the gap, which round of this ADR covers it (or "new"), and the evidence, with no app or customer
named. To be filled as the migrations report.

| Gap | Function or form | Covered by | Evidence |
| --- | --- | --- | --- |
| A list over a database function couldn't pass the viewer's scope to it as an argument | Function | new: the Supabase provider's `source.args(context)` gets the list's filters, and `take(field)` reads a scope value and leaves it out of the query | A consumer app's function-backed lists read the scope from a module variable |
| A ViewerScope nested for a sub-area emptied the query cache when it mounted | Function | new: a nested scope for the same viewer keeps the cache; `persistedViewer` names a viewer whose session filled it | Data its router's loaders had read was fetched again |
| ResourceView couldn't draw rows a screen already held | Function | new: `rows` | A consumer app kept hand-built tables for rows it had already read |
| Filters, segments and counts were written per screen | Function | 1 | Several list screens with their own tab bars |
| Refused actions vanished with no reason | Function and form | 2, 3 | People asked why an action was missing |
