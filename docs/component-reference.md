# Genesis — Component Reference

> **Auto-generated.** Do not edit by hand. Run `pnpm gen:component-reference` (or `node scripts/gen-component-reference.mjs`) to regenerate.

> **Source:** [`scripts/gen-component-reference.mjs`](../scripts/gen-component-reference.mjs). Reads each Genesis package's `src/index.ts` barrel + adjacent JSDoc / `<Name>Props` types. Lightweight regex parser (PRD-07 D7.2 path 1); a `react-docgen` / `typedoc` upgrade is tracked as a follow-up.

**Totals:** 124 components · 332 other exports · 133 standalone types across 5 packages.

**Cross-link:** [`docs/README.md`](./README.md) — canonical Genesis docs entry point.

**Stability tags** (per the C2.0 convention; populate in JSDoc as `@stability Stable|Beta|Deprecated|Experimental`):

- `Stable` — public API; breaking change requires major (1.x+) or minor (0.x).
- `Beta` — public but volatile; signature may change without a major bump.
- `Experimental` — wraps an upstream `unstable_*` API; props may change in a minor.
- `Deprecated` — slated for removal; consult `MIGRATION.md` for the replacement.
- `—` — untagged (default; treat as Beta until tagged).

---
## @marktiderman/genesis-core

Platform-agnostic providers, hooks, and data layer. Use anywhere — web, native, Node.

**Barrel:** [`packages/core/src/index.ts`](../packages/core/src/index.ts)

### Components (2)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`DataProviderRoot`](../packages/core/src/provider/context.tsx) | `DataProviderRootProps` | — | _(no summary)_ |
| [`GenesisProvider`](../packages/core/src/provider/context.tsx) | `GenesisProviderProps` | — | _(no summary)_ |

