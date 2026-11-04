---
"@marktiderman/genesis-studio": minor
---

Export the parts `DataStudio` is built from, each `@stability Beta`: the toolbar (`FilterBuilder`, `SortBuilder`, `GroupPicker`, `HideFields`, `ViewSwitch`, `ViewFieldPicker`, `SearchBox`, `ExportButton`, `NewRowButton`), the panels and views (`ViewsPanel`, `TableTabs`, `SheetView`, `KanbanView`, `CalendarView`, `RecordPanel`, `RelationPicker`, `ActivityPanel`), the dialogs (`ImportDialog`, `BulkEditDialog`) and `FieldIcon` and `Pill`. `DataStudio` stays the composed entry point.

Each part's props are exported as a named type (`FilterBuilderProps`, `ViewsPanelProps`, `TableTabsProps`, `ActivityPanelProps`, `FieldIconProps`, `PillProps` and the rest), with `ViewKind` for `ViewSwitch`.
