# Genesis Sample

The reference app for Genesis: a public marketing landing page at `/`, plus a developer-facing
showcase and a small demo app, both built entirely from `@marktiderman/genesis-ui`,
`@marktiderman/genesis-core`, and `@marktiderman/genesis-design-system` — the same packages you'd
install from npm.

## Quick Start

```bash
pnpm install
pnpm build:packages   # from the repo root — apps/sample consumes built dist output, not source
cd apps/sample
pnpm dev               # http://localhost:3200
```

## What This Is

This app serves three purposes:

1. **Public landing page** (`/`) — the marketing face of the Genesis project: value prop, feature
   highlights, an install snippet, and links to GitHub/npm/Storybook.
2. **Living showcase** (`/showcase`) — tokens, primitives, layouts, and the data/resource layer,
   each with generated prop tables and (where one exists) a Storybook link.
3. **Demo app** (`/dashboard`, `/items`, `/tasks`, `/orders`, `/settings`) — a small, realistic app
   built from the same components, showing them composed into real pages rather than only in
   isolation.

## Structure

```text
app/
├── app.css                      ← Theme tokens (swap brand preset here)
├── root.tsx                     ← Root layout, fonts, error boundary, anti-flash theme script
├── routes.ts                    ← Route configuration
└── routes/
    ├── _index.tsx               ← Marketing landing page (no AppShell chrome)
    ├── _layout.tsx              ← App shell (sidebar, mobile nav) for everything below
    ├── showcase._index.tsx      ← Showcase hub
    ├── showcase.tokens.*        ← Design tokens, sourced live from genesis-design-system
    ├── showcase.primitives.*    ← Every genesis-ui primitive/pattern + generated prop tables
    ├── showcase.layouts.*       ← Page templates (AppShell, DetailPage, ...) + layout primitives
    ├── showcase.data.*          ← The /data (resource/CRUD) layer
    ├── showcase.standards.tsx   ← Contribution and design doctrine, linked from this repo's docs
    ├── dashboard.tsx            ← Example: stats, kanban, activity list (PageHeader)
    ├── items.tsx                ← Example: CRUD list with ResourcePage (L1)
    ├── items-custom.tsx         ← Example: same page built manually (L2)
    ├── tasks.tsx                ← Example: modal detail, bulk actions (L1)
    ├── orders.tsx                ← Example: ResourcePage with field grouping (L1)
    ├── sandbox.tsx               ← Interactive ResourcePage configurator
    ├── design-system.tsx        ← Legacy all-in-one kitchen-sink reference (kept; see below)
    └── settings.tsx             ← Example: form-based settings page (PageHeader)
```

## The Customization Levels

| Page | What it demonstrates |
|------|---------------------|
| `/showcase` | Hub linking to tokens, primitives, layouts, data, and standards |
| `/dashboard` | PageHeader, StatCard, KanbanBoard, DataList — composing a dashboard from data components |
| `/items` | ResourcePage (L1) — full CRUD with table/grid/list views, search, sort, status filter, detail panel |
| `/items-custom` | L2 manual composition — same data, same features, built with DataPageShell + DataTable + DataFilters |
| `/tasks` | ResourcePage with `detail="modal"`, bulk actions with row selection, status filters |
| `/orders` | ResourcePage with field grouping and a 2-column form layout |
| `/sandbox` | Interactive ResourcePage configurator — toggle props live, copy JSX config |
| `/design-system` | Legacy single-page kitchen sink — every component with variants, in one scroll |
| `/settings` | PageHeader, form layout with Input, Select, Checkbox — settings/preferences pattern |

`/design-system` predates the `/showcase/*` catalog and duplicates some of what it now covers more
thoroughly (generated prop tables, Storybook links). It's kept rather than deleted — it's still a
fast, single-scroll overview, and it hasn't earned removal just because something more thorough
exists. New primitives should still be added under `/showcase/primitives`, not here.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Vite + React Router 7 (SPA mode) |
| UI | `@marktiderman/genesis-ui` (Shadcn/UI + Radix primitives) |
| Styling | Tailwind CSS 4 with Genesis theme tokens |
| Icons | Lucide React |
| Charts | Recharts, via `@marktiderman/genesis-ui`'s Chart wrapper |
| Toasts | Sonner, via `@marktiderman/genesis-ui`'s Toast wrapper |
| Forms | react-hook-form, via `ResourceForm` / `useResourceForm` |

## Adapting for Your Project

### 1. Update identity

- `package.json` — change name, description
- `root.tsx` — update page title, fonts
- `app.css` — swap theme tokens for your brand preset (see `@marktiderman/genesis-design-system` presets)

### 2. Update navigation

- `_layout.tsx` — change `navItems` (and the curated `mobileNavItems`) to match your app's routes
- `_index.tsx` — replace the marketing page with your own, or delete it and point `routes.ts`'s
  `index()` entry at `_layout.tsx`'s first child instead

### 3. Wrap with GenesisProvider

Your app root should be wrapped in `<GenesisProvider>` from `@marktiderman/genesis-ui/provider`
(re-exported from `@marktiderman/genesis-core`). This provides the data-provider context that
`ResourcePage`, `useResource`, and the other data hooks need. See `root.tsx` for the setup pattern —
this app uses `mock={{ datasets: {...} }}` for a zero-backend demo; a real app passes
`provider={createSupabaseProvider(supabase)}` instead.

### 4. Connect your data

Replace the mock datasets in `root.tsx` with a real provider — `createSupabaseProvider` ships from
`@marktiderman/genesis-core`, or implement the `DataProvider` contract yourself for any other
backend.

## Available Components

See [`docs/component-reference.md`](../../docs/component-reference.md) at the repo root for the
full, auto-generated export list across every package (`pnpm gen:component-reference` to
regenerate). The short version, for the subpaths this app uses most:

### Primitives (from `@marktiderman/genesis-ui`)

Button, Badge, Card, Input, Select, Checkbox, Dialog, AlertDialog, Sheet, Drawer, Popover, Tabs,
Tooltip, Progress, Skeleton, Separator, Command, CommandPalette, Toolbar, and 40+ more — browse them
all at `/showcase/primitives`.

### Layout (from `@marktiderman/genesis-ui/layout`)

AppShell, PageHeader, DetailPage, FormPage, DashboardPage, SettingsPage, Stack, Grid, Split,
Section, Container — browse them at `/showcase/layouts`.

### Data components (from `@marktiderman/genesis-ui/data`)

ResourcePage, ResourceDetailPage, ResourceForm, WizardForm, DetailPanel, StatCard, KanbanBoard,
DataList, DataPageShell, DataFilters, DataTable, DataGrid, DataBulkBar, FilterCombobox, ViewToggle,
ViewSettings, and the cell formatters (DateCell, NumberCell, CurrencyCell, BadgeCell) — browse them
at `/showcase/data`.

### Hooks (from `@marktiderman/genesis-ui/hooks`)

useDataFilters, useViewSettings, useKeyboardNavigation, useIsMobile, createPrefetch,
useViewPreference, useSavedViews, useResourcePage, plus the platform-agnostic useResource, useOne,
useResourceForm, and useWizard re-exported from `@marktiderman/genesis-core`.
