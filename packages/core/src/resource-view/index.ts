// @marktiderman/genesis-core/resource-view: what a resource means to people, with no React.
// See docs/RESOURCE-VIEW.md. genesis-ui's ResourceView and genesis-ui-native's
// NativeResourceView draw it.

export { defineView, deriveDisplay, ViewDefinitionError } from "./define-view";
export { initialsOf, rowPicture } from "./picture";
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
} from "./types";
export { defineWorkspace, isWorkspace } from "./workspace";
export type {
  ResolvedReadinessItem,
  ResolvedWorkspaceSection,
  ResourceWorkspace,
  WorkspaceDefinition,
  WorkspaceFilter,
  WorkspaceHeader,
  WorkspaceHeaderAction,
  WorkspaceListSection,
  WorkspaceReadinessItem,
  WorkspaceSection,
  WorkspaceSettingsSection,
  WorkspaceSlotSection,
} from "./workspace";
