# Genesis Starter

The reference app and project template for all Tiderman Ventures software. Clone this to start a new project, or run it to see Genesis components in action.

## Quick Start

```bash
pnpm dev    # http://localhost:3200
```

## What This Is

This app serves two purposes:

1. **Starter template** — the foundation you clone when creating a new project
2. **Living reference** — working examples of every Genesis pattern and component

When you start a new project, you clone this app, delete the example pages you don't need, and build your own routes on top of the same layout and component foundation.

## Structure

```text
app/
├── app.css              ← Theme tokens (swap brand preset here)
├── root.tsx             ← Root layout, fonts, error boundary
├── routes.ts            ← Route configuration
└── routes/
    ├── _index.tsx       ← Entry redirect → /dashboard
    ├── _layout.tsx      ← App shell (sidebar, mobile nav, content area)
    ├── dashboard.tsx    ← Example: stats, kanban, activity list (PageHeader)
    ├── items.tsx        ← Example: CRUD list with ResourcePage (L1)
    ├── items-custom.tsx ← Example: same page built manually (L2)
    ├── tasks.tsx        ← Example: modal detail, bulk actions (L1)
    ├── sandbox.tsx      ← Interactive ResourcePage configurator
    ├── design-system.tsx← Component showcase (all Genesis UI components)
    └── settings.tsx     ← Example: form-based settings page (PageHeader)
```

## The Two Modes

### Thin (for new projects)

Keep only what you need to start building:

- `_layout.tsx` — uses `<AppShell>` from `@genesis/ui-web`. Update the nav items for your app.
- `app.css` — swap the brand preset for your project's colors.
- `root.tsx` — update the title and fonts.

Delete `dashboard.tsx`, `items.tsx`, `design-system.tsx`, and `settings.tsx`. Create your own routes.

### Expanded (for learning / prototyping)

Keep all example pages to see Genesis patterns in action:

| Page | What it demonstrates |
|------|---------------------|
| `/dashboard` | PageHeader, StatCard, KanbanBoard, DataList — composing a dashboard from data components |
| `/items` | ResourcePage (L1) — full CRUD with table/grid/list views, search, sort, status filter, detail panel |
| `/items-custom` | L2 manual composition — same data, same features, built with DataPageShell + DataTable + DataFilters |
| `/tasks` | ResourcePage with `detail="modal"`, bulk actions with row selection, status filters |
| `/sandbox` | Interactive ResourcePage configurator — toggle props live, copy JSX config |
| `/design-system` | Every Genesis component with variants — buttons, badges, cards, dialogs, tables, kanban, filters, empty states, progress, tooltips |
| `/settings` | PageHeader, form layout with Input, Select, Checkbox — settings/preferences pattern |

## What Each Page Teaches

### Dashboard (`dashboard.tsx`)

**Pattern:** Compose a dashboard from Genesis data components.

- `StatCard` — metric display with icon, value, label, and trend indicator
- `KanbanBoard` — drag-and-drop task board with typed columns
- `DataList` — simple list with custom render function
- `Badge` — status/priority labels with semantic variants

**Customization level:** L2 (Component Composition) — custom layout built from Genesis components.

### Items (`items.tsx`)

**Pattern:** Data listing page with multiple view modes. This is the closest current example to what `<ResourcePage>` will provide at L1 when the data provider is built.

- `DataPageShell` — page header with title, count badge, action button, and view toggle
- `DataFilters` — search input, sort select, status chip filters
- `DataTable` — sortable columns with custom cell renderers and pagination
- `DataGrid` — switches between grid (cards), table, and list views
- `useViewPreference` — persists the user's preferred view mode to localStorage

**Customization level:** L2 (Component Composition) — when `<ResourcePage>` ships, this page could be reduced to ~10 lines at L1.

### Design System (`design-system.tsx`)

**Pattern:** Living style guide. Every Genesis component demonstrated with all variants.

22 sections covering: colors, typography, buttons, badges, cards, stat cards, inputs, dialogs, alert dialogs, data tables, data grids, data lists, kanban boards, page shells, filters, view toggles, empty states, progress bars, skeletons, tabs, separators, and tooltips.

Keep this page during development as a quick reference. Delete it before shipping to production.

### Settings (`settings.tsx`)

**Pattern:** Form-based configuration page.

- Card-based section layout with separators
- Input, Select, Checkbox components in a settings context
- Save action button

**Customization level:** L2 — straightforward form layout with Genesis primitives.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Vite + React Router 7 (SPA mode) |
| UI | @genesis/ui-web (Shadcn/UI + Radix primitives) |
| Styling | Tailwind CSS 4 with Genesis theme tokens |
| Icons | Lucide React |
| Charts | Recharts (available, not used in examples yet) |
| Toasts | Sonner (available, not used in examples yet) |

## Adapting for Your Project

### 1. Update identity

- `package.json` — change name, description
- `root.tsx` — update page title, fonts
- `app.css` — swap theme tokens for your brand preset (see `@genesis/design-system` presets)

### 2. Update navigation

- `_layout.tsx` — change nav items to match your app's routes

### 3. Build your pages

Start at **Level 1** (page layouts with config) when `<ResourcePage>` is available. Until then, follow the **Level 2** patterns shown in `items.tsx` and `dashboard.tsx`.

See the [Genesis Architecture Spec](../../docs/specs/2026-04-14-genesis-architecture.md) for the full four-level customization model.

### 4. Wrap with GenesisProvider

Your app root should be wrapped in `<GenesisProvider>` from `@genesis/ui-web`. This provides the data adapter context that `ResourcePage`, `useResource`, and other data hooks need to function. See `root.tsx` for the setup pattern.

### 5. Connect your data

Replace mock data arrays with your data layer:
- Supabase queries via TanStack Query (default)
- Or any data source — the components accept plain arrays

### 6. Stay in sync

Genesis framework files (standards, skills, hooks) sync weekly via PR. UI components update via:

```bash
pnpm update @genesis/ui-web @genesis/design-system
```

## What's Not Here Yet

These are planned and will be added as Genesis matures:

- Supabase auth scaffold — login, signup, session management
- Command palette — cmdk is installed but not integrated

## Available Components

### Primitives (from `@genesis/ui-web`)

Button, Badge, Card, Input, Select, Checkbox, Dialog, AlertDialog, Progress, Skeleton, Separator, Tabs, Tooltip

### Data Components (from `@genesis/ui-web/data`)

AppShell, PageHeader, ResourcePage, DetailPanel, StatCard, KanbanBoard, DataList, DataPageShell, DataFilters, DataTable, DataGrid, DataBulkBar, EmptyState, ViewSettings, ViewToggle, FilterCombobox

### Hooks (from `@genesis/ui-web/hooks`)

useDataFilters, useViewSettings, useKeyboardNavigation, useMobile, usePrefetch, useViewPreference, useResource, useOne, useResourcePage
