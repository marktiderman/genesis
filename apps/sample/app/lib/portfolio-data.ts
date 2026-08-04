/**
 * Web showcase portfolio data — mirrors the native portfolio so each
 * surface has a stable URL. Phase G (G.9-G.10).
 */

export interface PortfolioSection {
  id: string;
  title: string;
  href: string;
  description: string;
  status: "stable" | "beta" | "planned";
}

export const PORTFOLIO_SECTIONS: PortfolioSection[] = [
  {
    id: "tokens",
    title: "Tokens",
    href: "/showcase/tokens",
    description:
      "Six categories — colors, typography, spacing, radii, motion, shadows — sourced live from @marktiderman/genesis-design-system.",
    status: "stable",
  },
  {
    id: "primitives",
    title: "Primitives",
    href: "/showcase/primitives",
    description:
      "Every primitive and pattern in @marktiderman/genesis-ui — buttons through command palettes — with generated prop tables and Storybook links.",
    status: "stable",
  },
  {
    id: "layouts",
    title: "Layouts",
    href: "/showcase/layouts",
    description:
      "Page-shaped scaffolds — AppShell, DetailPage, FormPage, DashboardPage, SettingsPage — plus the Stack/Grid/Split/Section/Container primitives underneath them.",
    status: "stable",
  },
  {
    id: "data",
    title: "Data & Resources",
    href: "/showcase/data",
    description:
      "The @marktiderman/genesis-ui/data layer — ResourcePage, ResourceForm, DetailPanel, KanbanBoard, and the rest of the CRUD toolkit — bound to a live DataProvider.",
    status: "stable",
  },
  {
    id: "standards",
    title: "Standards",
    href: "/showcase/standards",
    description:
      "Design opinions, contribution doctrine, upgrade process — the rules every Genesis consumer follows.",
    status: "stable",
  },
  {
    id: "storybook",
    title: "Storybook",
    href: "http://localhost:6006",
    description:
      "Per-component stories with controls. Each story renders a deterministic state for Chromatic visual regression.",
    status: "stable",
  },
];

export const TOKEN_CATEGORIES = [
  { slug: "colors", label: "Colors", description: "Neutral scale, semantic, status, brand surface." },
  { slug: "typography", label: "Typography", description: "Font families, sizes, weights, line heights, presets." },
  { slug: "spacing", label: "Spacing", description: "Page padding, card padding, section gap." },
  { slug: "radii", label: "Radii", description: "Corner radius scale (sm, md, lg, xl, full)." },
  { slug: "motion", label: "Motion", description: "Duration + easing tokens. Reduce-motion aware." },
  { slug: "shadows", label: "Shadows", description: "Four-stop elevation rhythm (none, sm, md, lg)." },
] as const;

/**
 * Shared shape for every showcase catalog (primitives, layouts, data). One
 * entry = one browsable card + one `/showcase/<section>/:slug` detail page.
 *
 * `hasStory` gates the detail page's "Open in Storybook" button. It is
 * deliberately explicit rather than assumed — an unconditional link here is
 * exactly how earlier showcase content ended up pointing at Storybook IDs
 * that didn't exist. Only set it `true` once a matching `.stories.tsx` file
 * actually exists under `apps/sample/stories/`.
 */
export interface ReferenceCardEntry {
  slug: string;
  label: string;
  blurb: string;
  exports: string[];
  stability: "stable" | "beta" | "planned" | "experimental" | "deprecated";
  hasStory: boolean;
  /**
   * Explicit Storybook story id, for the entries where the derived
   * `<category>-<slug>--default` convention doesn't hold — e.g. a story
   * file with no `Default` export, or one filed under a different `title`
   * category than its catalog section. Omit when the convention holds;
   * every `/showcase/primitives` entry does. Getting this derivation wrong
   * is exactly how the showcase ended up with dead "Open in Storybook"
   * links before — see `git log` on this file.
   */
  storyId?: string;
}

export type PrimitiveCardEntry = ReferenceCardEntry;

