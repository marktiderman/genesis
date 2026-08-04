export { NativeText, textVariants } from "./text";
export type { NativeTextProps, TextPreset } from "./text";

export { NativeButton, buttonVariants, buttonTextVariants } from "./button";
export type { NativeButtonProps } from "./button";

export {
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardDescription,
  NativeCardContent,
  NativeCardFooter,
} from "./card";
export type { NativeCardProps, NativeCardTitleProps } from "./card";

export { NativeHeaderCard } from "./header-card";
export type { NativeHeaderCardProps } from "./header-card";

// --- C2 Tier-1 primitives (PRD-07 Phase C2) ---

export { NativeToastProvider, useToast } from "./toast";
export type {
  NativeToastOptions,
  NativeToastProviderProps,
  NativeToastVariant,
} from "./toast";

export { NativeSheet } from "./sheet";
export type { NativeSheetProps } from "./sheet";

export {
  NativePopover,
  NativePopoverTrigger,
  NativePopoverContent,
} from "./popover";
export type {
  NativePopoverProps,
  NativePopoverTriggerProps,
  NativePopoverContentProps,
} from "./popover";

export { NativeDrawer } from "./drawer";
export type { NativeDrawerProps } from "./drawer";

export {
  NativeAccordion,
  NativeAccordionItem,
  NativeAccordionTrigger,
  NativeAccordionContent,
} from "./accordion";
export type {
  NativeAccordionProps,
  NativeAccordionItemProps,
  NativeAccordionTriggerProps,
  NativeAccordionContentProps,
  NativeAccordionType,
} from "./accordion";

export { NativeCombobox } from "./combobox";
export type { NativeComboboxProps, NativeComboboxOption } from "./combobox";

export { NativeDatePicker, NativeTimePicker } from "./date-time-picker";
export type {
  NativeDatePickerProps,
  NativeTimePickerProps,
} from "./date-time-picker";

export { NativeNumberInput } from "./number-input";
export type { NativeNumberInputProps } from "./number-input";

// --- C3 Tier-2 primitives (PRD-07 Phase C3) ---

export { NativeStepper } from "./stepper";
export type { NativeStepperProps, NativeStepperStep } from "./stepper";

export { NativeSlider, NativeRangeSlider } from "./slider";
export type {
  NativeSliderProps,
  NativeRangeSliderProps,
} from "./slider";

export { NativeSegmentedControl } from "./segmented-control";
export type {
  NativeSegmentedControlProps,
  NativeSegmentedControlOption,
} from "./segmented-control";

export { NativeChip, NativeChipGroup } from "./chip-group";
export type {
  NativeChipProps,
  NativeChipGroupProps,
  NativeChipGroupMode,
} from "./chip-group";

export { NativePagination } from "./pagination";
export type { NativePaginationProps } from "./pagination";

export { NativeEmptyState } from "./empty-state";
export type {
  NativeEmptyStateProps,
  NativeEmptyStateVariant,
} from "./empty-state";

export { NativeInlineAlert, NativeBanner } from "./inline-alert";
export type {
  NativeInlineAlertProps,
  NativeBannerProps,
  NativeInlineAlertVariant,
} from "./inline-alert";

// --- C4 composite patterns (PRD-07 Phase C4) ---

export { NativeListItem, NativeListItemDivider } from "./list-item";
export type { NativeListItemProps } from "./list-item";

export { NativeSectionListHeader } from "./section-list";
export type { NativeSectionListHeaderProps } from "./section-list";

export { NativeSearchBar } from "./search-bar";
export type { NativeSearchBarProps } from "./search-bar";

export { NativeRefreshControl } from "./refresh-control";
export type { NativeRefreshControlProps } from "./refresh-control";

export { NativeBadge, badgeVariants, badgeTextVariants } from "./badge";
export type { NativeBadgeProps } from "./badge";

export { NativeInput } from "./input";
export type { NativeInputProps } from "./input";

export { NativeSeparator } from "./separator";
export type { NativeSeparatorProps } from "./separator";

export { NativeSkeleton } from "./skeleton";
export type { NativeSkeletonProps } from "./skeleton";

export {
  NativeAlert,
  NativeAlertTitle,
  NativeAlertDescription,
  alertVariants,
} from "./alert";
export type {
  NativeAlertProps,
  NativeAlertTitleProps,
  NativeAlertDescriptionProps,
} from "./alert";

export { NativeAvatar } from "./avatar";
export type { NativeAvatarProps } from "./avatar";

export { NativeProgress } from "./progress";
export type { NativeProgressProps } from "./progress";

// --- New components ---

export { NativeCheckbox } from "./checkbox";
export type { NativeCheckboxProps } from "./checkbox";

export {
  NativeDialog,
  NativeDialogContent,
  NativeDialogHeader,
  NativeDialogTitle,
  NativeDialogDescription,
  NativeDialogFooter,
} from "./dialog";
export type {
  NativeDialogProps,
  NativeDialogContentProps,
  NativeDialogHeaderProps,
  NativeDialogTitleProps,
  NativeDialogDescriptionProps,
  NativeDialogFooterProps,
} from "./dialog";

export {
  NativeDropdownMenu,
  NativeDropdownMenuTrigger,
  NativeDropdownMenuContent,
  NativeDropdownMenuItem,
} from "./dropdown-menu";
export type {
  NativeDropdownMenuProps,
  NativeDropdownMenuTriggerProps,
  NativeDropdownMenuContentProps,
  NativeDropdownMenuItemProps,
} from "./dropdown-menu";

export { NativeLabel } from "./label";
export type { NativeLabelProps } from "./label";

export { NativeRadioGroup, NativeRadioGroupItem } from "./radio-group";
export type {
  NativeRadioGroupProps,
  NativeRadioGroupItemProps,
} from "./radio-group";

export {
  NativeSelect,
  NativeSelectTrigger,
  NativeSelectContent,
  NativeSelectItem,
} from "./select";
export type {
  NativeSelectProps,
  NativeSelectTriggerProps,
  NativeSelectContentProps,
  NativeSelectItemProps,
} from "./select";

export { NativeSwitch } from "./switch";
export type { NativeSwitchProps } from "./switch";

export {
  NativeTabs,
  NativeTabsList,
  NativeTabsTrigger,
  NativeTabsContent,
} from "./tabs";
export type {
  NativeTabsProps,
  NativeTabsListProps,
  NativeTabsTriggerProps,
  NativeTabsContentProps,
} from "./tabs";

export { NativeTextarea } from "./textarea";
export type { NativeTextareaProps } from "./textarea";

export { NativeToggle, toggleVariants } from "./toggle";
export type { NativeToggleProps } from "./toggle";

export {
  NativeTooltip,
  NativeTooltipTrigger,
  NativeTooltipContent,
} from "./tooltip";
export type {
  NativeTooltipProps,
  NativeTooltipTriggerProps,
  NativeTooltipContentProps,
} from "./tooltip";

// --- Layout primitives (promoted from Acme incubator, PRD-46 WC-A4) ---

export { Stack, Inline, Box, Grid, spaceScale, spacingClass } from "./layout";
export type {
  StackProps,
  InlineProps,
  BoxProps,
  BoxBackground,
  GridProps,
  SpaceToken,
  SpacingPrefix,
  FlexAlign,
  FlexJustify,
} from "./layout";
