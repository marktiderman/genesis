// UI Primitives
export { Button, type ButtonProps, type ButtonAsChildProps } from "./components/ui/button";
export { Badge, type BadgeProps } from "./components/ui/badge";
export {
  StatusBadge,
  statusBadgeVariants,
  type StatusBadgeProps,
  type StatusBadgeStatus,
} from "./components/patterns/status-badge";
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./components/ui/card";
export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "./components/ui/dialog";
export { AlertDialog, AlertDialogPortal, AlertDialogOverlay, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "./components/ui/alert-dialog";
export { Input } from "./components/ui/input";
export { Checkbox } from "./components/ui/checkbox";
export { Select, SelectGroup, SelectValue, SelectContent, SelectTrigger, SelectItem, SelectScrollUpButton, SelectScrollDownButton } from "./components/ui/select";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
export { Progress } from "./components/ui/progress";
export { Skeleton } from "./components/ui/skeleton";
export { Separator } from "./components/ui/separator";
export { ScrollArea } from "./components/ui/scroll-area";
export { Tooltip, type TooltipProps } from "./components/ui/tooltip";
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./components/ui/collapsible";
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup } from "./components/ui/dropdown-menu";
export { Popover, PopoverTrigger, PopoverContent } from "./components/ui/popover";
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption } from "./components/ui/table";
export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator } from "./components/ui/command";
export {
  CommandPalette,
  useCommandPaletteHotkey,
  type CommandPaletteProps,
  type CommandPaletteItem,
} from "./components/ui/command-palette";
export { EmptyState, NoFeaturesFound, NoFeedbackFound, NoSearchResults, type EmptyStateProps } from "./components/patterns/empty-state";
export { Label } from "./components/ui/label";
export { Textarea } from "./components/ui/textarea";
export { Switch } from "./components/ui/switch";
export { SettingsRow, type SettingsRowProps } from "./components/patterns/settings-row";
export { ToggleRow, type ToggleRowProps } from "./components/patterns/toggle-row";
export { RadioGroup, RadioGroupItem } from "./components/ui/radio-group";
export { Alert, AlertTitle, AlertDescription, alertVariants } from "./components/ui/alert";
export { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "./components/ui/pagination";
export { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis } from "./components/ui/breadcrumb";
export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription } from "./components/ui/sheet";
export { Drawer, DrawerPortal, DrawerOverlay, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription } from "./components/ui/drawer";
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./components/ui/accordion";
export { Avatar, AvatarImage, AvatarFallback } from "./components/ui/avatar";
export { UserAvatar, userAvatarVariants, type UserAvatarProps } from "./components/patterns/user-avatar";
export { Slider } from "./components/ui/slider";
export { Toggle, toggleVariants } from "./components/ui/toggle";
export { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
export { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuCheckboxItem, ContextMenuRadioItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuGroup, ContextMenuPortal, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuRadioGroup } from "./components/ui/context-menu";
export { HoverCard, HoverCardTrigger, HoverCardContent } from "./components/ui/hover-card";
export { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuContent, NavigationMenuTrigger, NavigationMenuLink, NavigationMenuIndicator, NavigationMenuViewport, navigationMenuTriggerStyle } from "./components/ui/navigation-menu";
export { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem, MenubarSeparator, MenubarLabel, MenubarCheckboxItem, MenubarRadioItem, MenubarGroup, MenubarPortal, MenubarSub, MenubarSubContent, MenubarSubTrigger, MenubarRadioGroup, MenubarShortcut } from "./components/ui/menubar";
export { AspectRatio } from "./components/ui/aspect-ratio";
export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "./components/ui/input-otp";
export { type CarouselApi, Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "./components/ui/carousel";
export { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./components/ui/resizable";
export { Toaster, toast } from "./components/ui/sonner";
export { Spinner, type SpinnerProps } from "./components/ui/spinner";
export { PageLoading, pageLoadingVariants, type PageLoadingProps } from "./components/patterns/page-loading";
export { Kbd, type KbdProps } from "./components/ui/kbd";
export { H1, H2, H3, H4, P, Lead, Large, Small, Muted } from "./components/ui/typography";
export { ButtonGroup, type ButtonGroupProps } from "./components/ui/button-group";
export { InputGroup, InputGroupInput, InputGroupPrefix, InputGroupSuffix, type InputGroupProps } from "./components/ui/input-group";
export { Calendar, CalendarDayButton } from "./components/ui/calendar";
export { DatePicker, type DatePickerProps } from "./components/ui/date-picker";
export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle, type ChartConfig } from "./components/ui/chart";
export { FormField, FormLabel, FormError, FormDescription } from "./components/patterns/form-field";
export { Toolbar, ToolbarButton, ToolbarLink, ToolbarSeparator, ToolbarToggleGroup, ToolbarToggleItem, toolbarVariants, type ToolbarProps, type ToolbarButtonProps, type ToolbarLinkProps, type ToolbarSeparatorProps, type ToolbarToggleItemProps } from "./components/ui/toolbar";
export { VisuallyHidden, type VisuallyHiddenProps } from "./components/ui/visually-hidden";
export { AccessibleIcon, type AccessibleIconProps } from "./components/ui/accessible-icon";
// Experimental — Radix ships this as `unstable_PasswordToggleField`; its props
// may change in a minor. See the file header for the full stability note.
export { PasswordToggleField, PasswordToggleFieldInput, PasswordToggleFieldToggle, PasswordToggleFieldSlot, PasswordToggleFieldIcon, type PasswordToggleFieldProps, type PasswordToggleFieldInputProps, type PasswordToggleFieldToggleProps, type PasswordToggleFieldSlotProps, type PasswordToggleFieldIconProps } from "./components/ui/password-toggle-field";

// Layout primitives — page structure, no domain, no data. Also available
// narrowly at `@marktiderman/genesis-ui/layout`.
export { Stack, stackVariants, type StackProps } from "./components/layout/stack";
export { Grid, gridVariants, type GridProps } from "./components/layout/grid";
export {
  Split,
  splitVariants,
  type SplitProps,
  type SplitBreakpoint,
  type SplitRatio,
} from "./components/layout/split";
export {
  Section,
  sectionHeadingVariants,
  type SectionProps,
} from "./components/layout/section";
export {
  Container,
  containerVariants,
  type ContainerProps,
} from "./components/layout/container";
export {
  GAP_CLASSES,
  spaceScale,
  type SpaceToken,
} from "./components/layout/spacing";

// Page templates — still the layout tier: each takes its content as
// props/children and needs no resource contract. The record-bound
// counterpart to `DetailPage` is `ResourceDetailPage`, which does need one
// and therefore ships from `@marktiderman/genesis-ui/data`.
export {
  DetailPage,
  type DetailPageProps,
} from "./components/layout/detail-page";
export { FormPage, type FormPageProps } from "./components/layout/form-page";
export {
  DashboardPage,
  type DashboardPageProps,
} from "./components/layout/dashboard-page";
export {
  SettingsPage,
  type SettingsPageProps,
  type SettingsPageSection,
} from "./components/layout/settings-page";

// Utilities
export { cn } from "./utils";

// Router-agnostic navigation primitives
export {
  DefaultLink,
  isPathActive,
  defaultNavigate,
  useBrowserSearchParams,
  type GenesisLinkProps,
  type LinkComponent,
  type NavigateFn,
  type SearchParamsAdapter,
} from "./navigation";
export * from "./slots";
