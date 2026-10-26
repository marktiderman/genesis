// @marktiderman/genesis-core/resource-view: what a resource means to people, with no React.
// See docs/RESOURCE-VIEW.md. genesis-ui's ResourceView and genesis-ui-native's
// NativeResourceView draw it.

export { defineView, deriveDisplay, ViewDefinitionError } from "./define-view";
export type {
  Allowed,
  ComputedColumn,
  DisplayHint,
  FieldNameOf,
  ResolvedColumn,
  ResolvedFormField,
  ResourceView,
  RowOf,
  RowSummary,
  ViewColumn,
  ViewCopy,
  ViewDefinition,
  ViewField,
  ViewFormItem,
  ViewGuards,
  ViewPreset,
  ViewTone,
} from "./types";
