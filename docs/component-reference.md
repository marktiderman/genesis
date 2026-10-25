# Genesis — Component Reference

> **Auto-generated.** Do not edit by hand. Run `pnpm gen:component-reference` (or `node scripts/gen-component-reference.mjs`) to regenerate.

> **Source:** [`scripts/gen-component-reference.mjs`](../scripts/gen-component-reference.mjs). Reads each Genesis package's `src/index.ts` barrel + adjacent JSDoc / `<Name>Props` types. Lightweight regex parser (PRD-07 D7.2 path 1); a `react-docgen` / `typedoc` upgrade is tracked as a follow-up.

**Totals:** 142 components · 486 other exports · 360 standalone types across 11 packages and entry points.

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
| [`GenesisProvider`](../packages/core/src/provider/context.tsx) | `GenesisProviderProps` | — | Convenience root: a `QueryClientProvider`, storage, and a data provider (yours, or a mock built from datasets). It creates its own `QueryClient` unless you pass `queryClient`; an app that already has one should pass it, or mount `DataPro... |

### Other exports (32)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`buildArrayItemDefaults`](../packages/core/src/hooks/use-resource-form.ts) | function | — | Build default values for a single array item from its sub-field definitions |
| [`createLocalStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | localStorage adapter with SSR safety. |
| [`createMemoryStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | In-memory adapter for testing and SSR. |
| [`createMockProvider`](../packages/core/src/provider/mock-provider.ts) | function | — | _(no summary)_ |
| [`createNoopStorageAdapter`](../packages/core/src/storage/adapters.ts) | function | — | No-op adapter — all operations silently do nothing. |
| [`createSupabaseProvider`](../packages/core/src/provider/supabase-provider.ts) | function | — | The Supabase data provider. Reads and writes go through the client you pass, under that client's session and RLS. |
| [`DataReadError`](../packages/core/src/schema/read-outcome.ts) | class | — | Thrown by a provider when a read failed. Its `message` is safe to show. |
| [`DataWriteError`](../packages/core/src/schema/write-outcome.ts) | class | — | Thrown by a provider when a write did not commit. |
| [`decodeRecordKey`](../packages/core/src/schema/keys.ts) | function | — | The inverse of {@link encodeRecordKey}: field name → value. |
| [`DEFAULT_LIVE_DEBOUNCE_MS`](../packages/core/src/hooks/use-live.ts) | const | — | How long a burst of change events is gathered into one refetch. |
| [`DEFAULT_UNDO_DELAY_MS`](../packages/core/src/hooks/mutation-mode.ts) | const | — | How long an `undoable` write waits for an undo before it is sent. |
| [`DEFAULT_UNSAVED_CHANGES_MESSAGE`](../packages/core/src/hooks/use-unsaved-changes-guard.ts) | const | — | _(no summary)_ |
| [`encodeRecordKey`](../packages/core/src/schema/keys.ts) | function | — | One `Identifier` for a row. |
| [`fieldErrorsFromPostgrest`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Reads which columns a Postgres constraint error is about, from PostgREST's `message` / `details`, and gives safe messages for them. Only plain column names are taken from the store's text; the values it echoes are never used. A unique vi... |
| [`isDataReadError`](../packages/core/src/schema/read-outcome.ts) | function | — | `instanceof` fails when two copies of this package are installed, so check the shape instead. |
| [`isDataWriteError`](../packages/core/src/schema/write-outcome.ts) | function | — | `instanceof` fails when two copies of this package are installed, so check the shape instead. |
| [`keyFields`](../packages/core/src/schema/keys.ts) | function | — | The key of a contract as a list, whichever form `key` was declared in. |
| [`pendingWriteCount`](../packages/core/src/hooks/mutation-mode.ts) | function | — | Optimistic or undoable writes on `resource` not yet settled. |
| [`readFailureMessage`](../packages/core/src/schema/read-outcome.ts) | function | — | The plain sentence for a failed read of `noun` records (one, or a list). |
| [`readOutcomeFromCode`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Maps a store error code to the read outcome it means: the write mapping, with `22***` and PostgREST request errors (`PGRST1**` other than PGRST116, `42703` unknown column, `42P01` unknown table) read as `invalid`. |
| [`titleCase`](../packages/core/src/utils.ts) | function | — | Convert a key string to title case. "created_at" -> "Created At" "firstName" -> "First Name" |
| [`toDataWriteError`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Turns anything a write threw, or the `{ message, code }` error a Supabase client returned, into a `DataWriteError`. A `DataWriteError` passes through unchanged; anything else keeps its message and `code`, and is kept as the `cause`. |
| [`useCapabilities`](../packages/core/src/hooks/use-capabilities.ts) | function | — | What the data provider can do for `resource` (`provider.capabilities`), cached per provider and resource. `data` stays undefined for a provider that doesn't report capabilities, so a UI keeps its defaults. |
| [`useDataProvider`](../packages/core/src/provider/context.tsx) | function | — | _(no summary)_ |
| [`useInfiniteResource`](../packages/core/src/hooks/use-infinite-resource.ts) | function | — | _(no summary)_ |
| [`useOne`](../packages/core/src/hooks/use-one.ts) | function | — | Fetch a single record by id, powered by TanStack Query. |
| [`useResource`](../packages/core/src/hooks/use-resource.ts) | function | — | _(no summary)_ |
| [`useResourceForm`](../packages/core/src/hooks/use-resource-form.ts) | function | — | _(no summary)_ |
| [`useStorage`](../packages/core/src/provider/context.tsx) | function | — | _(no summary)_ |
| [`useUnsavedChangesGuard`](../packages/core/src/hooks/use-unsaved-changes-guard.ts) | function | — | Warns before unsaved changes are lost, without depending on a router. |
| [`useWizard`](../packages/core/src/hooks/use-wizard.ts) | function | — | _(no summary)_ |
| [`writeOutcomeFromCode`](../packages/core/src/provider/postgrest-errors.ts) | function | — | Maps a Postgres SQLSTATE or PostgREST error code to the write outcome it means. Anything not listed is `error`: a code is only read as a refusal or a bad value when it says so. |

### Types (81)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ArrayFilter };
export type { AuditEntry };
export type { BaseRecord };
export type { BulkChange };
export type { BulkResult };
export type { CreateParams };
export type { CreateResult };
export type { DataProvider };
export type { DataReadErrorOptions };
export type { DataRow };
export type { DataWriteErrorOptions };
export type { DeleteParams };
export type { DeleteResult };
export type { FieldPermissions };
export type { FieldReference };
export type { FieldSchema };
export type { FieldType };
export type { FilterOperator };
export type { FilterParam };
export type { GetManyParams };
export type { GetManyResult };
export type { GetOneParams };
export type { GetOneResult };
export type { HistoryParams };
export type { Identifier };
export type { ImportParams };
export type { InfinitePageParam };
export type { InvalidationKey };
export type { ListParams };
export type { ListResult };
export type { LiveOptions };
export type { MockProviderOptions };
export type { MutationMode };
export type { MutationModeOptions };
export type { NullFilter };
export type { PaginationParam };
export type { PostgrestFieldErrors };
export type { ProviderCapabilities };
export type { RangeFilter };
export type { ReadOutcome };
export type { RecordComment };
export type { ResourceAccess };
export type { ResourceChangeEvent };
export type { ResourceContract };
export type { ResourceFormFieldDef };
export type { ResourceRelation };
export type { ResourceSchema };
export type { ResourceSummary };
export type { RowAction };
export type { RowFailure };
export type { ScalarFilter };
export type { SelectOption };
export type { SortParam };
export type { StorageAdapter };
export type { StorageType };
export type { SubscribeParams };
export type { SupabaseClient };
export type { SupabaseClientInput };
export type { SupabaseProviderOptions };
export type { SupabaseRealtimeChannel };
export type { SupabaseRealtimePayload };
export type { SupabaseResourceConfig };
export type { SupabaseWriteContext };
export type { UndoableWrite };
export type { UpdateParams };
export type { UpdateResult };
export type { UseInfiniteResourceOptions };
export type { UseInfiniteResourceReturn };
export type { UseOneOptions };
export type { UseResourceFormOptions };
export type { UseResourceFormReturn };
export type { UseResourceOptions };
export type { UseResourceReturn };
export type { UseUnsavedChangesGuardOptions };
export type { UseUnsavedChangesGuardReturn };
export type { UseWizardReturn };
export type { VersionField };
export type { WidgetHint };
export type { WizardStep };
export type { WriteEvent };
export type { WriteOutcome };
```

---

## @marktiderman/genesis-design-system

DTCG design tokens, brand schema, theme generators. Brand-agnostic; consumer brand packages satisfy the canonical schema.

**Barrel:** [`packages/design-system/src/index.ts`](../packages/design-system/src/index.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`GenesisThemeProvider`](../packages/design-system/src/theme/index.ts) | `GenesisThemeProviderProps` | — | _(no summary)_ |

### Other exports (25)

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
| [`genesisTheme`](../packages/design-system/src/presets/brand-genesis.ts) | const | — | Genesis brand — indigo (distinct from the emerald `success`). |
| [`isColorScale`](../packages/design-system/src/schema/brand.ts) | function | — | Type guard: returns true when `value` looks like a `ColorScale`. |
| [`neutral`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`readGenesisThemeV2Flag`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`resolveThemeRoles`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`resolveTokens`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`semantic`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`spacing`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`status`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`tailwindFromBrand`](../packages/design-system/src/factories/from-brand.ts) | function | — | Derive a Tailwind v4 preset from a {@link CanonicalBrand} config. |
| [`THEME_ROLES`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`themeFromBrand`](../packages/design-system/src/factories/from-brand.ts) | function | — | Derive a NativeWind v5 theme from a {@link CanonicalBrand} config. |
| [`themeToCss`](../packages/design-system/src/tokens/index.ts) | value | — | _(no summary)_ |
| [`useTheme`](../packages/design-system/src/theme/index.ts) | value | — | _(no summary)_ |
| [`validateBrand`](../packages/design-system/src/schema/brand.ts) | function | — | Validate a candidate brand object against the canonical schema. |

### Types (19)

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
export type { ResolveThemeRolesOptions };
export type { ResolvedColorScale };
export type { ResolvedThemeMode };
export type { ResolvedTokens };
export type { ShadowToken };
export type { TailwindBrandOutput };
export type { ThemeConfig };
export type { ThemeMode };
export type { ThemeRole };
export type { TypographyTokens };
export type { UseThemeReturn };
```

---

## @marktiderman/genesis-ui

Shadcn-based web components. Use in Vite / RR7 / Next surfaces.

**Barrel:** [`packages/ui/src/index.ts`](../packages/ui/src/index.ts)

### Components (37)

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
| [`SortableList`](../packages/ui/src/components/patterns/sortable-list.tsx) | `SortableListProps` | Beta | A vertical list the user can rearrange: course steps, lesson blocks, form fields. |
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

### Other exports (242)

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
| [`isPathActive`](../packages/ui/src/navigation.tsx) | value | — | _(no summary)_ |
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
| [`resolveNavigation`](../packages/ui/src/navigation.tsx) | value | — | _(no summary)_ |
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

### Types (18)

Type-only exports not consumed as a component's `Props`.

```ts
export type { ButtonAsChildProps };
export type { CarouselApi };
export type { ChartConfig };
export type { CommandPaletteItem };
export type { GenesisLinkProps };
export type { IsPathActiveOptions };
export type { LinkComponent };
export type { NavigateFn };
export type { NavigationNode };
export type { ResolvedNavigation };
export type { SearchParamsAdapter };
export type { SettingsPageSection };
export type { SortableListItemContext };
export type { SortableListReorder };
export type { SpaceToken };
export type { SplitBreakpoint };
export type { SplitRatio };
export type { StatusBadgeStatus };
```

---

## @marktiderman/genesis-ui/router/react-router

React Router adapters for genesis-ui's navigation contract: a `LinkComponent`, a `NavigateFn`, a `SearchParamsAdapter` and the full-location `activePath`. `react-router` is an optional peer, loaded only by this subpath.

**Barrel:** [`packages/ui/src/router/react-router.tsx`](../packages/ui/src/router/react-router.tsx)

### Other exports (4)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`ReactRouterLink`](../packages/ui/src/router/react-router.tsx) | const | Beta | {@link LinkComponent} for React Router. Pass it as `linkComponent` to `AppShell`, `StatCard` and anything else that takes one. `href` maps to React Router's `to` (query and hash included), and `testID` is forwarded as `data-testid`, as `... |
| [`useReactRouterActivePath`](../packages/ui/src/router/react-router.tsx) | function | Beta | The current location as `pathname + search + hash`, the shape `AppShell`'s `activePath` expects, so nav items whose `to` names a query or hash (`/admin?tab=users`, `/settings#profile`) highlight correctly. |
| [`useReactRouterNavigate`](../packages/ui/src/router/react-router.tsx) | function | Beta | {@link NavigateFn} backed by React Router's `useNavigate()`. Pass it as `ResourcePage`'s `onNavigate` (or anywhere a `NavigateFn` is accepted) for client-side navigation instead of a full page load. Absolute URLs (`https://…`, `mailto:…`... |
| [`useReactRouterSearchParams`](../packages/ui/src/router/react-router.tsx) | function | Beta | {@link SearchParamsAdapter} backed by React Router's location. Pass it as `useDataFilters(key, defs, { searchParams })` so URL-synced filters go through the router (loaders re-run, back/forward stays in sync) instead of the raw History A... |

---

## @marktiderman/genesis-ui/router/tanstack-router

TanStack Router adapters for genesis-ui's navigation contract: a `LinkComponent`, a `NavigateFn`, a `SearchParamsAdapter` and the full-location `activePath`. `@tanstack/react-router` is an optional peer, loaded only by this subpath.

**Barrel:** [`packages/ui/src/router/tanstack-router.tsx`](../packages/ui/src/router/tanstack-router.tsx)

### Other exports (4)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`TanStackRouterLink`](../packages/ui/src/router/tanstack-router.tsx) | const | Beta | {@link LinkComponent} for TanStack Router. Pass it as `linkComponent` to `AppShell`, `StatCard` and anything else that takes one. In-app hrefs navigate client-side (query and hash included, parsed by the router's `parseSearch`); absolute... |
| [`useTanStackRouterActivePath`](../packages/ui/src/router/tanstack-router.tsx) | function | Beta | The current location as `pathname + search + hash`, the shape `AppShell`'s `activePath` expects, so nav items whose `to` names a query or hash (`/admin?tab=users`, `/settings#profile`) highlight correctly. Paths are the router's (basepat... |
| [`useTanStackRouterNavigate`](../packages/ui/src/router/tanstack-router.tsx) | function | Beta | {@link NavigateFn} backed by the TanStack router. Pass it as `ResourcePage`'s `onNavigate` (or anywhere a `NavigateFn` is accepted) for client-side navigation instead of a full page load. Absolute URLs (`https://…`, `mailto:…`, `//host/…... |
| [`useTanStackRouterSearchParams`](../packages/ui/src/router/tanstack-router.tsx) | function | Beta | {@link SearchParamsAdapter} backed by the TanStack router's location. Pass it as `useDataFilters(key, defs, { searchParams })` so URL-synced filters go through the router (loaders and `validateSearch` run, back/forward stays in sync) ins... |

---

## @marktiderman/genesis-ui/rich-text

Read-only rich text renderer and server-safe helpers (sanitize, HTML, plain text). No editor dependency; usable in server components and on the server.

**Barrel:** [`packages/ui/src/components/rich-text/rich-text.tsx`](../packages/ui/src/components/rich-text/rich-text.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`RichText`](../packages/ui/src/components/rich-text/rich-text.tsx) | `RichTextProps` | Beta | RichText — renders a rich text document as React elements. |

### Other exports (17)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`emptyRichTextDoc`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | An empty document: one empty paragraph, which is what the editor produces. |
| [`escapeHtml`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Escape text for use in HTML element content and quoted attributes. |
| [`isRichTextDoc`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | True when `value` is shaped like a rich text document (`{ type: "doc" }`). |
| [`isRichTextEmpty`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | True when the document has no visible text and no embeds. |
| [`isSafeUrl`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | True when `url` is safe to put in an `href`: an absolute http(s), mailto or tel URL, a root-relative path (`/lessons/1`) or a fragment (`#notes`). |
| [`normalizeLinkUrl`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Turn what a person typed into the link field into a safe href, or `null`. `example.com/page` becomes `https://example.com/page`; an email address becomes a `mailto:` link. |
| [`parseVideoUrl`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Recognise a YouTube, Vimeo or Loom video URL (watch, share, short and embed forms) and reduce it to its provider and id. Returns `null` for anything else, including other hosts that merely look similar. |
| [`richTextClassName`](../packages/ui/src/components/rich-text/rich-text.tsx) | const | — | Typography for rendered rich text, shared by `RichText` and the editor's editable area so a document looks the same while writing and reading. Exported for apps that render stored HTML themselves. |
| [`RichTextLimitError`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | class | — | Thrown by `sanitizeRichTextDoc` when a document breaks a limit it was given. |
| [`richTextToHtml`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Serialize a document to HTML. The input is sanitized first, so this is safe to call on untrusted JSON; the output contains only the tags listed in this file's header, with every value escaped. |
| [`richTextToPlainText`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Plain text for search indexes, previews and notifications. Blocks are separated by blank lines; embeds become "Title (url)". |
| [`sanitizeRichTextDoc`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Validate an untrusted value as a rich text document and return a clean copy that contains only allow-listed nodes, marks and attributes. |
| [`sanitizeVideoEmbedAttrs`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Validate untrusted embed attributes, returning a clean copy or `null`. |
| [`VIDEO_IFRAME_ATTRS`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | const | — | Attributes for an embed's `<iframe>`. Shared by the HTML serializer, the React renderer and the editor so all three emit the same frame. |
| [`videoEmbedSrc`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | The player URL for an embed. Built from validated parts only. |
| [`videoEmbedTitle`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | Accessible name for an embed's frame: its title, or "YouTube video" etc. |
| [`videoWatchUrl`](../packages/ui/src/components/rich-text/rich-text-doc.ts) | function | — | The page URL for an embed (what a viewer would open in a new tab). |

### Types (8)

Type-only exports not consumed as a component's `Props`.

```ts
export type { RichTextDoc };
export type { RichTextHeadingLevel };
export type { RichTextMark };
export type { RichTextNode };
export type { RichTextToHtmlOptions };
export type { SanitizeRichTextOptions };
export type { VideoEmbedAttrs };
export type { VideoProvider };
```

---

## @marktiderman/genesis-ui/rich-text-editor

Rich text editor (Tiptap 3) with a Genesis toolbar. Needs the optional `@tiptap/*` peers.

**Barrel:** [`packages/ui/src/components/rich-text/rich-text-editor.tsx`](../packages/ui/src/components/rich-text/rich-text-editor.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`RichTextEditor`](../packages/ui/src/components/rich-text/rich-text-editor.tsx) | `RichTextEditorProps` | Beta | RichTextEditor — formatted text input for lessons, notes and other long-form content. |

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`VideoEmbed`](../packages/ui/src/components/rich-text/video-embed.ts) | const | Beta | Tiptap node for YouTube, Vimeo and Loom players, stored as `{ provider, id, hash?, title? }` and rebuilt from those parts on render. Adds the `setVideoEmbed({ url, title })` command. |

### Types (7)

Type-only exports not consumed as a component's `Props`.

```ts
export type { RichTextChangeDetails };
export type { RichTextDoc };
export type { RichTextEditorHandle };
export type { RichTextEditorLabels };
export type { RichTextEditorValue };
export type { RichTextHeadingLevel };
export type { RichTextToolbarItem };
```

---

## @marktiderman/genesis-ui-native

React Native components (NativeWind v4-5). Use in Expo / RN surfaces.

**Barrel:** [`packages/ui-native/src/index.ts`](../packages/ui-native/src/index.ts)

### Components (93)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AppleSignInButton`](../packages/ui-native/src/layouts/apple-sign-in.tsx) | `AppleSignInButtonProps` | — | Apple's branded button, full width. Renders nothing off iOS. |
| [`AuthBranding`](../packages/ui-native/src/layouts/auth.tsx) | `AuthBrandingProps` | — | _(no summary)_ |
| [`AuthForm`](../packages/ui-native/src/layouts/auth.tsx) | `AuthFormProps` | — | _(no summary)_ |
| [`AuthScreen`](../packages/ui-native/src/layouts/auth-screen.tsx) | `AuthScreenProps` | — | _(no summary)_ |
| [`Box`](../packages/ui-native/src/components/layout/index.ts) | `BoxProps` | — | _(no summary)_ |
| [`BrandExtensionsProvider`](../packages/ui-native/src/hooks/use-genesis-extension.ts) | `BrandExtensionsProviderProps` | — | _(no summary)_ |
| [`GenesisModulesProvider`](../packages/ui-native/src/native-modules.tsx) | `GenesisModulesProviderProps` | — | Pass the optional native modules the app has installed. Nested providers merge: an inner one adds to or replaces what an outer one gave. Define the `modules` object once at module scope (as the starter's `src/lib/native-modules.ts` does)... |
| [`Grid`](../packages/ui-native/src/components/layout/index.ts) | `GridProps` | — | _(no summary)_ |
| [`InboxPage`](../packages/ui-native/src/layouts/inbox-page.tsx) | `InboxPageProps` | — | _(no summary)_ |
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
| [`NativeGlassSurface`](../packages/ui-native/src/components/glass-surface.tsx) | `NativeGlassSurfaceProps` | — | _(no summary)_ |
| [`NativeHeaderCard`](../packages/ui-native/src/components/header-card.tsx) | `NativeHeaderCardProps` | — | _(no summary)_ |
| [`NativeIcon`](../packages/ui-native/src/components/icon.tsx) | `NativeIconProps` | — | _(no summary)_ |
| [`NativeImage`](../packages/ui-native/src/components/image.tsx) | `NativeImageProps` | — | _(no summary)_ |
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
| [`ThreadPage`](../packages/ui-native/src/layouts/thread-page.tsx) | `ThreadPageProps` | — | _(no summary)_ |

### Other exports (42)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`alertVariants`](../packages/ui-native/src/components/alert.tsx) | value | — | _(no summary)_ |
| [`appleProvider`](../packages/ui-native/src/layouts/apple-sign-in.tsx) | function | Beta | A `SocialAuthProvider` (id `"apple"`) that draws Apple's button, for `AuthScreen`'s `providers`. `null` off iOS or without the module. |
| [`badgeTextVariants`](../packages/ui-native/src/components/badge.tsx) | value | — | _(no summary)_ |
| [`badgeVariants`](../packages/ui-native/src/components/badge.tsx) | value | — | _(no summary)_ |
| [`buttonTextVariants`](../packages/ui-native/src/components/button.tsx) | value | — | _(no summary)_ |
| [`buttonVariants`](../packages/ui-native/src/components/button.tsx) | value | — | _(no summary)_ |
| [`cn`](../packages/ui-native/src/utils.ts) | function | — | _(no summary)_ |
| [`composeHeaderOptions`](../packages/ui-native/src/layouts/screen-container.tsx) | function | — | Compose a `<Stack.Screen options={...}>` object from Layer-3 named props + a direct `headerOptions` passthrough. Layouts call this and pass the result to `<Stack.Screen>` so the host's expo-router stack renders a platform-native large ti... |
| [`confirmDiscardChanges`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | function | — | Default leave-guard helper. Pops a native Alert with Discard / Keep Editing buttons; calls `proceed()` only if the user opts to discard. |
| [`ForgotPasswordLink`](../packages/ui-native/src/layouts/auth.tsx) | function | — | _(no summary)_ |
| [`formatInboxTime`](../packages/ui-native/src/layouts/inbox-page.tsx) | function | — | The default row time: `9:41`, `Yesterday`, `Monday`, then a short date. |
| [`getInboxPageStackOptions`](../packages/ui-native/src/layouts/inbox-page.tsx) | function | — | `<Stack.Screen options>` for an InboxPage: a large title that collapses on scroll. |
| [`getNotificationsPageStackOptions`](../packages/ui-native/src/layouts/notifications-page.tsx) | function | — | Compose `<Stack.Screen options={...}>` for a NotificationsPage. Wires a "Mark all read" action via `headerRight` when `onMarkAllRead` is passed. |
| [`getSettingsPageStackOptions`](../packages/ui-native/src/layouts/settings-page.tsx) | function | — | Convenience helper for callers that want to wire `<Stack.Screen options={...}>` without re-importing composeHeaderOptions. Defaults `large: true` and `scrollEdgeBehavior: "match"` to match the Apple HIG large-title settings pattern out o... |
| [`getSettingsSubPageStackOptions`](../packages/ui-native/src/layouts/settings-sub-page.tsx) | function | — | Compose `<Stack.Screen options={...}>` for a SettingsSubPage. Wires the nav-bar Save button via `headerRight` automatically when `onSave` is passed. |
| [`getThreadPageStackOptions`](../packages/ui-native/src/layouts/thread-page.tsx) | function | — | `<Stack.Screen options>` for a ThreadPage: a standard (not large) title, like Messages. |
| [`googleProvider`](../packages/ui-native/src/layouts/google-sign-in.tsx) | function | Beta | A `SocialAuthProvider` (id `"google"`) for `AuthScreen`'s `providers`, or `null` when `enabled` is false. |
| [`KEYBOARD_TOOLBAR_HEIGHT`](../packages/ui-native/src/layouts/keyboard.tsx) | const | — | Height of react-native-keyboard-controller's `KeyboardToolbar`, kept clear above the focused input. Mirrors `KEYBOARD_TOOLBAR_HEIGHT` in the library's `src/components/KeyboardToolbar/constants.ts` (1.22): move them together. |
| [`KeyboardScrollProvider`](../packages/ui-native/src/layouts/keyboard.tsx) | function | — | _(no summary)_ |
| [`NATIVE_ICON_NAMES`](../packages/ui-native/src/icon-names.ts) | const | — | Every semantic icon name. |
| [`NativeCardContent`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardDescription`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardFooter`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeCardHeader`](../packages/ui-native/src/components/card.tsx) | value | — | _(no summary)_ |
| [`NativeListItemDivider`](../packages/ui-native/src/components/list-item.tsx) | function | — | _(no summary)_ |
| [`readReceiptFor`](../packages/ui-native/src/layouts/thread-page.tsx) | function | — | The newest of my messages the other side has read, or null. |
| [`SF_SYMBOLS`](../packages/ui-native/src/icon-names.ts) | const | Beta | The semantic icon names Genesis components ask for, and the SF Symbol each one draws on iOS. Components say "settings" or "bell", never a library's own name; `lucideIcons` (`/icons/lucide`) maps the same names for Android, web and the SF... |
| [`showInboxActions`](../packages/ui-native/src/layouts/inbox-page.tsx) | function | — | Opens a row's actions as a menu (long press). |
| [`spaceScale`](../packages/ui-native/src/components/layout/index.ts) | value | — | _(no summary)_ |
| [`spacingClass`](../packages/ui-native/src/components/layout/index.ts) | value | — | _(no summary)_ |
| [`textVariants`](../packages/ui-native/src/components/text.tsx) | value | — | _(no summary)_ |
| [`toggleVariants`](../packages/ui-native/src/components/toggle.tsx) | value | — | _(no summary)_ |
| [`useGenesisExtension`](../packages/ui-native/src/hooks/use-genesis-extension.ts) | function | — | Read an extension scale by key. Returns `undefined` when the provider isn't mounted OR when the key isn't declared on the brand. The return type follows the consumer's augmented `BrandExtensions[K]`. |
| [`useGenesisModules`](../packages/ui-native/src/native-modules.tsx) | function | — | The modules given to the nearest `GenesisModulesProvider`; `{}` without one. |
| [`useKeyboardScroll`](../packages/ui-native/src/layouts/keyboard.tsx) | function | — | The app's keyboard-aware scroll view, or null when none was provided. |
| [`useKeyboardToolbar`](../packages/ui-native/src/layouts/keyboard.tsx) | function | — | The app's keyboard toolbar, or null when none was provided (or no scroll view to go with it). |
| [`useLiquidGlass`](../packages/ui-native/src/components/glass-surface.tsx) | function | — | expo-glass-effect's `GlassView` when Liquid Glass can be drawn here, else `null`. |
| [`useReducedMotion`](../packages/ui-native/src/hooks/use-reduced-motion.ts) | function | — | _(no summary)_ |
| [`useReduceTransparency`](../packages/ui-native/src/components/glass-surface.tsx) | function | — | True while the user has Reduce Transparency on (iOS), `null` until the first answer. Always false elsewhere, and on a runtime that can't say. |
| [`useThemeMode`](../packages/ui-native/src/hooks/use-theme-mode.ts) | function | — | _(no summary)_ |
| [`useThemeRoles`](../packages/ui-native/src/hooks/use-theme-roles.ts) | function | — | _(no summary)_ |
| [`useToast`](../packages/ui-native/src/components/toast.tsx) | function | — | _(no summary)_ |

### Types (58)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AppleButtonModuleLike };
export type { AppleProviderOptions };
export type { AuthFormValues };
export type { AuthScreenSlotMap };
export type { BoxBackground };
export type { BrandExtensionsValue };
export type { FlexAlign };
export type { FlexJustify };
export type { GenesisDatePickerComponent };
export type { GenesisDatePickerProps };
export type { GenesisGlassModule };
export type { GenesisIconComponent };
export type { GenesisIconSet };
export type { GenesisImageComponent };
export type { GenesisImageProps };
export type { GenesisListComponent };
export type { GenesisListProps };
export type { GenesisModules };
export type { GenesisReanimatedModule };
export type { GenesisSymbolComponent };
export type { GenesisSymbolProps };
export type { GoogleProviderOptions };
export type { InboxItem };
export type { InboxPageSlotMap };
export type { InboxSwipeAction };
export type { KeyboardScrollProps };
export type { KeyboardToolbarProps };
export type { NativeAccordionType };
export type { NativeChipGroupMode };
export type { NativeComboboxOption };
export type { NativeEmptyStateVariant };
export type { NativeIconName };
export type { NativeInlineAlertVariant };
export type { NativeSegmentedControlOption };
export type { NativeStepperStep };
export type { NativeToastOptions };
export type { NativeToastVariant };
export type { NotificationItem };
export type { NotificationsPageSlotMap };
export type { SafeAreaEdge };
export type { ScreenHeaderProps };
export type { ScrollEdgeBehavior };
export type { SettingsPageDangerousAction };
export type { SettingsPageRow };
export type { SettingsPageSection };
export type { SettingsPageSlotMap };
export type { SocialAuthProvider };
export type { SpaceToken };
export type { SpacingPrefix };
export type { TextPreset };
export type { ThemeMode };
export type { ThemeRoleColors };
export type { ThreadAttachment };
export type { ThreadComposer };
export type { ThreadLabels };
export type { ThreadMessage };
export type { ThreadPageSlotMap };
export type { UseThemeRolesOptions };
```

---

## @marktiderman/genesis-native

The native app shell: `GenesisNativeApp` (boot behind the splash, fatal screen, persisted query client, auth gate, held deep links; each part a slot and exported on its own). See packages/native/README.md.

**Barrel:** [`packages/native/src/index.ts`](../packages/native/src/index.ts)

### Components (5)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`AuthGate`](../packages/native/src/auth.tsx) | `AuthGateProps` | — | Render one tree for a signed-in user and another for everyone else. |
| [`BootScreen`](../packages/native/src/app.tsx) | `BootScreenProps` | — | The default boot slot: a plain loading view (the splash covers it at launch). |
| [`FatalScreen`](../packages/native/src/errors.tsx) | `FatalScreenProps` | — | The default fatal screen: what went wrong and "Try again". |
| [`GenesisErrorBoundary`](../packages/native/src/errors.tsx) | `GenesisErrorBoundaryProps` | — | An error boundary whose fallback gets `{ error, retry }`. |
| [`GenesisNativeApp`](../packages/native/src/app.tsx) | `GenesisNativeAppProps` | Beta | The root of an Expo app: theme, keyboard, data, boot behind the splash, errors, session and held links. |

### Other exports (22)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`BootProvider`](../packages/native/src/boot.tsx) | function | — | Makes a boot readable with `useBoot()`. |
| [`BootTimeoutError`](../packages/native/src/boot.tsx) | class | — | Thrown when a step takes longer than its timeout. |
| [`connectQueryLifecycle`](../packages/native/src/query.ts) | function | — | Tell TanStack Query when the app comes to the front (refetch stale queries) and when the network comes and goes. Returns the cleanup. |
| [`createBoot`](../packages/native/src/boot.tsx) | function | — | The boot controller: runs `steps` once each, in order, with a timeout per step. |
| [`createHydrationGate`](../packages/native/src/hydration-gate.ts) | function | — | A gate that holds writes until a persisted store has hydrated. |
| [`createLinkHold`](../packages/native/src/held-link.ts) | function | — | A place to hold one deep link until sign-in completes; lives outside React. |
| [`createNativeQueryClient`](../packages/native/src/query.ts) | function | — | A QueryClient for a phone. `networkMode: "offlineFirst"` runs a query or mutation once whatever the network says, then pauses its retries while the device is offline (`onlineManager`, which `connectQueryLifecycle` feeds from NetInfo), co... |
| [`createSessionStore`](../packages/native/src/auth.tsx) | function | — | The Supabase session as a store: `load` reads it once, `start` follows auth events. |
| [`DAY_MS`](../packages/native/src/query.ts) | const | — | One day in milliseconds: the default max age of the saved query cache. |
| [`defaultErrorUtils`](../packages/native/src/errors.tsx) | function | — | `globalThis.ErrorUtils` in a React Native runtime, undefined elsewhere. |
| [`defaultRejectionTracker`](../packages/native/src/errors.tsx) | function | — | Hermes's rejection tracker, when the app runs on Hermes. React Native sends unhandled rejections to `ExceptionsManager` (LogBox in development), never to `ErrorUtils`' global handler, so without this they never reach `onError`. |
| [`installGlobalErrorHandler`](../packages/native/src/errors.tsx) | function | — | Route global errors to `onError`. A fatal one goes to `onFatal` instead of React Native's default handler, which would close the app; a non-fatal one still reaches the previous handler (LogBox in development). Returns a function that put... |
| [`installRejectionTracker`](../packages/native/src/errors.tsx) | function | — | Report unhandled promise rejections to `onError` (non-fatal). This replaces React Native's own tracker, so each rejection is also written with `console.warn`, which LogBox shows in development as before. |
| [`mergeBlockSettings`](../packages/native/src/blocks.tsx) | function | Beta | The merge `useBlockSettings` does, without hooks (subtitles already read). @stability Beta |
| [`normalizeLink`](../packages/native/src/links.ts) | function | — | The app path for `url`, `"/"` when it is unknown, or `null` when it is ignored. |
| [`PlainFatalScreen`](../packages/native/src/errors.tsx) | function | — | The last-resort fatal screen: React Native primitives only, no theme, no context, nothing that can itself fail. Shown when the providers could not start, or when the `fatal` slot threw. |
| [`SessionProvider`](../packages/native/src/auth.tsx) | function | — | Makes a session store readable with `useSession()`. |
| [`useBlocks`](../packages/native/src/blocks.tsx) | function | Beta | The resolved blocks: their ids, nav entries, Settings rows, routes and the rest, each tagged with its FeatureId. Throws outside `GenesisNativeApp`. |
| [`useBlockSettings`](../packages/native/src/blocks.tsx) | function | Beta | The app's Settings sections with every block's rows added: each row goes at the end of the section its `section` names (by `order`, then block order), and a section no one has yet is added after the rest. |
| [`useBoot`](../packages/native/src/boot.tsx) | function | — | The boot's status, and `retry` after a failure. Inside `GenesisNativeApp` or a `BootProvider`. |
| [`useHeldLink`](../packages/native/src/held-link.ts) | function | — | Follow the held link after a sign-in, drop it otherwise; returns the link still held. |
| [`useSession`](../packages/native/src/auth.tsx) | function | — | The session and whether it is known yet. Inside `GenesisNativeApp` or a `SessionProvider`. |

### Types (38)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AppStateLike };
export type { AsyncStorageLike };
export type { AuthClientLike };
export type { BlockSettingsSection };
export type { BootController };
export type { BootOptions };
export type { BootState };
export type { BootStatus };
export type { BootStep };
export type { BootStepContext };
export type { EnableRejectionTracker };
export type { ErrorReport };
export type { ErrorUtilsLike };
export type { GlobalErrorHandlerOptions };
export type { HeldLinkAuth };
export type { HydrationGate };
export type { HydrationGateOptions };
export type { LinkHold };
export type { LinkOptions };
export type { LinkTarget };
export type { NativeAppSlots };
export type { NativeBlock };
export type { NativeBlockRootProps };
export type { NativeQueryClientOptions };
export type { NetInfoLike };
export type { OnError };
export type { QueryLifecycleOptions };
export type { QueryPersistence };
export type { SessionState };
export type { SessionStatus };
export type { SessionStore };
export type { SessionStoreOptions };
export type { SettingsRowLike };
export type { SignedOutProps };
export type { SplashModule };
export type { UseBlockSettingsOptions };
export type { UseBootReturn };
export type { UseHeldLinkOptions };
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
| [`inferFieldType`](../packages/data-switchboard/src/introspect.ts) | function | — | Infer the canonical StorageType (+ array-ness) of a single value. |
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

### Types (43)

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
export type { SwitchboardContract };
export type { TicketRow };
export type { Tier };
export type { ValueDrift };
```

---

## @marktiderman/genesis-studio

Data Studio workspace UI — a table sidebar and a sheet grid with version-checked, audited cell edits, as the signed-in user. See packages/studio/README.md + docs/DATA-STUDIO.md.

**Barrel:** [`packages/studio/src/index.ts`](../packages/studio/src/index.ts)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`DataStudio`](../packages/studio/src/DataStudio.tsx) | `DataStudioProps` | Experimental | The Data Studio: a sidebar of the tables this user may see, and a sheet of the selected one where a cell is edited in place. Every edit carries the version it was read at, so a stale edit is refused rather than saved over someone else's,... |

### Other exports (5)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`createSearchParamsRouter`](../packages/studio/src/router.ts) | function | — | An adapter over any router that exposes search params with a setter — React Router's `useSearchParams`, or Next.js's `useSearchParams` plus `router.replace`/`push`. |
| [`locationFromSearchParams`](../packages/studio/src/router.ts) | function | — | _(no summary)_ |
| [`searchParamsFromLocation`](../packages/studio/src/router.ts) | function | — | The studio's location as query parameters, keeping every parameter in `base` that isn't the studio's own. |
| [`useHistoryRouter`](../packages/studio/src/router.ts) | function | — | For an app with no router: keeps the studio's state in the current page's query string through the History API. |
| [`useMemoryRouter`](../packages/studio/src/router.ts) | function | — | A router held in memory, for tests and embedded previews. |

### Types (6)

Type-only exports not consumed as a component's `Props`.

```ts
export type { StudioActivity };
export type { StudioLocation };
export type { StudioNavigateOptions };
export type { StudioRouter };
export type { StudioSessionSource };
export type { StudioView };
```

---

## @marktiderman/genesis-studio-server

Data Studio server handler (Request → Response) that acts as the signed-in user over Postgres/Supabase. The only package that touches database credentials. See packages/studio-server/README.md.

**Barrel:** [`packages/studio-server/src/index.ts`](../packages/studio-server/src/index.ts)

### Other exports (19)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`ADD_COMMENT_FUNCTION`](../packages/studio-server/src/setup-sql.ts) | const | — | Comments on records. |
| [`AUDIT_FUNCTION`](../packages/studio-server/src/setup-sql.ts) | const | — | Name of the audit function the handler calls. |
| [`backoffDelay`](../packages/studio-server/src/outbox.ts) | function | — | Delay before attempt `attempt + 1`, with jitter. |
| [`bearerToken`](../packages/studio-server/src/auth.ts) | function | — | Read a bearer token from the `Authorization` header. |
| [`byResource`](../packages/studio-server/src/authorize.ts) | function | — | The common case of `authorize`: a fixed allow-list by `schema.table`, for the users `who` admits. Anything not listed is denied, and a listed table without `update` is read-only. |
| [`COMMENTS_FUNCTION`](../packages/studio-server/src/setup-sql.ts) | const | — | _(no summary)_ |
| [`createOutboxWorker`](../packages/studio-server/src/outbox.ts) | function | — | _(no summary)_ |
| [`createPostgresDatabase`](../packages/studio-server/src/db.ts) | function | — | A `StudioDatabase` over a Postgres connection string, or over a postgres.js pool you already have. A pool you pass in keeps its own type parsing, so dates arrive as JS Dates rather than Postgres's exact text; version tokens are unaffecte... |
| [`createStudioHandler`](../packages/studio-server/src/handler.ts) | function | — | Create the handler. It opens one transaction per request, switches to the signed-in user (`set local role` plus their verified claims), and only then reads the catalog or touches a row, so the database's own privileges and row rules alwa... |
| [`databaseDecides`](../packages/studio-server/src/authorize.ts) | function | — | Turn the studio on for every table, and let the database decide: each user reads, edits, adds and deletes exactly what their grants and row rules allow, sees history and comments on the rows they can see, and runs the row actions configu... |
| [`HISTORY_FUNCTION`](../packages/studio-server/src/setup-sql.ts) | const | — | Reads a record's audit history. |
| [`IdentitySwitchError`](../packages/studio-server/src/db.ts) | class | — | Thrown when the transaction did not end up as the requested role. |
| [`jwtAuth`](../packages/studio-server/src/auth.ts) | function | — | Verify a bearer JWT with a shared secret or a JWKS endpoint. Exactly one of `secret` and `jwksUrl` is required. |
| [`OUTBOX_AUDIT_FUNCTION`](../packages/studio-server/src/setup-sql.ts) | const | — | The `outbox` sink's audit function: writes the log entry and queues it. |
| [`PermanentDeliveryError`](../packages/studio-server/src/outbox.ts) | class | — | Throw this from `deliver` when retrying can't help (the receiver rejected the payload). |
| [`STUDIO_PROTOCOL_VERSION`](../packages/studio-server/src/protocol.ts) | const | — | Bumped on any incompatible change; the handler rejects other versions. |
| [`studioSetupSql`](../packages/studio-server/src/setup-sql.ts) | function | — | SQL that installs the tamper-proof audit trail: |
| [`supabaseAuth`](../packages/studio-server/src/auth.ts) | function | — | Verify Supabase Auth access tokens: JWKS from the project, issuer `<url>/auth/v1`, audience `authenticated`. |
| [`supabaseStudio`](../packages/studio-server/src/supabase.ts) | function | — | The studio handler for a Supabase project, on for every table in `public`: each user sees and edits what their row rules allow, every write is version-checked and audited (`genesis_studio.audit_log`, from `genesis studio init`'s migratio... |

### Types (45)

Type-only exports not consumed as a component's `Props`.

```ts
export type { AuditSink };
export type { Authorize };
export type { AuthorizeContext };
export type { AuthorizeDecision };
export type { BulkResponse };
export type { ByResourceOptions };
export type { CommentResponse };
export type { CommentsResponse };
export type { CreateResponse };
export type { DatabaseDecidesOptions };
export type { DeadLetter };
export type { DeleteResponse };
export type { DescribeResponse };
export type { ErrorResponse };
export type { HistoryResponse };
export type { Identity };
export type { JwtAuthOptions };
export type { ListResponse };
export type { OutboxEntry };
export type { OutboxWorker };
export type { OutboxWorkerOptions };
export type { PostgresOptions };
export type { Query };
export type { ReadResponse };
export type { ResourceRule };
export type { ResourceSettings };
export type { ResourcesResponse };
export type { RowActionSettings };
export type { RunActionResponse };
export type { RunSummary };
export type { SetupSqlOptions };
export type { SqlRow };
export type { StudioAction };
export type { StudioAuth };
export type { StudioClaims };
export type { StudioContract };
export type { StudioDatabase };
export type { StudioHandler };
export type { StudioHandlerOptions };
export type { StudioRequest };
export type { StudioRow };
export type { SupabaseAuthOptions };
export type { SupabaseStudioOptions };
export type { UndoResponse };
export type { UpdateResponse };
```

---

## @marktiderman/genesis-features

A typed feature registry: `defineFeatures` and `defineFlags` in one `features.ts` that running code imports, plus the AGENTS.md and JSON generators. `genesis features build|check` keeps the generated output in step. See packages/features/README.md.

**Barrel:** [`packages/features/src/index.ts`](../packages/features/src/index.ts)

### Other exports (36)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`AGENTS_BLOCK_END`](../packages/features/src/generate.ts) | const | — | Marks the end of the generated block in AGENTS.md. |
| [`AGENTS_BLOCK_START`](../packages/features/src/generate.ts) | const | — | Marks the start of the generated block in AGENTS.md. |
| [`BlockError`](../packages/features/src/blocks.ts) | class | Beta | Thrown by {@link defineBlock} and {@link resolveBlocks}; lists every problem at once. @stability Beta |
| [`BrokenBlockError`](../packages/features/src/generate.ts) | class | — | Thrown when a generated block's markers are broken: one is missing, repeated or out of order. |
| [`cycleProblems`](../packages/features/src/graph.ts) | function | Beta | Cycles through `requires`, each reported once, from where the depth-first search found it. @stability Beta |
| [`defineBlock`](../packages/features/src/blocks.ts) | function | Beta | Declare a block. Validates it (id, requirements, platforms, contribution keys and duplicate ids within the block) and returns it frozen, so a typo fails where the block is written rather than where it is used: |
| [`defineFeatures`](../packages/features/src/model.ts) | function | Beta | The one source of truth for a repo's features. Validates every entry and returns the same object, so running code reads it directly and the key type becomes the repo's `FeatureId`: |
| [`defineFlags`](../packages/features/src/model.ts) | function | Beta | Flags, each tied to a feature of `features`. An unknown `feature` is a type error, and at runtime: - every flag needs an `owner`, a `kind`, a `default` and its `scopes`; - `release` and `experiment` flags need an `expires` date, `ops` fl... |
| [`dependencyOrder`](../packages/features/src/graph.ts) | function | — | The ids in dependency order (what a node requires comes first), ties kept in the given order. Requirements outside `nodes` are ignored. Assumes no cycles ({@link requiresProblems} reports them). |
| [`expiredFlags`](../packages/features/src/model.ts) | function | Beta | Flags whose `expires` date is before `today` (`YYYY-MM-DD`, default today in UTC): remove the code path, then the flag. |
| [`FEATURE_HORIZONS`](../packages/features/src/model.ts) | const | Beta | When a planned or building feature is due, without dates: the roadmap's three columns. |
| [`FEATURE_LAYERS`](../packages/features/src/model.ts) | const | Beta | What kind of thing a feature is, from smallest to largest, so an agent looking for a building block can tell a primitive from a whole block: `token`, `primitive` (one component), `pattern` (a composed component with slots), `layout` (a p... |
| [`FEATURE_PLATFORMS`](../packages/features/src/model.ts) | value | — | _(no summary)_ |
| [`FEATURE_STATUSES`](../packages/features/src/model.ts) | const | Beta | Where a feature is in its life. The order is the board's column order. `idea` is captured but not agreed: it is in the list so `find` turns it up before someone builds the same thing twice. |
| [`FeatureRegistryError`](../packages/features/src/model.ts) | class | — | Thrown by {@link defineFeatures} and {@link defineFlags}; lists every problem at once. |
| [`featureSchema`](../packages/features/src/model.ts) | const | — | The Zod schema for one {@link FeatureDef}, field by field. Cross-field rules live in {@link featureProblems}. |
| [`findFeatures`](../packages/features/src/model.ts) | function | Beta | Features matching `term` in their id, aliases, name, keywords, summary, tagline, category, import paths, slots, contributions or code paths, best matches (id, name and keywords) first. With `options` and an empty `term`, every feature th... |
| [`FLAG_KINDS`](../packages/features/src/model.ts) | const | Beta | Why a flag exists. `release` and `experiment` flags need `expires`, `ops` flags need a `runbook`, and `permission` flags fail `check`: paid access belongs in entitlements (`access`), not flags. |
| [`flagSchema`](../packages/features/src/model.ts) | const | — | The Zod schema for one {@link FlagDef}. Cross-flag rules live in {@link defineFlags}. |
| [`flagsForFeature`](../packages/features/src/model.ts) | function | Beta | The names of the flags that belong to a feature, in declaration order. |
| [`MARKETING_BLOCK_END`](../packages/features/src/generate.ts) | const | — | Marks the end of the generated marketing block. |
| [`MARKETING_BLOCK_START`](../packages/features/src/generate.ts) | const | — | Marks the start of the generated marketing block (e.g. in README.md). |
| [`marketingRecords`](../packages/features/src/generate.ts) | function | — | The public, shipped features a marketing page shows: visibility public, a tagline, live or beta. |
| [`OPENFEATURE_MANIFEST_SCHEMA`](../packages/features/src/generate.ts) | const | — | The schema an OpenFeature CLI flag manifest points at. |
| [`readAgentsBlock`](../packages/features/src/generate.ts) | const | — | The generated AGENTS.md block inside `doc`, or null. |
| [`replaceAgentsBlock`](../packages/features/src/generate.ts) | const | Beta | `doc` with its generated AGENTS.md block replaced by `block`, or with `block` appended when it has none yet. |
| [`requirementProblem`](../packages/features/src/graph.ts) | function | Beta | One requirement's problem (itself, or an unknown id), or undefined when it is fine. @stability Beta |
| [`requiresProblems`](../packages/features/src/graph.ts) | function | Beta | Self-requirements, unknown requirements and cycles through `requires`, as problem strings (`a.requires: …`). Each cycle is reported once, from where the depth-first search found it: `a.requires: a cycle: a → b → a`. |
| [`resolveBlocks`](../packages/features/src/blocks.ts) | function | Beta | The blocks that are on, checked and merged: |
| [`statusOn`](../packages/features/src/model.ts) | function | Beta | A feature's status on one platform, or undefined when it isn't there. @stability Beta |
| [`toAgentsMarkdown`](../packages/features/src/generate.ts) | function | Beta | The marker-delimited block for AGENTS.md: deliberately short. It points agents at `find` and the skill and gives counts, never the whole list, so AGENTS.md stays small however many features there are. |
| [`toJson`](../packages/features/src/generate.ts) | function | Beta | The registry as JSON, for tools that can't import TypeScript. Stable: no timestamps, features in declaration order, so `check` can compare it. It is also the record of every id ever used, which keeps ids permanent. |
| [`toMarketingMarkdown`](../packages/features/src/generate.ts) | function | Beta | A benefit-led feature list for a README or a marketing page: public, shipped features with a tagline, highlights first, grouped by category. |
| [`toOpenFeatureManifest`](../packages/features/src/generate.ts) | function | Beta | The flags as an OpenFeature CLI flag manifest (`flags.json`), so `openfeature generate` can make typed accessors from the same registry. |
| [`toRecords`](../packages/features/src/model.ts) | function | Beta | Features as records, in declaration order, each with its flags attached. |
| [`toSkillMarkdown`](../packages/features/src/generate.ts) | function | Beta | The agent skill for working with the registry, written to `.claude/skills/features/SKILL.md` by `genesis features build`. `outputs` names what the build writes in this repo, so the skill never claims a file the repo turned off. |

### Types (32)

Type-only exports not consumed as a component's `Props`.

```ts
export type { BlockContributions };
export type { BlockDataUse };
export type { BlockDef };
export type { BlockMigration };
export type { BlockNavItem };
export type { BlockPrivacy };
export type { BlockRoute };
export type { BlockSettingsRow };
export type { Contributed };
export type { EnabledBlocks };
export type { FeatureAccess };
export type { FeatureDef };
export type { FeatureHorizon };
export type { FeatureIdOf };
export type { FeatureLayer };
export type { FeatureLinks };
export type { FeatureMedia };
export type { FeaturePlatform };
export type { FeatureRecord };
export type { FeatureStatus };
export type { FeatureVisibility };
export type { Features };
export type { FindOptions };
export type { FlagDef };
export type { FlagKind };
export type { FlagValue };
export type { Flags };
export type { GenerateOptions };
export type { RequiresNode };
export type { RequiresProblemsOptions };
export type { ResolveBlocksOptions };
export type { ResolvedBlocks };
```

---

## @marktiderman/genesis-features/react

`FeatureList`: the registry as a genesis-ui ResourcePage — a table, a board grouped by status, filters by app and audience. genesis-ui, React and lucide-react are optional peers, loaded only by this subpath.

**Barrel:** [`packages/features/src/react.tsx`](../packages/features/src/react.tsx)

### Components (1)

| Name | Props | Stability | Summary |
| --- | --- | --- | --- |
| [`FeatureList`](../packages/features/src/react.tsx) | `FeatureListProps` | Beta | A repo's features as a page. The default (`variant="admin"`) is a ResourcePage over static data: a table, and in its grid view a board grouped by status, with status chips, filters by app, audience and visibility, search, and a detail pa... |

### Other exports (1)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`FeatureStatusBadge`](../packages/features/src/react.tsx) | function | Beta | A feature's status as a badge. `StatusBadge` covers the active states and deprecated; idea, planned and retired have no status there, so they use the secondary and outline `Badge`. |

---

## @marktiderman/genesis-features/node

`buildFeatureOutputs` and `checkFeatureOutputs`, the file-system half that `genesis features build|check` runs.

**Barrel:** [`packages/features/src/node.ts`](../packages/features/src/node.ts)

### Other exports (6)

Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).

| Name | Kind | Stability | Summary |
| --- | --- | --- | --- |
| [`blankComments`](../packages/features/src/node.ts) | function | — | `text` with its comments blanked to spaces (newlines kept), so a flag named in a comment isn't read as a flag read and line numbers stay right. Strings, regex literals and template text are left alone; a template's `${…}` is code. With `... |
| [`buildFeatureOutputs`](../packages/features/src/node.ts) | function | Beta | Writes every generated output (the AGENTS.md block, the JSON, the flag manifest, the skill, the marketing block) and adds `@AGENTS.md` to CLAUDE.md when it's missing. Refuses, writing nothing, when an id recorded in the JSON has disappea... |
| [`checkFeatureOutputs`](../packages/features/src/node.ts) | function | Beta | Checks the registry against the repo. Errors (exit 1): generated output that is stale, `links.code` paths that don't exist, the flag rules (a permission flag, an expired flag, a dynamic key, a key read but not defined or defined but neve... |
| [`globToRegExp`](../packages/features/src/node.ts) | function | — | A glob (`*`, `**`, `?`, `{a,b}`) as a RegExp over `/`-separated relative paths. |
| [`scanFlagReads`](../packages/features/src/node.ts) | function | — | Flag reads in `text`: each key read through an accessor with a literal, and each read whose key isn't a literal (`dynamic`), as `path:line`. Comments don't count. |
| [`summarizeCheck`](../packages/features/src/node.ts) | function | Beta | A few lines for a session's start: counts, stale output, expired flags, planned features with shipped work and open claims. Meant for a SessionStart hook (`genesis features check --summary`). |

### Types (5)

Type-only exports not consumed as a component's `Props`.

```ts
export type { FeatureCheckResult };
export type { FeatureEvidence };
export type { FeaturePrEvidence };
export type { FeatureProjectOptions };
export type { PlannedButShipped };
```

