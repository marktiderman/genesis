// @marktiderman/genesis-studio — the Data Studio workspace UI.
// Pair it with @marktiderman/genesis-studio-server, or any DataProvider that
// implements `describe` and `listResources`.

export { DataStudio, type DataStudioProps, type StudioActivity, type StudioSessionSource } from "./DataStudio";
export {
  createSearchParamsRouter,
  locationFromSearchParams,
  searchParamsFromLocation,
  useHistoryRouter,
  useMemoryRouter,
  type StudioLocation,
  type StudioNavigateOptions,
  type StudioRouter,
  type StudioView,
} from "./router";

// The parts DataStudio is built from, for an app that composes its own workspace.
export { ActivityPanel } from "./DataStudio";
export { BulkEditDialog, type BulkEditDialogProps } from "./toolbar/BulkEdit";
export { ImportDialog, type ImportDialogProps } from "./toolbar/ImportDialog";
export { ExportButton, FilterBuilder, GroupPicker, HideFields, NewRowButton, SearchBox, SortBuilder, ViewFieldPicker, ViewSwitch } from "./toolbar/Toolbar";
export { TableTabs, ViewsPanel } from "./workspace/ViewsPanel";
export { SheetView, type SheetViewProps } from "./sheet/SheetView";
export { KanbanView, type KanbanViewProps } from "./views/KanbanView";
export { CalendarView, type CalendarViewProps } from "./views/CalendarView";
export { RecordPanel, type RecordPanelProps } from "./record/RecordPanel";
export { RelationPicker, type RelationPickerProps } from "./record/RelationPicker";
export { FieldIcon, Pill } from "./grid/cells";
