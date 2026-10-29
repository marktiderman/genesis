/**
 * Web showcase portfolio data — mirrors the native portfolio so each
 * surface has a stable URL.
 */

import { STORYBOOK_URL } from "./storybook";

export interface PortfolioSection {
  id: string;
  title: string;
  href: string;
  description: string;
  status: "stable" | "beta" | "planned";
  /** Served outside the app (a full page load, not a client-side route). */
  external?: boolean;
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
      "Every web and native component, generated from the packages' source: props, stability and examples.",
    status: "stable",
  },
  {
    id: "layouts",
    title: "Layouts",
    href: "/showcase/layouts",
    description:
      "DashboardPage, SettingsPage, FormPage and DetailPage: the page layouts every screen sits in, rendered live.",
    status: "stable",
  },
  {
    id: "standards",
    title: "Standards",
    href: "/showcase/standards",
    description:
      "Design opinions, usage doctrine, upgrade process — the rules every Genesis consumer follows.",
    status: "stable",
  },
  {
    id: "storybook",
    title: "Storybook",
    href: STORYBOOK_URL,
    external: true,
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

export interface PrimitiveCardEntry {
  slug: string;
  label: string;
  blurb: string;
  exports: string[];
  stability: "stable" | "beta" | "planned" | "experimental";
}

export const PRIMITIVE_CARDS: PrimitiveCardEntry[] = [
  { slug: "button", label: "Button", blurb: "Default action surface — 6 variants × 4 sizes.", exports: ["Button"], stability: "stable" },
  { slug: "badge", label: "Badge", blurb: "Compact status pill.", exports: ["Badge"], stability: "stable" },
  { slug: "card", label: "Card", blurb: "Surface container — Header / Title / Description / Content / Footer slots.", exports: ["Card", "CardHeader", "CardTitle", "CardDescription", "CardContent", "CardFooter"], stability: "stable" },
  { slug: "input", label: "Input", blurb: "Single-line text entry.", exports: ["Input"], stability: "stable" },
  { slug: "input-group", label: "InputGroup", blurb: "Composed Input with prefix / suffix slots.", exports: ["InputGroup", "InputGroupInput", "InputGroupPrefix", "InputGroupSuffix"], stability: "stable" },
  { slug: "input-otp", label: "InputOTP", blurb: "One-time password / code entry with slot composition.", exports: ["InputOTP", "InputOTPGroup", "InputOTPSlot", "InputOTPSeparator"], stability: "stable" },
  { slug: "textarea", label: "Textarea", blurb: "Multi-line text entry.", exports: ["Textarea"], stability: "stable" },
  { slug: "label", label: "Label", blurb: "Form label paired with Input/Select/Switch.", exports: ["Label"], stability: "stable" },
  { slug: "checkbox", label: "Checkbox", blurb: "Boolean toggle in form contexts.", exports: ["Checkbox"], stability: "stable" },
  { slug: "switch", label: "Switch", blurb: "Boolean toggle for inline settings.", exports: ["Switch"], stability: "stable" },
  { slug: "radio-group", label: "RadioGroup", blurb: "Mutually-exclusive selection.", exports: ["RadioGroup", "RadioGroupItem"], stability: "stable" },
  { slug: "select", label: "Select", blurb: "Single-value picker with composed Trigger + Content.", exports: ["Select", "SelectTrigger", "SelectContent", "SelectItem", "SelectGroup", "SelectValue"], stability: "stable" },
  { slug: "slider", label: "Slider", blurb: "Continuous value picker (single + range).", exports: ["Slider"], stability: "stable" },
  { slug: "toggle", label: "Toggle / ToggleGroup", blurb: "Pressed/unpressed icon toolbar button.", exports: ["Toggle", "ToggleGroup", "ToggleGroupItem"], stability: "stable" },
  { slug: "button-group", label: "ButtonGroup", blurb: "Adjacent buttons grouped as a single unit.", exports: ["ButtonGroup"], stability: "stable" },
  { slug: "dialog", label: "Dialog", blurb: "Modal blocking surface for confirmations / short flows.", exports: ["Dialog", "DialogTrigger", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription", "DialogFooter"], stability: "stable" },
  { slug: "alert-dialog", label: "AlertDialog", blurb: "Destructive confirmation with explicit action / cancel.", exports: ["AlertDialog", "AlertDialogTrigger", "AlertDialogContent", "AlertDialogHeader", "AlertDialogTitle", "AlertDialogDescription", "AlertDialogFooter", "AlertDialogAction", "AlertDialogCancel"], stability: "stable" },
  { slug: "sheet", label: "Sheet", blurb: "Side / top / bottom-anchored modal panel.", exports: ["Sheet", "SheetTrigger", "SheetContent", "SheetHeader", "SheetTitle", "SheetDescription"], stability: "stable" },
  { slug: "drawer", label: "Drawer", blurb: "Mobile drawer (vaul-based).", exports: ["Drawer", "DrawerTrigger", "DrawerContent", "DrawerHeader", "DrawerTitle", "DrawerDescription", "DrawerFooter"], stability: "stable" },
  { slug: "popover", label: "Popover", blurb: "Anchored content surface.", exports: ["Popover", "PopoverTrigger", "PopoverContent"], stability: "stable" },
  { slug: "hover-card", label: "HoverCard", blurb: "Hover-triggered preview card.", exports: ["HoverCard", "HoverCardTrigger", "HoverCardContent"], stability: "stable" },
  { slug: "tooltip", label: "Tooltip", blurb: "Hover affordance hint with placement options.", exports: ["Tooltip"], stability: "stable" },
  { slug: "dropdown-menu", label: "DropdownMenu", blurb: "Anchored action menu (radix dropdown).", exports: ["DropdownMenu", "DropdownMenuTrigger", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuLabel", "DropdownMenuSeparator", "DropdownMenuCheckboxItem", "DropdownMenuRadioItem"], stability: "stable" },
  { slug: "context-menu", label: "ContextMenu", blurb: "Right-click contextual menu.", exports: ["ContextMenu", "ContextMenuTrigger", "ContextMenuContent", "ContextMenuItem"], stability: "stable" },
  { slug: "menubar", label: "Menubar", blurb: "Application-style menu bar.", exports: ["Menubar", "MenubarMenu", "MenubarTrigger", "MenubarContent", "MenubarItem"], stability: "stable" },
  { slug: "navigation-menu", label: "NavigationMenu", blurb: "Top-level horizontal nav with rich content panels.", exports: ["NavigationMenu", "NavigationMenuList", "NavigationMenuItem", "NavigationMenuContent", "NavigationMenuTrigger", "NavigationMenuLink"], stability: "stable" },
  { slug: "command", label: "Command", blurb: "Cmdk-style command palette.", exports: ["Command", "CommandDialog", "CommandInput", "CommandList", "CommandEmpty", "CommandGroup", "CommandItem"], stability: "stable" },
  { slug: "tabs", label: "Tabs", blurb: "Top-level content switcher.", exports: ["Tabs", "TabsList", "TabsTrigger", "TabsContent"], stability: "stable" },
  { slug: "accordion", label: "Accordion", blurb: "Collapsible Q&A or settings group.", exports: ["Accordion", "AccordionItem", "AccordionTrigger", "AccordionContent"], stability: "stable" },
  { slug: "collapsible", label: "Collapsible", blurb: "Single-region expand/collapse.", exports: ["Collapsible", "CollapsibleTrigger", "CollapsibleContent"], stability: "stable" },
  { slug: "alert", label: "Alert", blurb: "Inline status banner — title + description.", exports: ["Alert", "AlertTitle", "AlertDescription"], stability: "stable" },
  { slug: "toast", label: "Toast (sonner)", blurb: "Transient feedback via sonner re-export.", exports: ["Toaster", "toast"], stability: "stable" },
  { slug: "progress", label: "Progress", blurb: "Determinate progress bar.", exports: ["Progress"], stability: "stable" },
  { slug: "spinner", label: "Spinner", blurb: "Indeterminate loading indicator.", exports: ["Spinner"], stability: "stable" },
  { slug: "skeleton", label: "Skeleton", blurb: "Content placeholder with shimmer.", exports: ["Skeleton"], stability: "stable" },
  { slug: "avatar", label: "Avatar", blurb: "User identity surface — image + initials fallback.", exports: ["Avatar", "AvatarImage", "AvatarFallback"], stability: "stable" },
  { slug: "kbd", label: "Kbd", blurb: "Keyboard-input visualization.", exports: ["Kbd"], stability: "stable" },
  { slug: "separator", label: "Separator", blurb: "Horizontal / vertical divider.", exports: ["Separator"], stability: "stable" },
  { slug: "scroll-area", label: "ScrollArea", blurb: "Custom-styled scroll container.", exports: ["ScrollArea"], stability: "stable" },
  { slug: "aspect-ratio", label: "AspectRatio", blurb: "Maintains an aspect ratio for media surfaces.", exports: ["AspectRatio"], stability: "stable" },
  { slug: "breadcrumb", label: "Breadcrumb", blurb: "Hierarchical navigation trail.", exports: ["Breadcrumb", "BreadcrumbList", "BreadcrumbItem", "BreadcrumbLink", "BreadcrumbPage", "BreadcrumbSeparator"], stability: "stable" },
  { slug: "pagination", label: "Pagination", blurb: "Page-by-page navigation for long lists.", exports: ["Pagination", "PaginationContent", "PaginationItem", "PaginationLink", "PaginationNext", "PaginationPrevious", "PaginationEllipsis"], stability: "stable" },
  { slug: "calendar", label: "Calendar", blurb: "Date picker calendar (react-day-picker).", exports: ["Calendar", "CalendarDayButton"], stability: "stable" },
  { slug: "date-picker", label: "DatePicker", blurb: "Date / range picker with input + popover composition.", exports: ["DatePicker"], stability: "stable" },
  { slug: "carousel", label: "Carousel", blurb: "Horizontal carousel via embla.", exports: ["Carousel", "CarouselContent", "CarouselItem", "CarouselPrevious", "CarouselNext"], stability: "stable" },
  { slug: "resizable", label: "Resizable", blurb: "Resizable panels via react-resizable-panels.", exports: ["ResizablePanelGroup", "ResizablePanel", "ResizableHandle"], stability: "stable" },
  { slug: "table", label: "Table", blurb: "Semantic table primitives.", exports: ["Table", "TableHeader", "TableBody", "TableFooter", "TableHead", "TableRow", "TableCell", "TableCaption"], stability: "stable" },
  { slug: "chart", label: "Chart", blurb: "Recharts wrapper primitives.", exports: ["ChartContainer", "ChartTooltip", "ChartTooltipContent", "ChartLegend", "ChartLegendContent"], stability: "stable" },
  { slug: "form-field", label: "FormField", blurb: "react-hook-form binding wrapper.", exports: ["FormField", "FormLabel", "FormError", "FormDescription"], stability: "stable" },
  { slug: "empty-state", label: "EmptyState", blurb: "Variants for first-run / no-results / error with action slot.", exports: ["EmptyState", "NoFeaturesFound", "NoFeedbackFound", "NoSearchResults"], stability: "stable" },
  { slug: "typography", label: "Typography", blurb: "H1 / H2 / H3 / H4 / P / Lead / Large / Small / Muted.", exports: ["H1", "H2", "H3", "H4", "P", "Lead", "Large", "Small", "Muted"], stability: "stable" },
  { slug: "toolbar", label: "Toolbar", blurb: "Grouped controls that behave as one tab stop — roving tabindex, arrow/Home/End.", exports: ["Toolbar", "ToolbarButton", "ToolbarLink", "ToolbarSeparator", "ToolbarToggleGroup", "ToolbarToggleItem"], stability: "beta" },
  { slug: "visually-hidden", label: "VisuallyHidden", blurb: "Screen-reader-only text: clipped from the layout, kept in the a11y tree.", exports: ["VisuallyHidden"], stability: "beta" },
  { slug: "accessible-icon", label: "AccessibleIcon", blurb: "Accessible name for an icon-only control — hides the glyph, exposes the label.", exports: ["AccessibleIcon"], stability: "beta" },
  { slug: "password-toggle-field", label: "PasswordToggleField", blurb: "Password input with a show/hide toggle that keeps caret position and re-masks on submit. Wraps a Radix unstable_* export — API may change.", exports: ["PasswordToggleField", "PasswordToggleFieldInput", "PasswordToggleFieldToggle", "PasswordToggleFieldSlot", "PasswordToggleFieldIcon"], stability: "experimental" },
];

const DOCS = "https://github.com/marktiderman/genesis/blob/main";

export const STANDARDS = [
  {
    title: "The Genesis way",
    summary:
      "Reuse, then extend, then invent, and invent in the app before Genesis. Slots, variants and configuration are config; recreating something that exists is the custom code Genesis removes.",
    href: `${DOCS}/docs/FRAMEWORK.md`,
  },
  {
    title: "One description per resource",
    summary:
      "Describe a resource once with defineView; a list is <ResourceView>, a record page is <RecordView>, and the phone uses the same view. Screens never call the database themselves.",
    href: `${DOCS}/docs/RESOURCE-VIEW.md`,
  },
  {
    title: "What to use for each need",
    summary:
      "The skill coding agents read first: the primitive, import and docs for every need, from a list screen to dates.",
    href: `${DOCS}/packages/ui/SKILL.md`,
  },
  {
    title: "Upgrading",
    summary:
      "Every breaking change has a migration entry and, where it can, a codemod. Apps pull new versions on their own schedule.",
    href: `${DOCS}/docs/MIGRATION.md`,
  },
];

export const LAYOUTS = [
  { slug: "dashboard", label: "DashboardPage", summary: "A title, actions, a row of stat tiles and the page's content." },
  { slug: "settings", label: "SettingsPage", summary: "Settings in sections, with a section menu beside them on wide screens." },
  { slug: "form", label: "FormPage", summary: "One form on its own page: title, description, errors and actions." },
  { slug: "detail", label: "DetailPage", summary: "One record: a title, breadcrumb, actions, the body and a sidebar." },
];
