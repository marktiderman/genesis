# ADR 0019: Custom views

- Status: proposed
- Date: 2026-11-13
- Features: `custom-views`, `resource-view-board`, `resource-view-calendar`
- Related: ADR 0018 (app brands, styles and themes; parts), ADR 0013 (the customization layer),
  ADR 0017 (proposed: what a view declares), ADR 0021 (view types and record pages),
  docs/RESOURCE-VIEW.md ("Custom views"), docs/GLOSSARY.md ("Look and feel")

## Context

A view (`defineView`) holds the rules for a resource's list: its scope, filters, sort, paging,
permissions, live updates and URL state. Genesis draws it as a table, list, grid, board or
calendar (`<ResourceView>`). Some screens are none of those: a leaderboard whose rows slide into
place, a streak strip, a timeline of a day. An app that wants one today drops below the view:

- the list's data is reachable only as table state (`useResourceView`, `useResourceTable`), which
  throws for a board or calendar;
- a board needs `useBoardColumns` wired by hand (provider, field, values, filters), with no view
  input, no move and no `live`; the move is inside ResourceBoard;
- a calendar's range fetch is an inline query inside ResourceCalendar, unreachable;
- loading, empty and error are drawn again, by hand, on every such screen, each its own way.

So the screen copies what the view already knows and loses what it gives for free: the viewer's
scope, the preset, the permissions, the URL and live updates. `pnpm features find custom` and
`find headless` find `resource-page`'s escape hatches (slots, `renderCard`, `useResourceView`)
and nothing that keeps the view's data and states while the app draws the rest.

## Decision

1. **One headless view query.** Every view type and every custom view starts from the same
   params: `useViewListParams` (genesis-ui/data) turns a screen's `preset`, `filter`, `scoped` and
   `resourceOptions` into the provider's filters, select, enabled and live, under the viewer's
   scope. It was internal; it is exported.
2. **A headless hook per data shape**, each built on (1), each reading under core's list keys so
   a save anywhere refreshes it, and each following `live`:
   - `useViewList(view, options)`: one page of rows with the view's `orderBy`, a search over its
     `labelField`, paging, a selection by record key, the open record, `urlState` (the same
     adapter ResourcePage takes: page, sort, search, open record) and `can` (the view's guards for
     the viewer, narrowed by the screen's own rule, each `true` or its reason).
   - `useViewBoard(view, options)`: the columns from the view's board block (or `boardChoices` of
     its field), paged per column, with the move ResourceBoard does: the resource's own update,
     the guards, a refusal's reason, and keep-mine or take-theirs on a conflict. ResourceBoard
     now draws what it returns.
   - `useViewCalendarRange(view, range, options)`: one calendar window's rows (rows that start in
     it, and with an end field rows that run into it), the cap and the clock, pulled out of
     ResourceCalendar, which now loads through it.
3. **`<CustomView>` and `useCustomView`.** `<CustomView view type="list|board|calendar" …>{(state)
   => …}</CustomView>` calls the hook for its type and draws the three states Genesis owns:
   loading (skeleton rows), empty (`EmptyState` in the view's `copy.empty` words) and error (the
   message and a retry). The app's function draws only `ready` (and `empty`, with `empty={false}`).
   Each state is replaceable through a prop (`loading`, `empty`, `error`). The state the function
   gets has the rows, `groups()` (core's `groupRows`, by the view's `groupBy`), `can`, the params,
   `reducedMotion` and the data of its type. `type` is fixed for a component's life; `<CustomView>`
   keys its body by type so switching is safe.
4. **Parts.** `custom-view` (with `data-view-type` and `data-state`), `custom-view-loading`,
   `custom-view-empty` and `custom-view-error` join `THEME_PARTS`, so an app style shapes the
   states like any other part. The app's own elements inside are its parts, named `app-<name>`
   (ADR 0018).
5. **Helpers.** `groupRows(view, rows, options)` (genesis-core/resource-view, no React) groups rows
   by the view's `groupBy` the same way on every platform; `useReducedMotion()` (genesis-ui/hooks
   and /data) reads the person's motion preference, so an animated custom view can be still.
6. **Doctor rules** (genesis-cli built-ins, warn): `custom-view-states` (a custom view that
   branches on `status === "loading" | "empty" | "error"`), `app-part-name` (an app's own
   `data-slot` that doesn't start `app-`, called out when it clashes with a Genesis part) and
   `app-part-colors` (a custom view or app part colouring with a variable that isn't a colour
   role from the theme stylesheets).

Everything is in genesis-ui (foundation, data tier, ADR 0005) except `groupRows`, which is
genesis-core's, and the rules, which are genesis-cli's. All new exports are `@stability Beta`.

## Glossary

- **custom view**: a screen an app draws itself over a view, while Genesis keeps the view's
  states, data, URL and permissions (`CustomView`, `useCustomView`). Don't use: surface, custom UI,
  skin. Already in docs/GLOSSARY.md.
- **view query**: the params and data a view's list asks for, shared by every view type
  (`useViewListParams`, `useViewList`). Don't use: list config.

## Alternatives

- **A render prop on ResourceView** (`renderList={(rows) => …}`): ties a custom view to
  ResourcePage's table state and its chrome (header, filters, pager) and gives a board or calendar
  nothing. A custom view isn't a variant of the table.
- **Export the hooks only, no `<CustomView>`**: every app would draw loading, empty and error again,
  each its own way, which is the drift this fixes. The headless hooks stay exported for the rare
  screen that needs them, and `custom-view-states` asks why when it draws its own states.
- **A view-type registry entry for every custom screen**: a view type (ADR 0021) is a way any view
  can show, chosen by `type`; a custom view is one screen's drawing. Both exist; a custom view can
  grow into a registered view type when more than one screen wants it.

## Consequences

- Additive: ResourceBoard and ResourceCalendar render as before (their tests are unchanged);
  `CALENDAR_LIMIT` still exports from the same place.
- Apps with hand-wired `useBoardColumns` screens can move to `useViewBoard` or `<CustomView
  type="board">`; nothing forces it.
- ADR 0017 (proposed) adds URL state for presets and filters and web grouping: when it lands,
  `useViewList` and `groupRows` are where they plug in, not a second copy.
- Native: the hooks are web for now (the parity file says so); `groupRows` is platform-neutral and
  NativeResourceView's sections can move onto it.
