---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-cli": minor
---

Custom views (ADR 0019): a screen an app draws itself over a view, while Genesis keeps the view's data and states.

- genesis-ui (`/data`): `<CustomView view type="list|board|calendar">{(state) => …}</CustomView>` and `useCustomView` load the view's rows with its scope, preset, filters, URL state, live updates and permissions, and draw loading, empty (the view's `copy.empty` words) and error with a retry, each replaceable (`loading`, `empty`, `error`). The headless view query every view type shares is exported: `useViewListParams`, `useViewList` (paging, sort, search, selection, the open record, `urlState`, `can`), `useViewPermissions`, `useViewBoard` (columns from the board block, the move with its guards, refusal and conflict) and `useViewCalendarRange` (one window's rows, live). ResourceBoard and ResourceCalendar now load through `useViewBoard` and `useViewCalendarRange`, unchanged on screen. `useReducedMotion` (`/hooks`, `/data`).
- genesis-core (`/resource-view`): `groupRows(view, rows, options)` groups rows by the view's `groupBy` on any platform.
- genesis-design-system: `THEME_PARTS` gains `custom-view` (`data-view-type`, `data-state`), `custom-view-loading`, `custom-view-empty` and `custom-view-error`.
- genesis-cli: doctor rules `app-part-name` (an app's own `data-slot` starts `app-` and doesn't clash with a Genesis part), `app-part-colors` (custom views and app parts take colours from roles only) and `custom-view-states` (a custom view doesn't draw its own loading, empty or error), all warn.
