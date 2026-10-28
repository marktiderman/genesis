// @marktiderman/genesis-core/resource-view: what a resource means to people, with no React.
// See docs/RESOURCE-VIEW.md. genesis-ui's ResourceView and genesis-ui-native's
// NativeResourceView draw it.

export { defineView, deriveDisplay, plural, singular, valueText, ViewDefinitionError } from "./define-view";
export { initialsOf, rowPicture } from "./picture";
export { scopeValues } from "./scope";
export { cascadeSelection, initialExpanded, setExpanded, treeRows } from "./tree";
export type { ResourceTree, TreeNode, TreeOptions, TreeResult } from "./tree";
export type {
  Allowed,
  ComputedColumn,
  DisplayHint,
  FieldNameOf,
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
  ViewDefinition,
  ViewField,
  ViewFormItem,
  ViewGuards,
  ViewPreset,
  ViewTone,
  TimeZoneName,
  ViewTimeZone,
  Viewer,
} from "./types";
export { NO_VIEWER } from "../viewer";
export type { GenesisViewerRoles } from "../viewer";
export { defineRecordView, isRecordView, defineWorkspace, isWorkspace } from "./record-view";
export type {
  ResolvedReadinessItem,
  ResolvedRecordViewSection,
  RecordView,
  RecordViewDefinition,
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
