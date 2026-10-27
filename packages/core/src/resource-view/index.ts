// @marktiderman/genesis-core/resource-view: what a resource means to people, with no React.
// See docs/RESOURCE-VIEW.md. genesis-ui's ResourceView and genesis-ui-native's
// NativeResourceView draw it.

export { defineView, deriveDisplay, valueText, ViewDefinitionError } from "./define-view";
export { initialsOf, rowPicture } from "./picture";
export { scopeValues } from "./scope";
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
  Viewer,
} from "./types";
export { NO_VIEWER } from "../viewer";
export type { GenesisViewerRoles } from "../viewer";
export { defineWorkspace, isWorkspace } from "./workspace";
export type {
  ResolvedReadinessItem,
  ResolvedWorkspaceSection,
  ResourceWorkspace,
  WorkspaceDefinition,
  WorkspaceFilter,
  WorkspaceHeader,
  WorkspaceHeaderAction,
  WorkspaceHeaderOptions,
  WorkspaceListSection,
  WorkspaceReadinessItem,
  WorkspaceSection,
  WorkspaceSettingsSection,
  WorkspaceSlotSection,
} from "./workspace";
