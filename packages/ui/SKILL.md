---
name: genesis-ui
description: Build web UI with the Genesis design system (@marktiderman/genesis-ui) — pick the right rung (pattern, slots, primitives, hooks), import by subpath, theme from a brand. Load before writing any page, list, form or dashboard on Genesis.
---

# genesis-ui

Genesis is a starting point, not a ceiling. **Reuse > Extend > Create**: before
writing a component, find the export that already answers the question, then
step down the ladder one rung — never off it.

## The ladder

Every pattern offers four rungs. Take the highest that fits.

**1 · The pattern** — the whole page, wired.

```tsx
<ResourcePage title="Questions" resource="questions" columns={["title"]} />
```

**2 · `slots` / `slotProps`** — keep the wiring, change one part. `null` ejects a part.

```tsx
<ResourcePage
  title="Questions"
  slots={{ filters: MyFilters, bulkBar: null }} // replace a part, or drop it
  slotProps={{ table: { className: "text-xs" } }} // or feed it more props — wins over ours
/>
```

**3 · The primitives** — compose the page yourself from Genesis parts.

```tsx
<DataPageShell title="Questions" filters={<DataFilters … />}>
  <DataTable … />
</DataPageShell>
```

**4 · The hook** — all of the logic, none of the markup.

```tsx
const page = useResourcePage({ … }); // state, paging, selection, sorting
return <WhateverYouWant {...page} />;
```

Dropping to rung 3 because one part was wrong re-derives wiring that was
already right; that re-derivation is where forks come from. Reach for rung 2
first. When the app hand-builds something Genesis nearly had, that is a bug
report against Genesis (`packages/ui/EXTENDING.md`), not a reason to fork.

## The layer contract (docs/FRAMEWORK.md)

1. Layers: tokens → primitives → patterns → layouts → data-bound; each depends downward only.
2. A primitive does one interaction and knows no domain words; a pattern composes primitives.
3. A layout positions things without knowing what they are; it carries no domain and no data.
4. Data-bound components need a resource contract (`DataProvider`); nothing else fetches.
5. Capability ships additively; removals ship as a deprecated alias until the next major.

## Reach for this first

| You need | Use | Import from |
| --- | --- | --- |
| App skeleton: nav, header, content | `AppShell` | `@marktiderman/genesis-ui/layout` |
| Page title row with count, view toggle, options | `PageHeader` (+ `options.configurable` for the in-header options popover) | `/layout` |
| List page chrome: header, filters, loading/empty/error | `DataPageShell` (`stats`, `filters` slots) | `/data` |
| A whole CRUD list page over a resource | `ResourcePage` | `/data` |
| Record detail side panel | `DetailPanel` | `/data` |
| Dashboard / settings / form / detail page shape | `DashboardPage`, `SettingsPage`, `FormPage`, `DetailPage` | `/dashboard-page`, `/settings-page`, `/form-page`, `/detail-page` |
| KPI tile | `StatCard` | `/data` |
| Table cells: dates, numbers, money, badges, links, thumbnails | `DateCell`, `NumberCell`, `CurrencyCell`, `BadgeCell`, `LinkCell`, `ThumbnailCell` | `/data` |
| Search, sort, filters, status chips/tabs, saved views | `DataFilters` | `/data` |
| Create/edit form bound to a resource | `ResourceForm` / `useResourceForm` | `/data` / `/hooks/*` |
| Nothing-here state with optional clear-filters | `EmptyState` | `/empty-state` |
| Settings list rows | `SettingsRow`, `ToggleRow` | `/settings-row`, `/toggle-row` |
| Cmd-K palette | `CommandPalette`, `useCommandPaletteHotkey` | `/command-palette` |
| Arrow-key list navigation | `useKeyboardNavigation` | `/hooks/use-keyboard-navigation` |
| Persisted page size / density | `useViewSettings` | `/hooks/use-view-settings` |

## Import rule

Import by subpath, never the root barrel in app code: `@marktiderman/genesis-ui/button`,
`/card`, `/data`, `/layout`. The root barrel drags every component and peer dependency into
the bundle. Hooks are `@marktiderman/genesis-ui/hooks/<file>` (e.g. `/hooks/use-view-settings`),
not `/hooks`. Never import from the legacy `@genesis/*` scope.

## Theming

Tokens come from `@marktiderman/genesis-design-system`. Build a `CanonicalBrand` once, then
`tailwindFromBrand(brand).css` emits the Tailwind v4 `@theme` block for the web app's
stylesheet; components reference only semantic tokens (`bg-primary`, `text-muted-foreground`),
never raw colours.

## Full inventory

`docs/component-reference.md` lists every export with its props and stability tag. It is
generated (`pnpm gen:component-reference`); do not edit it by hand.
