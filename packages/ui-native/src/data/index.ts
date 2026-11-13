// Data components — high-level config-driven components mirroring @marktiderman/genesis-ui/data
// Components are added as they are implemented in subsequent tasks.
export { NativeEmptyState, type NativeEmptyStateProps } from "./NativeEmptyState";
export { NativeDataFilters, type NativeDataFiltersProps } from "./NativeDataFilters";
export { NativeDataPageShell, type NativeDataPageShellProps } from "./NativeDataPageShell";
export { NativeDetailPanel, type NativeDetailPanelProps, type NativeDetailField } from "./NativeDetailPanel";
export { NativeResourceFormFieldRenderer, type NativeResourceFormFieldRendererProps } from "./NativeResourceFormField";
export { NativeResourceForm, type NativeResourceFormProps } from "./NativeResourceForm";
export { NativeResourcePage, type NativeResourcePageProps, type NativeCardFieldDef } from "./NativeResourcePage";
export * from "./resource-view";
// A save that met someone else's change: theirs above yours, then keep mine or take theirs.
export { NativeConflictSheet, type NativeConflictSheetProps, type NativeConflictSheetMessages } from "./NativeConflictSheet";
// Web parity twins: the form pieces beyond one input, a custom view, and a record in a peek.
export {
  NativeFieldArrayRenderer,
  NativeFileUploadField,
  NativeRelationField,
  NativeWizardForm,
  type NativeFieldArrayRendererProps,
  type NativeFileUploadFieldProps,
  type NativeRelationFieldProps,
  type NativeWizardFormProps,
} from "./NativeFormFields";
export { NativeCustomView, useNativeCustomView, type NativeCustomViewProps, type NativeCustomViewState } from "./NativeCustomView";
export { NativeRecordPeek, type NativeRecordPeekProps } from "./NativeRecordPeek";