export const PRIMITIVE_CARDS: PrimitiveCardEntry[] = [
  { slug: "button", label: "Button", blurb: "Default action surface — 6 variants × 4 sizes.", exports: ["Button"], stability: "stable", hasStory: true },
  { slug: "badge", label: "Badge", blurb: "Compact status pill.", exports: ["Badge"], stability: "stable", hasStory: true },
  { slug: "card", label: "Card", blurb: "Surface container — Header / Title / Description / Content / Footer slots.", exports: ["Card", "CardHeader", "CardTitle", "CardDescription", "CardContent", "CardFooter"], stability: "stable", hasStory: true },
  { slug: "input", label: "Input", blurb: "Single-line text entry.", exports: ["Input"], stability: "stable", hasStory: true },
  { slug: "input-group", label: "InputGroup", blurb: "Composed Input with prefix / suffix slots.", exports: ["InputGroup", "InputGroupInput", "InputGroupPrefix", "InputGroupSuffix"], stability: "stable", hasStory: true },
  { slug: "input-otp", label: "InputOTP", blurb: "One-time password / code entry with slot composition.", exports: ["InputOTP", "InputOTPGroup", "InputOTPSlot", "InputOTPSeparator"], stability: "stable", hasStory: true },
  { slug: "textarea", label: "Textarea", blurb: "Multi-line text entry.", exports: ["Textarea"], stability: "stable", hasStory: true },
  { slug: "label", label: "Label", blurb: "Form label paired with Input/Select/Switch.", exports: ["Label"], stability: "stable", hasStory: true },
  { slug: "checkbox", label: "Checkbox", blurb: "Boolean toggle in form contexts.", exports: ["Checkbox"], stability: "stable", hasStory: true },
  { slug: "switch", label: "Switch", blurb: "Boolean toggle for inline settings.", exports: ["Switch"], stability: "stable", hasStory: true },
  { slug: "radio-group", label: "RadioGroup", blurb: "Mutually-exclusive selection.", exports: ["RadioGroup", "RadioGroupItem"], stability: "stable", hasStory: true },
  { slug: "select", label: "Select", blurb: "Single-value picker with composed Trigger + Content.", exports: ["Select", "SelectTrigger", "SelectContent", "SelectItem", "SelectGroup", "SelectValue"], stability: "stable", hasStory: true },
  { slug: "slider", label: "Slider", blurb: "Continuous value picker (single + range).", exports: ["Slider"], stability: "stable", hasStory: true },
  { slug: "toggle", label: "Toggle / ToggleGroup", blurb: "Pressed/unpressed icon toolbar button.", exports: ["Toggle", "ToggleGroup", "ToggleGroupItem"], stability: "stable", hasStory: true },
  { slug: "button-group", label: "ButtonGroup", blurb: "Adjacent buttons grouped as a single unit.", exports: ["ButtonGroup"], stability: "stable", hasStory: true },
  { slug: "dialog", label: "Dialog", blurb: "Modal blocking surface for confirmations / short flows.", exports: ["Dialog", "DialogTrigger", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription", "DialogFooter"], stability: "stable", hasStory: true },
  { slug: "alert-dialog", label: "AlertDialog", blurb: "Destructive confirmation with explicit action / cancel.", exports: ["AlertDialog", "AlertDialogTrigger", "AlertDialogContent", "AlertDialogHeader", "AlertDialogTitle", "AlertDialogDescription", "AlertDialogFooter", "AlertDialogAction", "AlertDialogCancel"], stability: "stable", hasStory: true },
  { slug: "sheet", label: "Sheet", blurb: "Side / top / bottom-anchored modal panel.", exports: ["Sheet", "SheetTrigger", "SheetContent", "SheetHeader", "SheetTitle", "SheetDescription"], stability: "stable", hasStory: true },
  { slug: "drawer", label: "Drawer", blurb: "Mobile drawer (vaul-based).", exports: ["Drawer", "DrawerTrigger", "DrawerContent", "DrawerHeader", "DrawerTitle", "DrawerDescription", "DrawerFooter"], stability: "stable", hasStory: true },
  { slug: "popover", label: "Popover", blurb: "Anchored content surface.", exports: ["Popover", "PopoverTrigger", "PopoverContent"], stability: "stable", hasStory: true },
  { slug: "hover-card", label: "HoverCard", blurb: "Hover-triggered preview card.", exports: ["HoverCard", "HoverCardTrigger", "HoverCardContent"], stability: "stable", hasStory: true },
  { slug: "tooltip", label: "Tooltip", blurb: "Hover affordance hint with placement options.", exports: ["Tooltip"], stability: "stable", hasStory: true },
  { slug: "dropdown-menu", label: "DropdownMenu", blurb: "Anchored action menu (radix dropdown).", exports: ["DropdownMenu", "DropdownMenuTrigger", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuLabel", "DropdownMenuSeparator", "DropdownMenuCheckboxItem", "DropdownMenuRadioItem"], stability: "stable", hasStory: true },
  { slug: "context-menu", label: "ContextMenu", blurb: "Right-click contextual menu.", exports: ["ContextMenu", "ContextMenuTrigger", "ContextMenuContent", "ContextMenuItem"], stability: "stable", hasStory: true },
  { slug: "menubar", label: "Menubar", blurb: "Application-style menu bar.", exports: ["Menubar", "MenubarMenu", "MenubarTrigger", "MenubarContent", "MenubarItem"], stability: "stable", hasStory: true },
  { slug: "navigation-menu", label: "NavigationMenu", blurb: "Top-level horizontal nav with rich content panels.", exports: ["NavigationMenu", "NavigationMenuList", "NavigationMenuItem", "NavigationMenuContent", "NavigationMenuTrigger", "NavigationMenuLink"], stability: "stable", hasStory: true },
  { slug: "command", label: "Command", blurb: "Cmdk-style command list primitives.", exports: ["Command", "CommandDialog", "CommandInput", "CommandList", "CommandEmpty", "CommandGroup", "CommandItem"], stability: "stable", hasStory: true },
  { slug: "command-palette", label: "CommandPalette", blurb: "Thin action registry over Command — register flat commands, get Cmd/Ctrl+K for free.", exports: ["CommandPalette", "useCommandPaletteHotkey"], stability: "stable", hasStory: true },
  { slug: "tabs", label: "Tabs", blurb: "Top-level content switcher.", exports: ["Tabs", "TabsList", "TabsTrigger", "TabsContent"], stability: "stable", hasStory: true },
  { slug: "accordion", label: "Accordion", blurb: "Collapsible Q&A or settings group.", exports: ["Accordion", "AccordionItem", "AccordionTrigger", "AccordionContent"], stability: "stable", hasStory: true },
  { slug: "collapsible", label: "Collapsible", blurb: "Single-region expand/collapse.", exports: ["Collapsible", "CollapsibleTrigger", "CollapsibleContent"], stability: "stable", hasStory: true },
  { slug: "alert", label: "Alert", blurb: "Inline status banner — title + description.", exports: ["Alert", "AlertTitle", "AlertDescription"], stability: "stable", hasStory: true },
  { slug: "toast", label: "Toast (sonner)", blurb: "Transient feedback via sonner re-export.", exports: ["Toaster", "toast"], stability: "stable", hasStory: true },
  { slug: "progress", label: "Progress", blurb: "Determinate progress bar.", exports: ["Progress"], stability: "stable", hasStory: true },
  { slug: "spinner", label: "Spinner", blurb: "Indeterminate loading indicator.", exports: ["Spinner"], stability: "stable", hasStory: true },
  { slug: "page-loading", label: "PageLoading", blurb: "Full-page or in-section loading state — a centered Spinner with an optional message.", exports: ["PageLoading"], stability: "beta", hasStory: true },
  { slug: "skeleton", label: "Skeleton", blurb: "Content placeholder with shimmer.", exports: ["Skeleton"], stability: "stable", hasStory: true },
  { slug: "avatar", label: "Avatar", blurb: "User identity surface — image + initials fallback.", exports: ["Avatar", "AvatarImage", "AvatarFallback"], stability: "stable", hasStory: true },
  { slug: "user-avatar", label: "UserAvatar", blurb: "Canonical identity avatar — photo when it loads, initials fallback otherwise.", exports: ["UserAvatar"], stability: "beta", hasStory: true },
  { slug: "kbd", label: "Kbd", blurb: "Keyboard-input visualization.", exports: ["Kbd"], stability: "stable", hasStory: true },
  { slug: "separator", label: "Separator", blurb: "Horizontal / vertical divider.", exports: ["Separator"], stability: "stable", hasStory: true },
  { slug: "scroll-area", label: "ScrollArea", blurb: "Custom-styled scroll container.", exports: ["ScrollArea"], stability: "stable", hasStory: true },
  { slug: "aspect-ratio", label: "AspectRatio", blurb: "Maintains an aspect ratio for media surfaces.", exports: ["AspectRatio"], stability: "stable", hasStory: true },
  { slug: "breadcrumb", label: "Breadcrumb", blurb: "Hierarchical navigation trail.", exports: ["Breadcrumb", "BreadcrumbList", "BreadcrumbItem", "BreadcrumbLink", "BreadcrumbPage", "BreadcrumbSeparator"], stability: "stable", hasStory: true },
  { slug: "pagination", label: "Pagination", blurb: "Page-by-page navigation for long lists.", exports: ["Pagination", "PaginationContent", "PaginationItem", "PaginationLink", "PaginationNext", "PaginationPrevious", "PaginationEllipsis"], stability: "stable", hasStory: true },
  { slug: "calendar", label: "Calendar", blurb: "Date picker calendar (react-day-picker).", exports: ["Calendar", "CalendarDayButton"], stability: "stable", hasStory: true },
  { slug: "date-picker", label: "DatePicker", blurb: "Date / range picker with input + popover composition.", exports: ["DatePicker"], stability: "stable", hasStory: true },
  { slug: "carousel", label: "Carousel", blurb: "Horizontal carousel via embla.", exports: ["Carousel", "CarouselContent", "CarouselItem", "CarouselPrevious", "CarouselNext"], stability: "stable", hasStory: true },
  { slug: "resizable", label: "Resizable", blurb: "Resizable panels via react-resizable-panels.", exports: ["ResizablePanelGroup", "ResizablePanel", "ResizableHandle"], stability: "stable", hasStory: true },
  { slug: "table", label: "Table", blurb: "Semantic table primitives.", exports: ["Table", "TableHeader", "TableBody", "TableFooter", "TableHead", "TableRow", "TableCell", "TableCaption"], stability: "stable", hasStory: true },
  { slug: "chart", label: "Chart", blurb: "Recharts wrapper primitives.", exports: ["ChartContainer", "ChartTooltip", "ChartTooltipContent", "ChartLegend", "ChartLegendContent"], stability: "stable", hasStory: true },
  { slug: "form-field", label: "FormField", blurb: "react-hook-form binding wrapper.", exports: ["FormField", "FormLabel", "FormError", "FormDescription"], stability: "stable", hasStory: true },
  { slug: "empty-state", label: "EmptyState", blurb: "Variants for first-run / no-results / error with action slot.", exports: ["EmptyState", "NoFeaturesFound", "NoFeedbackFound", "NoSearchResults"], stability: "stable", hasStory: true },
  { slug: "settings-row", label: "SettingsRow", blurb: "Label + description on one side, a trailing control on the other — the shared row behind every settings list.", exports: ["SettingsRow"], stability: "beta", hasStory: true },
  { slug: "toggle-row", label: "ToggleRow", blurb: "SettingsRow pre-wired with a Switch — the common label+description+on/off preference row.", exports: ["ToggleRow"], stability: "beta", hasStory: true },
  { slug: "status-badge", label: "StatusBadge", blurb: "Status-specific badge for progress/health states — on track / at risk / off track, done / blocked / in progress.", exports: ["StatusBadge"], stability: "beta", hasStory: true },
  { slug: "typography", label: "Typography", blurb: "H1 / H2 / H3 / H4 / P / Lead / Large / Small / Muted.", exports: ["H1", "H2", "H3", "H4", "P", "Lead", "Large", "Small", "Muted"], stability: "stable", hasStory: true },
  { slug: "toolbar", label: "Toolbar", blurb: "Grouped controls that behave as one tab stop — roving tabindex, arrow/Home/End.", exports: ["Toolbar", "ToolbarButton", "ToolbarLink", "ToolbarSeparator", "ToolbarToggleGroup", "ToolbarToggleItem"], stability: "beta", hasStory: true },
  { slug: "visually-hidden", label: "VisuallyHidden", blurb: "Screen-reader-only text: clipped from the layout, kept in the a11y tree.", exports: ["VisuallyHidden"], stability: "beta", hasStory: true },
  { slug: "accessible-icon", label: "AccessibleIcon", blurb: "Accessible name for an icon-only control — hides the glyph, exposes the label.", exports: ["AccessibleIcon"], stability: "beta", hasStory: true },
  { slug: "password-toggle-field", label: "PasswordToggleField", blurb: "Password input with a show/hide toggle that keeps caret position and re-masks on submit. Wraps a Radix unstable_* export — API may change.", exports: ["PasswordToggleField", "PasswordToggleFieldInput", "PasswordToggleFieldToggle", "PasswordToggleFieldSlot", "PasswordToggleFieldIcon"], stability: "experimental", hasStory: true },
];

/**
 * Layout tier — page structure with no domain and no data (the "Admission
 * test" in docs/FRAMEWORK.md: "does it position things without knowing what
 * they are?"). Two groups: page templates (AppShell, PageHeader, DetailPage,
 * FormPage, DashboardPage, SettingsPage) and layout primitives (Stack, Grid,
 * Split, Section, Container).
 *
 * These ship as compound, page-shaped components — better demonstrated live,
 * in a real page, than in Storybook isolation. None of these have a
 * `.stories.tsx` file (except AppShell/PageHeader, which predate this
 * catalog) — `/showcase/layouts/:slug` is their primary demo surface.
 */
export const LAYOUT_CARDS: ReferenceCardEntry[] = [
  { slug: "app-shell", label: "AppShell", blurb: "The chrome this very showcase runs in — collapsible sidebar rail, mobile bottom nav, customizable chrome.", exports: ["AppShell"], stability: "beta", hasStory: true, storyId: "layout-appshell--default" },
  { slug: "page-header", label: "PageHeader", blurb: "Title row with count, entity name, create action, and an optional filters/details slot.", exports: ["PageHeader"], stability: "beta", hasStory: true, storyId: "layout-pageheader--title-only" },
  { slug: "detail-page", label: "DetailPage", blurb: "One record's full view — title row with actions, primary content region, metadata sidebar that drops below content on small screens.", exports: ["DetailPage"], stability: "beta", hasStory: false },
  { slug: "form-page", label: "FormPage", blurb: "A titled form: header, validation summary, a body of sections, and a sticky action bar.", exports: ["FormPage"], stability: "beta", hasStory: false },
  { slug: "dashboard-page", label: "DashboardPage", blurb: "A stat row over a flexible region of charts, tables, and sections.", exports: ["DashboardPage"], stability: "beta", hasStory: false },
  { slug: "settings-page", label: "SettingsPage", blurb: "A sectioned settings surface with a nav rail for jumping between sections.", exports: ["SettingsPage", "SettingsPageSection"], stability: "beta", hasStory: false },
  { slug: "stack", label: "Stack", blurb: "One-dimensional flow — the single most-repeated shape in any application: a run of things in a line, evenly spaced.", exports: ["Stack"], stability: "beta", hasStory: false },
  { slug: "grid", label: "Grid", blurb: "Two-dimensional flow for card and tile collections.", exports: ["Grid"], stability: "beta", hasStory: false },
  { slug: "split", label: "Split", blurb: "The master-detail layout — two panes side by side above a breakpoint, stacked below it.", exports: ["Split"], stability: "beta", hasStory: false },
  { slug: "section", label: "Section", blurb: "A titled region of a page — heading, optional description, optional trailing actions, and the content itself.", exports: ["Section"], stability: "beta", hasStory: false },
  { slug: "container", label: "Container", blurb: "The page gutter — a centered column with a named maximum width and responsive side padding.", exports: ["Container"], stability: "beta", hasStory: false },
];

/**
 * Data tier — the `@marktiderman/genesis-ui/data` subpath. Binds to a
 * `DataProvider` (this app's `<GenesisProvider mock={...}>`) and turns
 * config into a working CRUD surface. Several of these already have a full
 * live page elsewhere in this app (ResourcePage, DataTable, DataFilters, ...)
 * — those cards link out to it instead of duplicating it. The rest
 * (ResourceForm's relation/file/array field types, WizardForm, DataBulkBar,
 * FilterCombobox, ViewSettings, the cell formatters, ResourceDetailPage) get
 * a first live example here.
 */
export const DATA_CARDS: ReferenceCardEntry[] = [
  { slug: "resource-page", label: "ResourcePage", blurb: "Full CRUD page from config — table/grid/list views, search, sort, filters, detail panel, keyboard nav.", exports: ["ResourcePage", "ResourceCardActions"], stability: "beta", hasStory: false },
  { slug: "resource-detail-page", label: "ResourceDetailPage", blurb: "The record-bound counterpart to DetailPage — resolves one record via useOne and renders it.", exports: ["ResourceDetailPage"], stability: "beta", hasStory: false },
  { slug: "resource-form", label: "ResourceForm", blurb: "Config-driven create/edit form behind ResourcePage — text, select, relation, file, and array field types.", exports: ["ResourceForm", "RelationField", "FileUploadField", "FieldArrayRenderer"], stability: "beta", hasStory: false },
  { slug: "wizard-form", label: "WizardForm", blurb: "Multi-step ResourceForm — progress bar, per-step field subsets, back/next/submit.", exports: ["WizardForm"], stability: "beta", hasStory: false },
  { slug: "data-page-shell", label: "DataPageShell", blurb: "Page header with title, count badge, action button, and view toggle, wrapping a filters + content region.", exports: ["DataPageShell"], stability: "beta", hasStory: false },
  { slug: "data-filters", label: "DataFilters", blurb: "Search input, sort select, and status chip filters in one row.", exports: ["DataFilters"], stability: "beta", hasStory: false },
  { slug: "data-table", label: "DataTable", blurb: "Sortable columns, custom cell renderers, pagination, row selection.", exports: ["DataTable", "ThumbnailCell", "LinkCell"], stability: "beta", hasStory: false },
  { slug: "data-grid", label: "DataGrid", blurb: "Switches between grid (cards), table, and list views over the same items.", exports: ["DataGrid"], stability: "beta", hasStory: false },
  { slug: "data-list", label: "DataList", blurb: "Simple list with a custom render function per row.", exports: ["DataList"], stability: "beta", hasStory: false },
  { slug: "data-bulk-bar", label: "DataBulkBar", blurb: "Selection count + bulk action bar that appears once rows are selected.", exports: ["DataBulkBar", "BulkAction"], stability: "beta", hasStory: false },
  { slug: "filter-combobox", label: "FilterCombobox", blurb: "Searchable multi-select popover filter with per-option counts.", exports: ["FilterCombobox", "FilterOption"], stability: "beta", hasStory: false },
  { slug: "cell-formatters", label: "Cell formatters", blurb: "DateCell / NumberCell / CurrencyCell / BadgeCell — drop-in DataTableColumn render functions.", exports: ["DateCell", "NumberCell", "CurrencyCell", "BadgeCell"], stability: "beta", hasStory: false },
  { slug: "kanban-board", label: "KanbanBoard", blurb: "Column-based board with typed statuses and a custom card renderer.", exports: ["KanbanBoard"], stability: "beta", hasStory: false },
  { slug: "stat-card", label: "StatCard", blurb: "Metric display with icon, value, label, and trend indicator.", exports: ["StatCard"], stability: "beta", hasStory: false },
  { slug: "detail-panel", label: "DetailPanel", blurb: "Record detail surface with three layouts — sheet, dialog, or inline master-detail.", exports: ["DetailPanel"], stability: "beta", hasStory: true, storyId: "data-detailpanel--sheet" },
  { slug: "view-toggle", label: "ViewToggle", blurb: "Grid / table / list view switcher, paired with useViewPreference.", exports: ["ViewToggle"], stability: "beta", hasStory: false },
  { slug: "view-settings", label: "ViewSettings", blurb: "Page-size and density popover for dense data views.", exports: ["ViewSettings"], stability: "beta", hasStory: false },
];

export const STANDARDS = [
  {
    title: "The Genesis Framework",
    summary:
      "The layered contract — tokens → primitives → patterns → layouts → data-bound — that decides what belongs in Genesis and what doesn't. Read this before proposing a new component.",
    href: "https://github.com/marktiderman/genesis/blob/main/docs/FRAMEWORK.md",
  },
  {
    title: "Contributing & reuse doctrine",
    summary:
      "Reuse > Extend > Create. Setup, branch/PR flow, changesets, and the gates every PR runs through before merge.",
    href: "https://github.com/marktiderman/genesis/blob/main/CONTRIBUTING.md",
  },
  {
    title: "Migration notes",
    summary:
      "Per-version migration notes, appended at every release — what changed, why, and how to move a consumer app forward.",
    href: "https://github.com/marktiderman/genesis/blob/main/docs/MIGRATION.md",
  },
];