### Other exports (13)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`buildArrayItemDefaults`](../packages/core/src/hooks/use-resource-form.ts) | function | — | Build default values for a single array item from its sub-field definitions |
| [`createLocalStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | localStorage adapter with SSR safety. |
| [`createMemoryStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | In-memory adapter for testing and SSR. |
| [`createMockProvider`](../packages/core/src/provider/mock-provider.ts) | function | — | _(no summary)_ |
| [`createNoopStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | No-op adapter — all operations silently do nothing. |
| [`createSupabaseProvider`](../packages/core/src/provider/supabase-provider.ts) | function | — | _(no summary)_ |
| [`titleCase`](../packages/core/src/utils.ts) | function | — | Convert a key string to title case. "created_at" -> "Created At" "firstName" -> "First Name" |
| [`useDataProvider`](../packages/core/src/provider/context.tsx) | function | — | _(no summary)_ |
| [`useOne`](../packages/core/src/hooks/use-one.ts) | function | — | Fetch a single record by id, powered by TanStack Query. |
| [`useResource`](../packages/core/src/hooks/use-resource.ts) | function | — | _(no summary)_ |
| [`useResourceForm`](../packages/core/src/hooks/use-resource-form.ts) | function | — | _(no summary)_ |
| [`useStorage`](../packages/core/src/provider/context.tsx) | function | — | _(no summary)_ |
| [`useWizard`](../packages/core/src/hooks/use-wizard.ts) | function | — | _(no summary)_ |

### Types (36)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ArrayFilter };
export type { BaseRecord };
export type { CreateParams };
export type { CreateResult };
export type { DataProvider };
export type { DeleteParams };
export type { DeleteResult };
export type { FieldType };
export type { FilterParam };
export type { GetManyParams };
export type { GetManyResult };
export type { GetOneParams };
export type { GetOneResult };
export type { Identifier };
export type { ListParams };
export type { ListResult };
export type { MockProviderOptions };
export type { NullFilter };
export type { PaginationParam };
export type { RangeFilter };
export type { ResourceFormFieldDef };
export type { ScalarFilter };
export type { SelectOption };
export type { SortParam };
export type { StorageAdapter };
export type { SupabaseClient };
export type { SupabaseClientInput };
export type { UpdateParams };
export type { UpdateResult };
export type { UseOneOptions };
export type { UseResourceFormOptions };
export type { UseResourceFormReturn };
export type { UseResourceOptions };
export type { UseResourceReturn };
export type { UseWizardReturn };
export type { WizardStep };
```

---

## @marktiderman/genesis-design-system

DTCG design tokens, brand schema, theme generators. Brand-agnostic; consumer brand packages satisfy the canonical schema.

**Barrel:** [`packages/design-system/src/index.ts`](../packages/design-system/src/index.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`GenesisThemeProvider`](../packages/design-system/src/theme/index.ts) | `GenesisThemeProviderProps` | — | _(no summary)_ |

### Other exports (23)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`borderRadius`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`debugBrandPreset`](../packages/design-system/src/factories/from-brand.ts) | function | — | Debug utility — dumps the resolved Tailwind preset and NativeWind theme side-by-side so brand authors can introspect token mis-resolution without reading factory source. |
| [`fontFamily`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`fontSize`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`fontWeight`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`generateDarkTheme`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`generateLightTheme`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`GENESIS_THEME_V2`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`genesisBrand`](../packages/design-system/src/presets/brand-genesis.ts) | const | — | Genesis OOTB brand — the single source of truth for the full brand palette. |
| [`genesisColors`](../packages/design-system/src/presets/brand-genesis.ts) | const | — | _(no summary)_ |
| [`genesisTheme`](../packages/design-system/src/presets/brand-genesis.ts) | const | — | Genesis brand — emerald green. |
| [`isColorScale`](../packages/design-system/src/schema/brand.ts) | function | — | Type guard: returns true when `value` looks like a `ColorScale`. |
| [`neutral`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`readGenesisThemeV2Flag`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`resolveTokens`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`semantic`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`spacing`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`status`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`tailwindFromBrand`](../packages/design-system/src/factories/from-brand.ts) | function | — | Derive a Tailwind v4 preset from a {@link CanonicalBrand} config. |
| [`themeFromBrand`](../packages/design-system/src/factories/from-brand.ts) | function | — | Derive a NativeWind v5 theme from a {@link CanonicalBrand} config. |
| [`themeToCss`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`useTheme`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`validateBrand`](../packages/design-system/src/schema/brand.ts) | function | — | Validate a candidate brand object against the canonical schema. |

### Types (17)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BrandExtensions };
export type { BrandFactoryOptions };
export type { BrandValidationResult };
export type { CanonicalBrand };
export type { ColorScale };
export type { GradientToken };
export type { NativeBrandOutput };
export type { PlatformOverridable };
export type { ResolvedColorScale };
export type { ResolvedThemeMode };
export type { ResolvedTokens };
export type { ShadowToken };
export type { TailwindBrandOutput };
export type { ThemeConfig };
export type { ThemeMode };
export type { TypographyTokens };
export type { UseThemeReturn };
```

---

## @marktiderman/genesis-ui

Shadcn-based web components. Use in Vite / RR7 / Next surfaces.

**Barrel:** [`packages/ui/src/index.ts`](../packages/ui/src/index.ts)

### Components (36)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AccessibleIcon`](../packages/ui/src/components/ui/accessible-icon.tsx) | `AccessibleIconProps` | Beta | AccessibleIcon — gives a decorative icon an accessible name. |
| [`Badge`](../packages/ui/src/components/ui/badge.tsx) | `BadgeProps` | — | _(no summary)_ |
| [`Button`](../packages/ui/src/components/ui/button.tsx) | `ButtonProps` | Stable | Button — primary interactive control. Variants: default, secondary, outline, ghost, destructive, link. |
| [`ButtonGroup`](../packages/ui/src/components/ui/button-group.tsx) | `ButtonGroupProps` | — | _(no summary)_ |
| [`CommandPalette`](../packages/ui/src/components/ui/command-palette.tsx) | `CommandPaletteProps` | — | Thin action registry over `CommandDialog` / cmdk. Consumers register flat commands; optional `group` buckets them. |
| [`Container`](../packages/ui/src/components/layout/container.tsx) | `ContainerProps` | Beta | Container — the page gutter: a centered column with a named maximum width and responsive side padding. |
| [`DashboardPage`](../packages/ui/src/components/layout/dashboard-page.tsx) | `DashboardPageProps` | Beta | DashboardPage — a stat row over a flexible region of charts, tables and sections. |
| [`DatePicker`](../packages/ui/src/components/ui/date-picker.tsx) | `DatePickerProps` | — | _(no summary)_ |
| [`DetailPage`](../packages/ui/src/components/layout/detail-page.tsx) | `DetailPageProps` | Beta | DetailPage — one record's full view: a title row with actions, a primary content region, and a metadata sidebar that drops below the content on small screens. |
| [`EmptyState`](../packages/ui/src/components/patterns/empty-state.tsx) | `EmptyStateProps` | Beta | EmptyState — what to show when a list, page, or panel has no data. |
| [`FormPage`](../packages/ui/src/components/layout/form-page.tsx) | `FormPageProps` | Beta | FormPage — a titled form: header, validation summary, a body of sections, and a sticky action bar. |
| [`Grid`](../packages/ui/src/components/layout/grid.tsx) | `GridProps` | Beta | Grid — two-dimensional flow for card and tile collections. |
| [`InputGroup`](../packages/ui/src/components/ui/input-group.tsx) | `InputGroupProps` | — | _(no summary)_ |
| [`Kbd`](../packages/ui/src/components/ui/kbd.tsx) | `KbdProps` | — | _(no summary)_ |
| [`PageLoading`](../packages/ui/src/components/patterns/page-loading.tsx) | `PageLoadingProps` | Beta | PageLoading — full-page or in-section loading state: a centered `Spinner` with an optional message. The loading-state counterpart to `EmptyState`. Reach for `Skeleton` instead when the placeholder should mimic the shape of the content th... |
| [`PasswordToggleField`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldProps` | Experimental | PasswordToggleField — a password input with a show/hide control that keeps focus and caret position across the toggle. |
| [`PasswordToggleFieldIcon`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldIconProps` | Experimental | PasswordToggleFieldIcon — the SVG-level variant of `PasswordToggleFieldSlot`. |
| [`PasswordToggleFieldInput`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldInputProps` | Experimental | PasswordToggleFieldInput — the field itself. |
| [`PasswordToggleFieldSlot`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldSlotProps` | Experimental | PasswordToggleFieldSlot — renders one of two nodes depending on visibility. |
| [`PasswordToggleFieldToggle`](../packages/ui/src/components/ui/password-toggle-field.tsx) | `PasswordToggleFieldToggleProps` | Experimental | PasswordToggleFieldToggle — the show/hide button. |
| [`Section`](../packages/ui/src/components/layout/section.tsx) | `SectionProps` | Beta | Section — a titled region of a page: heading, optional description, optional trailing actions, and the content itself. |
| [`SettingsPage`](../packages/ui/src/components/layout/settings-page.tsx) | `SettingsPageProps` | Beta | SettingsPage — a sectioned settings surface with a nav rail for jumping between sections. |
| [`SettingsRow`](../packages/ui/src/components/patterns/settings-row.tsx) | `SettingsRowProps` | Beta | SettingsRow — label + description on one side, an arbitrary trailing control (Switch, Select, Button, Badge, ...) on the other. This is the shared layout behind every settings/preferences list row; see `ToggleRow` for the common label+de... |
| [`Spinner`](../packages/ui/src/components/ui/spinner.tsx) | `SpinnerProps` | — | _(no summary)_ |
| [`Split`](../packages/ui/src/components/layout/split.tsx) | `SplitProps` | Beta | Split — the master-detail layout: two panes side by side above a breakpoint, stacked below it. |
| [`Stack`](../packages/ui/src/components/layout/stack.tsx) | `StackProps` | Beta | Stack — one-dimensional flow. The single most-repeated shape in any application: a run of things in a line, evenly spaced. |
| [`StatusBadge`](../packages/ui/src/components/patterns/status-badge.tsx) | `StatusBadgeProps` | Beta | Status-specific badge for progress/health states — the EOS/OKR-style "on track / at risk / off track" goal vocabulary plus common task-lifecycle states ("done", "blocked", "in progress"). |
| [`ToggleRow`](../packages/ui/src/components/patterns/toggle-row.tsx) | `ToggleRowProps` | Beta | ToggleRow — `SettingsRow` pre-wired with a `Switch`: the common label+description+on/off row for settings and preferences UI. |
| [`Toolbar`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarProps` | Beta | Toolbar — a grouped set of controls that behaves as ONE tab stop. |
| [`ToolbarButton`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarButtonProps` | Beta | ToolbarButton — a button that participates in the toolbar's roving tabindex. |
| [`ToolbarLink`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarLinkProps` | Beta | ToolbarLink — an anchor inside the toolbar's roving tabindex. |
| [`ToolbarSeparator`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarSeparatorProps` | Beta | ToolbarSeparator — a decorative divider between toolbar groups. |
| [`ToolbarToggleItem`](../packages/ui/src/components/ui/toolbar.tsx) | `ToolbarToggleItemProps` | Beta | ToolbarToggleItem — one member of a `ToolbarToggleGroup`. |
| [`Tooltip`](../packages/ui/src/components/ui/tooltip.tsx) | `TooltipProps` | Stable | Tooltip — hover/focus hint anchored to its trigger child. |
| [`UserAvatar`](../packages/ui/src/components/patterns/user-avatar.tsx) | `UserAvatarProps` | Beta | UserAvatar — canonical user-identity avatar. Shows the person's photo when `src` is set and loads successfully; otherwise (including a failed image load — Radix's Avatar swaps to the fallback automatically) it falls back to initials comp... |
| [`VisuallyHidden`](../packages/ui/src/components/ui/visually-hidden.tsx) | `VisuallyHiddenProps` | Beta | VisuallyHidden — content removed from the visual layout but kept in the accessibility tree. |

### Other exports (241)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`Accordion`](../packages/ui/src/components/ui/accordion.tsx) | value | — | _(no summary)_ |
| [`AccordionContent`](../packages/ui/src/components/ui/accordion.tsx) | value | — | _(no summary)_ |
| [`AccordionItem`](../packages/ui/src/components/ui/accordion.tsx) | value | — | _(no summary)_ |
| [`AccordionTrigger`](../packages/ui/src/components/ui/accordion.tsx) | value | — | _(no summary)_ |
| [`Alert`](../packages/ui/src/components/ui/alert.tsx) | value | — | _(no summary)_ |
| [`AlertDescription`](../packages/ui/src/components/ui/alert.tsx) | value | — | _(no summary)_ |
| [`AlertDialog`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogAction`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogCancel`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogContent`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogDescription`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogFooter`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogHeader`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogOverlay`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogPortal`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogTitle`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertDialogTrigger`](../packages/ui/src/components/ui/alert-dialog.tsx) | value | — | _(no summary)_ |
| [`AlertTitle`](../packages/ui/src/components/ui/alert.tsx) | value | — | _(no summary)_ |
| [`alertVariants`](../packages/ui/src/components/ui/alert.tsx) | value | — | _(no summary)_ |
| [`AspectRatio`](../packages/ui/src/components/ui/aspect-ratio.tsx) | value | — | _(no summary)_ |
| [`Avatar`](../packages/ui/src/components/ui/avatar.tsx) | value | — | _(no summary)_ |
| [`AvatarFallback`](../packages/ui/src/components/ui/avatar.tsx) | value | — | _(no summary)_ |
| [`AvatarImage`](../packages/ui/src/components/ui/avatar.tsx) | value | — | _(no summary)_ |
| [`Breadcrumb`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbEllipsis`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbItem`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbLink`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbList`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbPage`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`BreadcrumbSeparator`](../packages/ui/src/components/ui/breadcrumb.tsx) | value | — | _(no summary)_ |
| [`Calendar`](../packages/ui/src/components/ui/calendar.tsx) | value | — | _(no summary)_ |
| [`CalendarDayButton`](../packages/ui/src/components/ui/calendar.tsx) | value | — | _(no summary)_ |
| [`Card`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardContent`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardDescription`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardFooter`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardHeader`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`CardTitle`](../packages/ui/src/components/ui/card.tsx) | value | — | _(no summary)_ |
| [`Carousel`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`CarouselContent`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`CarouselItem`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`CarouselNext`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`CarouselPrevious`](../packages/ui/src/components/ui/carousel.tsx) | value | — | _(no summary)_ |
| [`ChartContainer`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartLegend`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartLegendContent`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartStyle`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartTooltip`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`ChartTooltipContent`](../packages/ui/src/components/ui/chart.tsx) | value | — | _(no summary)_ |
| [`Checkbox`](../packages/ui/src/components/ui/checkbox.tsx) | value | — | _(no summary)_ |
| [`cn`](../packages/ui/src/utils.ts) | function | — | _(no summary)_ |
| [`Collapsible`](../packages/ui/src/components/ui/collapsible.tsx) | value | — | _(no summary)_ |
| [`CollapsibleContent`](../packages/ui/src/components/ui/collapsible.tsx) | value | — | _(no summary)_ |
| [`CollapsibleTrigger`](../packages/ui/src/components/ui/collapsible.tsx) | value | — | _(no summary)_ |
| [`Command`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandDialog`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandEmpty`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandGroup`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandInput`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandItem`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandList`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandSeparator`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`CommandShortcut`](../packages/ui/src/components/ui/command.tsx) | value | — | _(no summary)_ |
| [`containerVariants`](../packages/ui/src/components/layout/container.tsx) | value | — | _(no summary)_ |
| [`ContextMenu`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuCheckboxItem`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuContent`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuGroup`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuItem`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuLabel`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuPortal`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuRadioGroup`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuRadioItem`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuSeparator`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuShortcut`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuSub`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuSubContent`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuSubTrigger`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`ContextMenuTrigger`](../packages/ui/src/components/ui/context-menu.tsx) | value | — | _(no summary)_ |
| [`DefaultLink`](../packages/ui/src/navigation.tsx) | const | Beta | Default link — a plain `<a>`. No router required. |
| [`defaultNavigate`](../packages/ui/src/navigation.tsx) | const | Beta | Default navigate — a full-page navigation. No router required. |
| [`Dialog`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogClose`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogContent`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogDescription`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogFooter`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogHeader`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogOverlay`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogPortal`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogTitle`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`DialogTrigger`](../packages/ui/src/components/ui/dialog.tsx) | value | — | _(no summary)_ |
| [`Drawer`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerClose`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerContent`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerDescription`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerFooter`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerHeader`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerOverlay`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerPortal`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerTitle`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DrawerTrigger`](../packages/ui/src/components/ui/drawer.tsx) | value | — | _(no summary)_ |
| [`DropdownMenu`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuCheckboxItem`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuContent`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuGroup`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuItem`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuLabel`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuPortal`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuRadioGroup`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuRadioItem`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuSeparator`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuShortcut`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuSub`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuSubContent`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuSubTrigger`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`DropdownMenuTrigger`](../packages/ui/src/components/ui/dropdown-menu.tsx) | value | — | _(no summary)_ |
| [`FormDescription`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`FormError`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`FormField`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`FormLabel`](../packages/ui/src/components/patterns/form-field.tsx) | value | — | _(no summary)_ |
| [`GAP_CLASSES`](../packages/ui/src/components/layout/spacing.ts) | const | — | `SpaceToken` → Tailwind gap utility. `satisfies` keeps the table exhaustive against the scale, so adding a step to `spaceScale` without a class here is a type error rather than a silently missing gap. |
| [`gridVariants`](../packages/ui/src/components/layout/grid.tsx) | value | — | _(no summary)_ |
| [`H1`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`H2`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`H3`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`H4`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`HoverCard`](../packages/ui/src/components/ui/hover-card.tsx) | value | — | _(no summary)_ |
| [`HoverCardContent`](../packages/ui/src/components/ui/hover-card.tsx) | value | — | _(no summary)_ |
| [`HoverCardTrigger`](../packages/ui/src/components/ui/hover-card.tsx) | value | — | _(no summary)_ |
| [`Input`](../packages/ui/src/components/ui/input.tsx) | value | — | _(no summary)_ |
| [`InputGroupInput`](../packages/ui/src/components/ui/input-group.tsx) | value | — | _(no summary)_ |
| [`InputGroupPrefix`](../packages/ui/src/components/ui/input-group.tsx) | value | — | _(no summary)_ |
| [`InputGroupSuffix`](../packages/ui/src/components/ui/input-group.tsx) | value | — | _(no summary)_ |
| [`InputOTP`](../packages/ui/src/components/ui/input-otp.tsx) | value | — | _(no summary)_ |
| [`InputOTPGroup`](../packages/ui/src/components/ui/input-otp.tsx) | value | — | _(no summary)_ |
| [`InputOTPSeparator`](../packages/ui/src/components/ui/input-otp.tsx) | value | — | _(no summary)_ |
| [`InputOTPSlot`](../packages/ui/src/components/ui/input-otp.tsx) | value | — | _(no summary)_ |
| [`isPathActive`](../packages/ui/src/navigation.tsx) | function | Beta | Default active-path matcher, mirroring React Router's `NavLink` (prefix match, with `/` treated as exact). Consumers can override via an `isActive` prop where components accept one. |
| [`Label`](../packages/ui/src/components/ui/label.tsx) | value | — | _(no summary)_ |
| [`Large`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`Lead`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`Menubar`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarCheckboxItem`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarContent`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarGroup`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarItem`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarLabel`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarMenu`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarPortal`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarRadioGroup`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarRadioItem`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarSeparator`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarShortcut`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarSub`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarSubContent`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarSubTrigger`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`MenubarTrigger`](../packages/ui/src/components/ui/menubar.tsx) | value | — | _(no summary)_ |
| [`Muted`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`NavigationMenu`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuContent`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuIndicator`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuItem`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuLink`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuList`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuTrigger`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`navigationMenuTriggerStyle`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NavigationMenuViewport`](../packages/ui/src/components/ui/navigation-menu.tsx) | value | — | _(no summary)_ |
| [`NoFeaturesFound`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for an empty roadmap / feature list. |
| [`NoFeedbackFound`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for a feedback inbox with nothing in it yet. |
| [`NoSearchResults`](../packages/ui/src/components/patterns/empty-state.tsx) | function | Beta | Preset `EmptyState` for a search or filter that matched nothing. |
| [`P`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`pageLoadingVariants`](../packages/ui/src/components/patterns/page-loading.tsx) | value | — | _(no summary)_ |
| [`Pagination`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationContent`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationEllipsis`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationItem`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationLink`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationNext`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`PaginationPrevious`](../packages/ui/src/components/ui/pagination.tsx) | value | — | _(no summary)_ |
| [`Popover`](../packages/ui/src/components/ui/popover.tsx) | value | — | _(no summary)_ |
| [`PopoverContent`](../packages/ui/src/components/ui/popover.tsx) | value | — | _(no summary)_ |
| [`PopoverTrigger`](../packages/ui/src/components/ui/popover.tsx) | value | — | _(no summary)_ |
| [`Progress`](../packages/ui/src/components/ui/progress.tsx) | value | — | _(no summary)_ |
| [`RadioGroup`](../packages/ui/src/components/ui/radio-group.tsx) | value | — | _(no summary)_ |
| [`RadioGroupItem`](../packages/ui/src/components/ui/radio-group.tsx) | value | — | _(no summary)_ |
| [`ResizableHandle`](../packages/ui/src/components/ui/resizable.tsx) | value | — | _(no summary)_ |
| [`ResizablePanel`](../packages/ui/src/components/ui/resizable.tsx) | value | — | _(no summary)_ |
| [`ResizablePanelGroup`](../packages/ui/src/components/ui/resizable.tsx) | value | — | _(no summary)_ |
| [`ScrollArea`](../packages/ui/src/components/ui/scroll-area.tsx) | value | — | _(no summary)_ |
| [`sectionHeadingVariants`](../packages/ui/src/components/layout/section.tsx) | value | — | _(no summary)_ |
| [`Select`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectContent`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectGroup`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectItem`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectScrollDownButton`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectScrollUpButton`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectTrigger`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`SelectValue`](../packages/ui/src/components/ui/select.tsx) | value | — | _(no summary)_ |
| [`Separator`](../packages/ui/src/components/ui/separator.tsx) | value | — | _(no summary)_ |
| [`Sheet`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetClose`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetContent`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetDescription`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetFooter`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetHeader`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetOverlay`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetPortal`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetTitle`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`SheetTrigger`](../packages/ui/src/components/ui/sheet.tsx) | value | — | _(no summary)_ |
| [`Skeleton`](../packages/ui/src/components/ui/skeleton.tsx) | value | — | _(no summary)_ |
| [`Slider`](../packages/ui/src/components/ui/slider.tsx) | value | — | _(no summary)_ |
| [`Small`](../packages/ui/src/components/ui/typography.tsx) | value | — | _(no summary)_ |
| [`spaceScale`](../packages/ui/src/components/layout/spacing.ts) | const | — | Semantic spacing steps, in pixels, on the 4px design grid. |
| [`splitVariants`](../packages/ui/src/components/layout/split.tsx) | value | — | _(no summary)_ |
| [`stackVariants`](../packages/ui/src/components/layout/stack.tsx) | value | — | _(no summary)_ |
| [`statusBadgeVariants`](../packages/ui/src/components/patterns/status-badge.tsx) | const | — | _(no summary)_ |
| [`Switch`](../packages/ui/src/components/ui/switch.tsx) | value | — | _(no summary)_ |
| [`Table`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableBody`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableCaption`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableCell`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableFooter`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableHead`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableHeader`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`TableRow`](../packages/ui/src/components/ui/table.tsx) | value | — | _(no summary)_ |
| [`Tabs`](../packages/ui/src/components/ui/tabs.tsx) | value | — | _(no summary)_ |
| [`TabsContent`](../packages/ui/src/components/ui/tabs.tsx) | value | — | _(no summary)_ |
| [`TabsList`](../packages/ui/src/components/ui/tabs.tsx) | value | — | _(no summary)_ |
| [`TabsTrigger`](../packages/ui/src/components/ui/tabs.tsx) | value | — | _(no summary)_ |
| [`Textarea`](../packages/ui/src/components/ui/textarea.tsx) | value | — | _(no summary)_ |
| [`toast`](../packages/ui/src/components/ui/sonner.tsx) | value | — | _(no summary)_ |
| [`Toaster`](../packages/ui/src/components/ui/sonner.tsx) | value | — | _(no summary)_ |
| [`Toggle`](../packages/ui/src/components/ui/toggle.tsx) | value | — | _(no summary)_ |
| [`ToggleGroup`](../packages/ui/src/components/ui/toggle-group.tsx) | value | — | _(no summary)_ |
| [`ToggleGroupItem`](../packages/ui/src/components/ui/toggle-group.tsx) | value | — | _(no summary)_ |
| [`toggleVariants`](../packages/ui/src/components/ui/toggle.tsx) | value | — | _(no summary)_ |
| [`ToolbarToggleGroup`](../packages/ui/src/components/ui/toolbar.tsx) | const | Beta | ToolbarToggleGroup — a set of pressed/unpressed controls inside a toolbar (the classic bold / italic / underline cluster). |
| [`toolbarVariants`](../packages/ui/src/components/ui/toolbar.tsx) | const | — | _(no summary)_ |
| [`useBrowserSearchParams`](../packages/ui/src/navigation.tsx) | function | Beta | Browser-native {@link SearchParamsAdapter} built on the History API. Reads the current query string and writes updates via `pushState`/`replaceState`, staying reactive to `popstate` events. No router required. |
| [`useCommandPaletteHotkey`](../packages/ui/src/components/ui/command-palette.tsx) | function | — | Toggle a command palette with Cmd/Ctrl+K. Returns `[open, setOpen]` — pass into `<CommandPalette open onOpenChange />`. |
| [`userAvatarVariants`](../packages/ui/src/components/patterns/user-avatar.tsx) | value | — | _(no summary)_ |

### Types (13)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ButtonAsChildProps };
export type { CarouselApi };
export type { ChartConfig };
export type { CommandPaletteItem };
export type { GenesisLinkProps };
export type { LinkComponent };
export type { NavigateFn };
export type { SearchParamsAdapter };
export type { SettingsPageSection };
export type { SpaceToken };
export type { SplitBreakpoint };
export type { SplitRatio };
export type { StatusBadgeStatus };
```

---

## @marktiderman/genesis-ui-native

React Native components (NativeWind v4-5). Use in Expo / RN surfaces.

**Barrel:** [`packages/ui-native/src/index.ts`](../packages/ui-native/src/index.ts)

### Components (85)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AuthBranding`](../packages/ui-native/src/layouts/auth.tsx) | `AuthBrandingProps` | — | _(no summary)_ |
| [`AuthForm`](../packages/ui-native/src/layouts/auth.tsx) | `AuthFormProps` | — | _(no summary)_ |
| [`Box`](../packages/ui-native/src/components/layout/index.ts) | `BoxProps` | — | _(no summary)_ |
| [`BrandExtensionsProvider`](../packages/ui-native/src/hooks/use-genesis-extension.ts) | `BrandExtensionsProviderProps` | — | _(no summary)_ |
| [`Grid`](../packages/ui-native/src/components/layout/index.ts) | `GridProps` | — | _(no summary)_ |
| [`Inline`](../packages/ui-native/src/components/layout/index.ts) | `InlineProps` | — | _(no summary)_ |
| [`NativeAccordion`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionProps` | — | _(no summary)_ |
| [`NativeAccordionContent`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionContentProps` | — | _(no summary)_ |
| [`NativeAccordionItem`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionItemProps` | — | _(no summary)_ |
| [`NativeAccordionTrigger`](../packages/ui-native/src/components/accordion.tsx) | `NativeAccordionTriggerProps` | — | _(no summary)_ |
| [`NativeAlert`](../packages/ui-native/src/components/alert.tsx) | `NativeAlertProps` | — | _(no summary)_ |
| [`NativeAlertDescription`](../packages/ui-native/src/components/alert.tsx) | `NativeAlertDescriptionProps` | — | _(no summary)_ |
| [`NativeAlertTitle`](../packages/ui-native/src/components/alert.tsx) | `NativeAlertTitleProps` | — | _(no summary)_ |
| [`NativeAvatar`](../packages/ui-native/src/components/avatar.tsx) | `NativeAvatarProps` | — | _(no summary)_ |
| [`NativeBadge`](../packages/ui-native/src/components/badge.tsx) | `NativeBadgeProps` | — | _(no summary)_ |
| [`NativeBanner`](../packages/ui-native/src/components/inline-alert.tsx) | `NativeBannerProps` | — | _(no summary)_ |
| [`NativeButton`](../packages/ui-native/src/components/button.tsx) | `NativeButtonProps` | — | _(no summary)_ |
| [`NativeCard`](../packages/ui-native/src/components/card.tsx) | `NativeCardProps` | — | _(no summary)_ |
| [`NativeCardTitle`](../packages/ui-native/src/components/card.tsx) | `NativeCardTitleProps` | — | _(no summary)_ |
| [`NativeCheckbox`](../packages/ui-native/src/components/checkbox.tsx) | `NativeCheckboxProps` | — | _(no summary)_ |
| [`NativeChip`](../packages/ui-native/src/components/chip-group.tsx) | `NativeChipProps` | — | _(no summary)_ |
| [`NativeChipGroup`](../packages/ui-native/src/components/chip-group.tsx) | `NativeChipGroupProps` | — | _(no summary)_ |
| [`NativeCombobox`](../packages/ui-native/src/components/combobox.tsx) | `NativeComboboxProps` | — | _(no summary)_ |
| [`NativeDatePicker`](../packages/ui-native/src/components/date-time-picker.tsx) | `NativeDatePickerProps` | — | _(no summary)_ |
| [`NativeDialog`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogProps` | — | _(no summary)_ |
| [`NativeDialogContent`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogContentProps` | — | _(no summary)_ |
| [`NativeDialogDescription`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogDescriptionProps` | — | _(no summary)_ |
| [`NativeDialogFooter`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogFooterProps` | — | _(no summary)_ |
| [`NativeDialogHeader`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogHeaderProps` | — | _(no summary)_ |
| [`NativeDialogTitle`](../packages/ui-native/src/components/dialog.tsx) | `NativeDialogTitleProps` | — | _(no summary)_ |
| [`NativeDrawer`](../packages/ui-native/src/components/drawer.tsx) | `NativeDrawerProps` | — | _(no summary)_ |
| [`NativeDropdownMenu`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuProps` | — | _(no summary)_ |
| [`NativeDropdownMenuContent`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuContentProps` | — | _(no summary)_ |
| [`NativeDropdownMenuItem`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuItemProps` | — | _(no summary)_ |
| [`NativeDropdownMenuTrigger`](../packages/ui-native/src/components/dropdown-menu.tsx) | `NativeDropdownMenuTriggerProps` | — | _(no summary)_ |
| [`NativeEmptyState`](../packages/ui-native/src/components/empty-state.tsx) | `NativeEmptyStateProps` | — | _(no summary)_ |
| [`NativeHeaderCard`](../packages/ui-native/src/components/header-card.tsx) | `NativeHeaderCardProps` | — | _(no summary)_ |
| [`NativeInlineAlert`](../packages/ui-native/src/components/inline-alert.tsx) | `NativeInlineAlertProps` | — | _(no summary)_ |
| [`NativeInput`](../packages/ui-native/src/components/input.tsx) | `NativeInputProps` | — | _(no summary)_ |
| [`NativeLabel`](../packages/ui-native/src/components/label.tsx) | `NativeLabelProps` | — | _(no summary)_ |
| [`NativeListItem`](../packages/ui-native/src/components/list-item.tsx) | `NativeListItemProps` | — | _(no summary)_ |
| [`NativeNumberInput`](../packages/ui-native/src/components/number-input.tsx) | `NativeNumberInputProps` | — | _(no summary)_ |
| [`NativePagination`](../packages/ui-native/src/components/pagination.tsx) | `NativePaginationProps` | — | _(no summary)_ |
| [`NativePopover`](../packages/ui-native/src/components/popover.tsx) | `NativePopoverProps` | — | _(no summary)_ |
| [`NativePopoverContent`](../packages/ui-native/src/components/popover.tsx) | `NativePopoverContentProps` | — | _(no summary)_ |
| [`NativePopoverTrigger`](../packages/ui-native/src/components/popover.tsx) | `NativePopoverTriggerProps` | — | _(no summary)_ |
| [`NativeProgress`](../packages/ui-native/src/components/progress.tsx) | `NativeProgressProps` | — | _(no summary)_ |
| [`NativeRadioGroup`](../packages/ui-native/src/components/radio-group.tsx) | `NativeRadioGroupProps` | — | _(no summary)_ |
| [`NativeRadioGroupItem`](../packages/ui-native/src/components/radio-group.tsx) | `NativeRadioGroupItemProps` | — | _(no summary)_ |
| [`NativeRangeSlider`](../packages/ui-native/src/components/slider.tsx) | `NativeRangeSliderProps` | — | _(no summary)_ |
| [`NativeRefreshControl`](../packages/ui-native/src/components/refresh-control.tsx) | `NativeRefreshControlProps` | — | _(no summary)_ |
| [`NativeSearchBar`](../packages/ui-native/src/components/search-bar.tsx) | `NativeSearchBarProps` | — | _(no summary)_ |
| [`NativeSectionListHeader`](../packages/ui-native/src/components/section-list.tsx) | `NativeSectionListHeaderProps` | — | _(no summary)_ |
| [`NativeSegmentedControl`](../packages/ui-native/src/components/segmented-control.tsx) | `NativeSegmentedControlProps` | — | _(no summary)_ |
| [`NativeSelect`](../packages/ui-native/src/components/select.tsx) | `NativeSelectProps` | — | _(no summary)_ |
| [`NativeSelectContent`](../packages/ui-native/src/components/select.tsx) | `NativeSelectContentProps` | — | _(no summary)_ |
| [`NativeSelectItem`](../packages/ui-native/src/components/select.tsx) | `NativeSelectItemProps` | — | _(no summary)_ |
| [`NativeSelectTrigger`](../packages/ui-native/src/components/select.tsx) | `NativeSelectTriggerProps` | — | _(no summary)_ |
| [`NativeSeparator`](../packages/ui-native/src/components/separator.tsx) | `NativeSeparatorProps` | — | _(no summary)_ |
| [`NativeSheet`](../packages/ui-native/src/components/sheet.tsx) | `NativeSheetProps` | — | _(no summary)_ |
| [`NativeSkeleton`](../packages/ui-native/src/components/skeleton.tsx) | `NativeSkeletonProps` | — | _(no summary)_ |
| [`NativeSlider`](../packages/ui-native/src/components/slider.tsx) | `NativeSliderProps` | — | _(no summary)_ |
| [`NativeStepper`](../packages/ui-native/src/components/stepper.tsx) | `NativeStepperProps` | — | _(no summary)_ |
| [`NativeSwitch`](../packages/ui-native/src/components/switch.tsx) | `NativeSwitchProps` | — | _(no summary)_ |
| [`NativeTabs`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsProps` | — | _(no summary)_ |
| [`NativeTabsContent`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsContentProps` | — | _(no summary)_ |
| [`NativeTabsList`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsListProps` | — | _(no summary)_ |
| [`NativeTabsTrigger`](../packages/ui-native/src/components/tabs.tsx) | `NativeTabsTriggerProps` | — | _(no summary)_ |
| [`NativeText`](../packages/ui-native/src/components/text.tsx) | `NativeTextProps` | — | _(no summary)_ |
| [`NativeTextarea`](../packages/ui-native/src/components/textarea.tsx) | `NativeTextareaProps` | — | _(no summary)_ |
| [`NativeTimePicker`](../packages/ui-native/src/components/date-time-picker.tsx) | `NativeTimePickerProps` | — | _(no summary)_ |
| [`NativeToastProvider`](../packages/ui-native/src/components/toast.tsx) | `NativeToastProviderProps` | — | _(no summary)_ |
| [`NativeToggle`](../packages/ui-native/src/components/toggle.tsx) | `NativeToggleProps` | — | _(no summary)_ |
| [`NativeTooltip`](../packages/ui-native/src/components/tooltip.tsx) | `NativeTooltipProps` | — | _(no summary)_ |
| [`NativeTooltipContent`](../packages/ui-native/src/components/tooltip.tsx) | `NativeTooltipContentProps` | — | _(no summary)_ |
| [`NativeTooltipTrigger`](../packages/ui-native/src/components/tooltip.tsx) | `NativeTooltipTriggerProps` | — | _(no summary)_ |
| [`NavBarSaveButton`](../packages/ui-native/src/layouts/nav-bar.tsx) | `NavBarSaveButtonProps` | — | _(no summary)_ |
| [`NavBarSearchBar`](../packages/ui-native/src/layouts/nav-bar.tsx) | `NavBarSearchBarProps` | — | Inline search input meant to occupy the title slot on a search results screen. For a sticky search-below-the-header pattern, prefer the standalone <NativeSearchBar> primitive. |
| [`NavBarTitle`](../packages/ui-native/src/layouts/nav-bar.tsx) | `NavBarTitleProps` | — | _(no summary)_ |
| [`NotificationsPage`](../packages/ui-native/src/layouts/notifications-page.tsx) | `NotificationsPageProps` | — | _(no summary)_ |
| [`ScreenContainer`](../packages/ui-native/src/layouts/screen-container.tsx) | `ScreenContainerProps` | — | _(no summary)_ |
| [`SettingsPage`](../packages/ui-native/src/layouts/settings-page.tsx) | `SettingsPageProps` | — | _(no summary)_ |
| [`SettingsSubPage`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | `SettingsSubPageProps` | — | _(no summary)_ |
| [`SocialAuthRow`](../packages/ui-native/src/layouts/auth.tsx) | `SocialAuthRowProps` | — | _(no summary)_ |
| [`Stack`](../packages/ui-native/src/components/layout/index.ts) | `StackProps` | — | _(no summary)_ |

### Other exports (25)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`alertVariants`](../packages/ui-native/src/components/alert.tsx) | value | — | _(no summary)_ |
| [`badgeTextVariants`](../packages/ui-native/src/components/badge.tsx) | value | — | _(no summary)_ |
| [`badgeVariants`](../packages/ui-native/src/components/badge.tsx) | value | — | _(no summary)_ |
| [`buttonTextVariants`](../packages/ui-native/src/components/button.tsx) | value | — | _(no summary)_ |
| [`buttonVariants`](../packages/ui-native/src/components/button.tsx) | value | — | _(no summary)_ |
| [`cn`](../packages/ui-native/src/utils.ts) | function | — | _(no summary)_ |
| [`composeHeaderOptions`](../packages/ui-native/src/layouts/screen-container.tsx) | function | — | Compose a `<Stack.Screen options={...}>` object from Layer-3 named props + a direct `headerOptions` passthrough. Layouts call this and pass the result to `<Stack.Screen>` so the host's expo-router stack renders a platform-native large ti... |
| [`confirmDiscardChanges`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | function | — | Default leave-guard helper. Pops a native Alert with Discard / Keep Editing buttons; calls `proceed()` only if the user opts to discard. |
| [`ForgotPasswordLink`](../packages/ui-native/src/layouts/auth.tsx) | function | — | _(no summary)_ |
| [`getNotificationsPageStackOptions`](../packages/ui-native/src/layouts/notifications-page.tsx) | function | — | Compose `<Stack.Screen options={...}>` for a NotificationsPage. Wires a "Mark all read" action via `headerRight` when `onMarkAllRead` is passed. |
| [`getSettingsPageStackOptions`](../packages/ui-native/src/layouts/settings-page.tsx) | function | — | Convenience helper for callers that want to wire `<Stack.Screen options={...}>` without re-importing composeHeaderOptions. Defaults `large: true` and `scrollEdgeBehavior: "match"` to match the Apple HIG large-title settings pattern out o... |
| [`getSettingsSubPageStackOptions`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | function | — | Compose `<Stack.Screen options={...}>` for a SettingsSubPage. Wires the nav-bar Save button via `headerRight` automatically when `onSave` is passed. |
| [`NativeCardContent`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardDescription`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardFooter`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardHeader`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeListItemDivider`](../packages/ui-native/src/components/list-item.tsx) | function | — | _(no summary)_ |
| [`spaceScale`](../packages/ui-native/src/components/layout/index.ts) | value | — | _(no summary)_ |
| [`spacingClass`](../packages/ui-native/src/components/layout/index.ts) | value | — | _(no summary)_ |
| [`textVariants`](../packages/ui-native/src/components/text.tsx) | value | — | _(no summary)_ |
| [`toggleVariants`](../packages/ui-native/src/components/toggle.tsx) | value | — | _(no summary)_ |
| [`useGenesisExtension`](../packages/ui-native/src/hooks/use-genesis-extension.ts) | function | — | Read an extension scale by key. Returns `undefined` when the provider isn't mounted OR when the key isn't declared on the brand. The return type follows the consumer's augmented `BrandExtensions[K]`. |
| [`useReducedMotion`](../packages/ui-native/src/hooks/use-reduced-motion.ts) | function | — | _(no summary)_ |
| [`useThemeMode`](../packages/ui-native/src/hooks/use-theme-mode.ts) | function | — | _(no summary)_ |
| [`useToast`](../packages/ui-native/src/components/toast.tsx) | function | — | _(no summary)_ |

### Types (25)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AuthFormValues };
export type { BoxBackground };
export type { BrandExtensionsValue };
export type { FlexAlign };
export type { FlexJustify };
export type { NativeAccordionType };
export type { NativeChipGroupMode };
export type { NativeComboboxOption };
export type { NativeEmptyStateVariant };
export type { NativeInlineAlertVariant };
export type { NativeSegmentedControlOption };
export type { NativeStepperStep };
export type { NativeToastOptions };
export type { NativeToastVariant };
export type { NotificationItem };
export type { SafeAreaEdge };
export type { ScreenHeaderProps };
export type { ScrollEdgeBehavior };
export type { SettingsPageRow };
export type { SettingsPageSection };
export type { SocialAuthProvider };
export type { SpaceToken };
export type { SpacingPrefix };
export type { TextPreset };
export type { ThemeMode };
```

---

## @marktiderman/genesis-switchboard

Pluggable data layer — a resource's backing (L1 Code / L2 Airtable·Notion / L3 Supabase × tiers A/B/C) is config, not a rewrite. Read one canonical shape via data.resource('x'). See packages/data-switchboard/README.md + SWITCHBOARD.md.

**Barrel:** [`packages/data-switchboard/src/index.ts`](../packages/data-switchboard/src/index.ts)

### Other exports (30)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`AIRTABLE_BASE_ID`](../packages/data-switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`AirtableAdapter`](../packages/data-switchboard/src/adapters/airtable.ts) | class | — | _(no summary)_ |
| [`asWritable`](../packages/data-switchboard/src/adapters/adapter.ts) | function | — | Narrow an adapter to its writable surface (or throw a typed error). |
| [`CodeAdapter`](../packages/data-switchboard/src/adapters/code.ts) | class | — | _(no summary)_ |
| [`driftReport`](../packages/data-switchboard/src/reconcile.ts) | value | — | _(no summary)_ |
| [`featuresAirtableMap`](../packages/data-switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`featuresContract`](../packages/data-switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`featuresSupabaseMap`](../packages/data-switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`gitdataMdContract`](../packages/data-switchboard/src/gitdata-names.ts) | function | — | Default markdown contract: identity + common columns; extras still round-trip. |
| [`gitdataResourceName`](../packages/data-switchboard/src/gitdata-names.ts) | function | — | Stable resource name for a gitdata table — minimum wiring for new tables. |
| [`inferFieldType`](../packages/data-switchboard/src/introspect.ts) | function | — | Infer the canonical FieldType (+ array-ness) of a single value. |
| [`introspectFields`](../packages/data-switchboard/src/introspect.ts) | function | — | Derive a resource's live field schema from its actual DATA. Fields = the union of keys across `rows`; types are inferred from values; `optional`/`array` come from the data. The optional `contract` ENRICHES (description + a more-specific ... |
| [`isMergeBinding`](../packages/data-switchboard/src/types.ts) | function | — | Narrow a binding to the Tier-B MERGE (multi-source) variant. |
| [`LEVEL_LABEL`](../packages/data-switchboard/src/types.ts) | const | — | Human-facing label for a Level (docs / drift reports). |
| [`LEVELS`](../packages/data-switchboard/src/types.ts) | const | — | _(no summary)_ |
| [`markStale`](../packages/data-switchboard/src/staleness.ts) | function | — | Stamp a row array as a degraded (stale) read. Returns the SAME array for chaining. The marker is non-enumerable so it never serializes into data. |
| [`NotionAdapter`](../packages/data-switchboard/src/adapters/notion.ts) | class | — | _(no summary)_ |
| [`promote`](../packages/data-switchboard/src/reconcile.ts) | function | — | Generate a reviewable Supabase migration that promotes a proven L2 shape to L3. Emits: CREATE TABLE (from the contract field schema) + a user_id column + RLS (user_id = auth.uid()) + updated_at trigger + optional backfill. Returns SQL TE... |
| [`propagateStale`](../packages/data-switchboard/src/staleness.ts) | function | — | Copy a staleness marker from `source` onto `target` (used after a defensive `{ ...row }` clone drops the array-level symbol). No-op when `source` is fresh. Returns `target` for chaining. |
| [`PROVIDER_LEVEL`](../packages/data-switchboard/src/types.ts) | const | — | _(no summary)_ |
| [`ReadOnlyAdapterError`](../packages/data-switchboard/src/adapters/adapter.ts) | class | — | Thrown by a read-only adapter when a write op is attempted. |
| [`reconcileModel`](../packages/data-switchboard/src/reconcile.ts) | value | — | _(no summary)_ |
| [`Registry`](../packages/data-switchboard/src/registry.ts) | class | — | _(no summary)_ |
| [`staleInfo`](../packages/data-switchboard/src/staleness.ts) | function | — | Read the staleness marker off a row array (or any value), if present. |
| [`SupabaseAdapter`](../packages/data-switchboard/src/adapters/supabase.ts) | class | — | _(no summary)_ |
| [`Switchboard`](../packages/data-switchboard/src/resolver.ts) | class | — | _(no summary)_ |
| [`ticketsAirtableMap`](../packages/data-switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`ticketsContract`](../packages/data-switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`ticketsSupabaseMap`](../packages/data-switchboard/src/resources.ts) | const | — | _(no summary)_ |
| [`UnknownResourceError`](../packages/data-switchboard/src/adapters/adapter.ts) | class | — | Thrown when an adapter is asked for a resource it has no mapping for. |

### Types (42)

Type-only exports not consumed as a component's `Props`.

```ts
export type { Adapter };
export type { AirtableAdapterConfig };
export type { AirtableResourceMap };
export type { Binding };
export type { CodeAdapterOptions };
export type { DataRow };
export type { DescribeResult };
export type { DriftReport };
export type { EnvironmentBinding };
export type { FeatureRow };
export type { FetchLike };
export type { FieldBinding };
export type { FieldDrift };
export type { FieldSchema };
export type { FieldType };
export type { Level };
export type { MergeBinding };
export type { ModelReconcileReport };
export type { ModelReconcileSummary };
export type { NotionAdapterConfig };
export type { NotionPropertyMap };
export type { NotionPropertyType };
export type { NotionResourceMap };
export type { PromoteOptions };
export type { PromoteResult };
export type { ProviderKind };
export type { QueryOptions };
export type { ReconcileModelOptions };
export type { ResolvedPlan };
export type { ResourceBinding };
export type { ResourceClient };
export type { ResourceContract };
export type { ResourceReconcile };
export type { RowDrift };
export type { StaleReadInfo };
export type { SupabaseAdapterConfig };
export type { SupabaseClientLike };
export type { SupabaseQueryBuilder };
export type { SupabaseResourceMap };
export type { TicketRow };
export type { Tier };
export type { ValueDrift };
```

