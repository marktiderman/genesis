export { DataPageShell, type DataPageShellProps } from "./DataPageShell";
export { DataFilters, type DataFilterConfig, type SavedViewItem } from "./DataFilters";
export { DataGrid } from "./DataGrid";
export {
  DataTable,
  ThumbnailCell,
  LinkCell,
  type DataTableColumn,
  type DataTableProps,
} from "./DataTable";
export { DataBulkBar, type BulkAction } from "./DataBulkBar";
export { FilterCombobox, type FilterOption } from "./FilterCombobox";
export { DateCell, NumberCell, CurrencyCell, BadgeCell } from "./cell-formatters";
export { EmptyState } from "./EmptyState";
export { ViewToggle, type ViewMode } from "../patterns/view-toggle";
export { ViewSettings } from "../patterns/view-settings";
export { StatCard, type StatCardProps, type StatCardColor } from "./StatCard";
export { KanbanBoard, type KanbanColumn, type KanbanBoardProps, type ColumnStatus } from "./KanbanBoard";
export { DataList, type DataListProps } from "./DataList";
export { DetailPanel, type DetailPanelProps } from "./DetailPanel";
export {
  ResourcePage,
  type ResourcePageProps,
  type ResourceCardActions,
} from "./ResourcePage";
export {
  ResourceDetailPage,
  type ResourceDetailPageProps,
} from "./ResourceDetailPage";
export { ResourceForm, type ResourceFormProps } from "./ResourceForm";
export { type ResourceFormFieldDef, type FieldType, type SelectOption } from "./ResourceFormField";
export { RelationField } from "./RelationField";
export { FileUploadField } from "./FileUploadField";
export { FieldArrayRenderer } from "./FieldArrayRenderer";
export { WizardForm } from "./WizardForm";
export type { ResourceColumnDef, ResourceActions } from "../../hooks/use-resource-page";
// `AppShell` and `PageHeader` are layouts, not data-bound components — neither
// takes a `DataProvider`. They stay re-exported here for one deprecation window
// per docs/FRAMEWORK.md rule 5, and leave `/data` in the next major.
//
// These are LOCAL RE-BINDINGS rather than `export { X } from "../layout/X"`,
// and that is load-bearing, not style. TypeScript does not attach a JSDoc
// `@deprecated` on an `export ... from` statement to the symbol a consumer
// imports: hovering the import shows no tag and no migration note, so the
// deprecation is invisible exactly where it needs to be read. Only a local
// binding carries the tag through to the emitted `.d.ts` and to the consumer's
// editor. Verified against the TypeScript language service — the regression
// test in `src/components/data/__tests__/deprecated-aliases.test.ts` asserts it
// on the real build output, so this cannot silently rot back.
import {
  AppShell as AppShellImpl,
  type AppShellProps,
  type AppShellOptions,
  type NavItem,
} from "../layout/AppShell";
import {
  PageHeader as PageHeaderImpl,
  type PageHeaderProps,
  type PageHeaderOptions,
} from "../layout/PageHeader";

/**
 * @deprecated Import `AppShell` from `@marktiderman/genesis-ui/layout` instead.
 * `AppShell` is a layout, not a data-bound component. This `/data` alias is
 * removed in the next major — see docs/FRAMEWORK.md rule 5.
 * @stability Deprecated
 */
export const AppShell = AppShellImpl;
/**
 * @deprecated Import `PageHeader` from `@marktiderman/genesis-ui/layout`
 * instead. `PageHeader` is a layout, not a data-bound component. This `/data`
 * alias is removed in the next major — see docs/FRAMEWORK.md rule 5.
 * @stability Deprecated
 */
export const PageHeader = PageHeaderImpl;
export type { AppShellProps, AppShellOptions, NavItem };
export type { PageHeaderProps, PageHeaderOptions };

// Router-agnostic navigation primitives (re-exported for `/data` consumers)
export {
  DefaultLink,
  isPathActive,
  defaultNavigate,
  type GenesisLinkProps,
  type LinkComponent,
  type NavigateFn,
} from "../../navigation";

// Re-export Density for DataTable consumers who import from `/data`
export type { Density } from "../../hooks/use-view-settings";
export {
  CommandPalette,
  useCommandPaletteHotkey,
  type CommandPaletteProps,
  type CommandPaletteItem,
} from "../ui/command-palette";
export { useSavedViews, type UseSavedViewsReturn } from "../../hooks/use-saved-views";
