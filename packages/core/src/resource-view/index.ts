// @marktiderman/genesis-core/resource-view: what a resource means to people, with no React.
// See docs/RESOURCE-VIEW.md. genesis-ui's ResourceView and genesis-ui-native's
// NativeResourceView draw it.

export { boardChoices, boardProblems, calendarProblems, defineView, galleryProblems, deriveDisplay, plural, singular, valueText, ViewDefinitionError } from "./define-view";
export { initialsOf, rowPicture } from "./picture";
export { groupRows, groupTotals, type GroupRowsOptions, type RowGroup } from "./group";
export {
  decodeFilterValue,
  encodeFilterValue,
  filterOptionLabel,
  isFilterSet,
  LIST_URL_KEYS,
  listUrlParams,
  readListUrl,
  whereParams,
  type ListState,
} from "./list-state";
export { applicableListState, createLocalSavedViewStore, type SavedView, type SavedViewInput, type SavedViewStore } from "./saved-views";
export { RECORD_OPEN_MODES } from "./types";
export { scopeFilter, scopeValues } from "./scope";
export { filterParams } from "./link";
export { cascadeSelection, initialExpanded, setExpanded, treeRows } from "./tree";
export type { ResourceTree, TreeNode, TreeOptions, TreeResult } from "./tree";
export type {
  Allowed,
  BulkTarget,
  ComputedColumn,
  ResolvedFilter,
  ResolvedSegment,
  SegmentWhere,
  ViewBreakpoint,
  ViewBulkAction,
  ViewEmphasis,
  ViewExport,
  ViewFilter,
  ViewFilterKind,
  ViewFilterValue,
  ViewSegment,
  ViewTotal,
  DisplayHint,
  FieldNameOf,
  LinkFilter,
  LinkedView,
  LinkOrder,
  ResolvedLink,
  ViewCalendarDurationUnit,
  ResolvedColumn,
  ResolvedFormField,
  ResolvedViewAction,
  ResourceView,
  RowImage,
  RowOf,
  RowPicture,
  RowSummary,
  ViewColumn,
  ViewCopy,
  ViewAction,
  ViewBoard,
  ViewGallery,
  ViewCalendar,
  ViewCalendarLayout,
  ViewDefinition,
  ViewField,
  ViewFormItem,
  ViewGuards,
  ViewLink,
  ViewPreset,
  ViewTone,
  RecordOpen,
  TimeZoneName,
  ViewTimeZone,
  Viewer,
} from "./types";
export { NO_VIEWER } from "../viewer";
export type { GenesisViewerRoles } from "../viewer";
export { defineRecordView, isRecordView, defineWorkspace, isWorkspace, sameFormValue } from "./record-view";
export type {
  ResolvedReadinessItem,
  ResolvedRecordViewSection,
  RecordView,
  RecordViewDefinition,
  AnyRecordView,
  RecordViewDocument,
  RecordPageTemplate,
  RecordViewFilter,
  RecordViewHeader,
  RecordViewHeaderAction,
  RecordViewHeaderOptions,
  RecordViewListSection,
  RecordViewReadinessItem,
  RecordViewSection,
  RecordViewSettingsSection,
  RecordViewSlotSection,
  ResourceWorkspace,
  WorkspaceDefinition,
  WorkspaceSection,
  WorkspaceHeaderAction,
} from "./record-view";
// Widgets: a tile on a dashboard or a record page's sidebar, fed by a view (ADR 0023).
export {
  defineWidget,
  isWidget,
  resolveChartSeries,
  resolveProgress,
  resolveStreak,
  resolveWidgetAccess,
  resolveWidgetRequest,
  toWidgetText,
  widgetProblems,
} from "./widget";
export type {
  ChartPoint,
  ChartWidget,
  DefinedWidget,
  ListWidget,
  NumberWidget,
  ProgressWidget,
  Streak,
  StreakWidget,
  WidgetBase,
  WidgetDefinition,
  WidgetFilter,
  WidgetFormat,
  WidgetKind,
  WidgetRequest,
} from "./widget";
