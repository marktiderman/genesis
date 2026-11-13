---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-studio": patch
"@marktiderman/genesis-studio-server": patch
---

Custom views (ADR 0019): a screen an app draws itself over a view, while Genesis keeps the view's data and states.

- genesis-ui (`/data`): `<CustomView view type="list|board|calendar">{(state) => …}</CustomView>` and `useCustomView` load the view's rows with its scope, preset, filters, URL state, live updates and permissions, and draw loading, empty (the view's `copy.empty` words) and error with a retry, each replaceable (`loading`, `empty`, `error`). The headless view query every view type shares is exported: `useViewListParams`, `useViewList` (paging, sort, search, selection, the open record, `urlState`, `can`), `useViewPermissions`, `useViewBoard` (columns from the board block, the move with its guards, refusal and conflict) and `useViewCalendarRange` (one window's rows, live). ResourceBoard and ResourceCalendar now load through `useViewBoard` and `useViewCalendarRange`, unchanged on screen. `useReducedMotion` (`/hooks`, `/data`).
- genesis-core (`/resource-view`): `groupRows(view, rows, options)` groups rows by the view's `groupBy` on any platform.
- genesis-design-system: `THEME_PARTS` gains `custom-view` (`data-view-type`, `data-state`), `custom-view-loading`, `custom-view-empty` and `custom-view-error`.
- genesis-cli: doctor rules `app-part-name` (an app's own `data-slot` starts `app-` and doesn't clash with a Genesis part), `app-part-colors` (custom views and app parts take colours from roles only) and `custom-view-states` (a custom view doesn't draw its own loading, empty or error), all warn.

View types and record pages (ADR 0021):

- genesis-ui (`/data`): a view-type registry (`defineViewType`, `registerViewType`, `resolveViewType`, `listViewTypes`); `<ResourceView type>` is the preferred prop (`mode` stays as its alias) and dispatches through it, with `gallery` now its own type. `open` (`side-peek`, `center-peek`, `page`) and `recordView` on ResourceView; ResourcePage's `detail` takes the same words beside `panel`, `modal` and `route` (`detailMode`, `recordOpen`). The board and the calendar honour the open mode (`open`, `recordView`, `onNavigate`). A peek draws the view's record view when it names one: `RecordPeek`, and `RecordView presentation="peek"` (sections as tabs that switch in place; `section` and `sectionHref` are optional there). RecordView draws the document template.
- genesis-core (`/resource-view`): `defineView`'s `open` (`RecordOpen`, `RECORD_OPEN_MODES`) and `recordView`; `defineRecordView`'s `template` (`standard`, `document`) and `document` (`cover`, `icon`, `properties`, `body`). A field's form-control hint is `control` (`ControlHint`, `fieldControl`); `widget` and `WidgetHint` stay as deprecated aliases every reader still reads.
- genesis-ui-native: `NativeResourceView` takes `type` (`list`, `grid`, `gallery`), `mode` its alias; `NativeResourceViewType`.
- genesis-studio, genesis-studio-server and `genesis introspect` read `control` beside `widget`.
- genesis-design-system: parts `board`, `board-column`, `board-card`, `calendar`, `calendar-event`, `gallery`, `record-page`, `record-peek` and the document template's `record-page-cover`, `-icon`, `-title`, `-properties` and `-body`.
- genesis-cli: the ui doctor rule `lists-use-resource-view` accepts a file that defines or registers a view type, and a KanbanBoard fed by `useViewBoard`.
