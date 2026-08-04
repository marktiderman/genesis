// Platform-agnostic hooks — re-exported from @marktiderman/genesis-core for backwards compatibility
export { useResource, type UseResourceOptions, type UseResourceReturn } from "@marktiderman/genesis-core/hooks";
export { useOne, type UseOneOptions } from "@marktiderman/genesis-core/hooks";
export { useResourceForm, type UseResourceFormOptions, type UseResourceFormReturn } from "@marktiderman/genesis-core/hooks";
export { useWizard, type WizardStep, type UseWizardReturn } from "@marktiderman/genesis-core/hooks";

// Web-specific hooks — remain in @marktiderman/genesis-ui
export { useDataFilters, type FilterDef, type FilterDefs, type FilterValues, type UseDataFiltersOptions } from "./use-data-filters";
export { useKeyboardNavigation, type KeyboardNavOptions, type KeyboardNavResult } from "./use-keyboard-navigation";
export { useIsMobile } from "./use-mobile";
export { useViewPreference } from "./use-view-preference";
export { useViewSettings, type Density, type ViewSettings } from "./use-view-settings";
export { useSavedViews, type UseSavedViewsReturn } from "./use-saved-views";
export { createPrefetch, type RouteMap } from "./use-prefetch";
export { useResourcePage, type UseResourcePageProps, type UseResourcePageReturn, type ResourceColumnDef, type ResourceActions } from "./use-resource-page";
export {
  useCommandPaletteHotkey,
  type CommandPaletteItem,
  type CommandPaletteProps,
} from "../components/ui/command-palette";
export { CommandPalette } from "../components/ui/command-palette";
