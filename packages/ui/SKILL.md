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

## ResourcePage knobs a real screen needs

Reach for these before a slot. Each one replaced a slot workaround in a real app.

| You need | Prop |
| --- | --- |
| Every row reachable in `resource` mode | default `pagination="client"` fetches up to `clientRowLimit` (1000) and says so past it; `pagination="server"` pages through the provider (give it `searchFields`); `pagination="cursor"` loads `resourceOptions.defaultPerPage` rows with a "Load more" button (keyset where the provider serves it; toolbar search and sort act on loaded rows) |
| Who may create, edit, delete | `can(action, item)` (UI gate only; the server still decides) |
| A confirmed delete | `allowDelete` (built in, `resource` mode), or `onDelete` + `confirmDelete`; copy via `confirmDelete={{ title: (item) => … }}`, toast via `onDeleted` |
| A computed peek subtitle | `getSubtitle(item)`; the peek stays open after an edit and shows the saved row |
| A list inside a tab (no page title) | `header="toolbar"` (also on `DataPageShell`) |
| Empty-state copy | `emptyMessage`, `emptyDescription`, `emptyIcon` |
| Cards on phones, table on desktop | `defaultView={{ mobile: "grid", desktop: "table" }}`; only an explicit toggle is stored |
| A list that updates when others change it | `live` (needs a provider whose `subscribe` serves the resource; Supabase: `resources[r].realtime` plus the table in the `supabase_realtime` publication, see core's README) |
| Typed slot maps | `ResourcePageSlots<T>`, `ResourcePageSlotProps<T>`, `ResourcePageSlotMap<T>` from `/data` |

`ResourceForm` ties labels to inputs (`getByLabelText` works), shows a failed save as an alert,
honours `maxLength` on text fields, adds no placeholder unless the field sets one (or
`autoPlaceholder`), and takes `prefillFromUrl={false}` when the page's query string is not form data.

`ResourceForm` also:

- puts a provider's field-level errors (`DataWriteError.fields`; the Supabase provider maps
  unique, not-null and foreign-key violations) on their inputs, with the summary in the alert;
- takes `warnWhenUnsaved` (default off): Cancel / Esc / outside click ask before dropping
  changes, and the tab's close or reload prompts;
- takes `mutationMode="optimistic" | "undoable"` (default `"pessimistic"`): the form closes at
  once and the cached list updates; `undoable` shows an Undo toast and sends the save after
  `undoDelayMs` (5000) unless undone. A failure puts the list back and is toasted. Needs a
  mounted `<Toaster />`. `ResourcePage` passes its own `mutationMode` to its form and deletes.
  The undo still works after the dialog closes. For a direct
  `useResource({ mutationMode: "undoable" })`, pass `onUndoable: showUndoToast` and
  `onError: showWriteErrorToast` (both exported from `/data`).

## Unsaved changes

Core never depends on a router. `useResourceForm` returns `isDirty` and `confirmLeave()`
(true when leaving is fine); `ResourceForm` reports both through `onDirtyChange`. For any
other state use `useUnsavedChangesGuard({ when })` from core. Wire `confirmLeave` to your
router's blocker:

```tsx
// React Router (data router, v6.4+ / v7)
import { useBlocker } from "react-router"; // "react-router-dom" on v6

const { form, isDirty, confirmLeave } = useResourceForm({ …, warnWhenUnsaved: true });
const blocker = useBlocker(isDirty);
useEffect(() => {
  if (blocker.state !== "blocked") return;
  if (confirmLeave()) blocker.proceed();
  else blocker.reset();
}, [blocker, confirmLeave]);
```

```tsx
// TanStack Router (v1)
import { useBlocker } from "@tanstack/react-router";

const { isDirty, confirmLeave } = useResourceForm({ …, warnWhenUnsaved: true });
// The hook already handles beforeunload, so the router's own is off.
useBlocker({ shouldBlockFn: () => !confirmLeave(), disabled: !isDirty, enableBeforeUnload: false });
```

With `ResourceForm`, keep the pair from `onDirtyChange={(dirty, confirmLeave) => …}` in state
and use it the same way.

## The layer contract (docs/FRAMEWORK.md)

1. Layers: tokens → primitives → patterns → layouts → data-bound; each depends downward only.
2. A primitive does one interaction and knows no domain words; a pattern composes primitives.
3. A layout positions things without knowing what they are; it carries no domain and no data.
4. Data-bound components need a resource contract (`DataProvider`); nothing else fetches.
5. Capability ships additively; removals ship as a deprecated alias until the next major.

## Reach for this first

| You need                                                      | Use                                                                                | Import from                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| App skeleton: nav, header, content                            | `AppShell`                                                                         | `@marktiderman/genesis-ui/layout`                                 |
| Sidebar, contextual nav, tab bar and back link from one tree | `AppShell navigation={tree}` (`NavigationNode`; `parentNavigation` to override)    | `/layout`                                                         |
| Page title row with count, view toggle, options               | `PageHeader` (+ `options.configurable` for the in-header options popover)          | `/layout`                                                         |
| List page chrome: header, filters, loading/empty/error        | `DataPageShell` (`stats`, `filters` slots)                                         | `/data`                                                           |
| A whole CRUD list page over a resource                        | `ResourcePage`                                                                     | `/data`                                                           |
| Record detail side panel                                      | `DetailPanel`                                                                      | `/data`                                                           |
| Dashboard / settings / form / detail page shape               | `DashboardPage`, `SettingsPage`, `FormPage`, `DetailPage`                          | `/dashboard-page`, `/settings-page`, `/form-page`, `/detail-page` |
| A builder's outline, editor and live preview columns          | `BuilderLayout` (no tabs, rail or header: those are the shell's)                   | `/builder-layout`                                                 |
| KPI tile                                                      | `StatCard`                                                                         | `/data`                                                           |
| The page around one publishable thing (a form, a course, a lesson): header, readiness chip, headline numbers, summary cards, follow-ups, settings with jump links, Share | `ResourceHeader`, `ReadinessChip`, `HeadlineNumbers`, `SummaryCard`, `FollowUpList`, `ResponsesToolbar`, `ResourceSettingsPage`, `SettingsSection`, `ShareDialog` (+ `readinessOf`, `dayLabel`, `prefilledUrl` on the server) | `/resource` (`/resource/rules`)                                   |
| Table cells: dates, numbers, money, badges, links, thumbnails | `DateCell`, `NumberCell`, `CurrencyCell`, `BadgeCell`, `LinkCell`, `ThumbnailCell` | `/data`                                                           |
| Search, sort, filters, status chips/tabs, saved views         | `DataFilters`                                                                      | `/data`                                                           |
| Create/edit form bound to a resource                          | `ResourceForm` / `useResourceForm`                                                 | `/data` / `@marktiderman/genesis-core/hooks`                      |
| Nothing-here state with optional clear-filters                | `EmptyState`                                                                       | `/empty-state`                                                    |
| Settings list rows                                            | `SettingsRow`, `ToggleRow`                                                         | `/settings-row`, `/toggle-row`                                    |
| Cmd-K palette                                                 | `CommandPalette`, `useCommandPaletteHotkey`                                        | `/command-palette`                                                |
| Arrow-key list navigation                                     | `useKeyboardNavigation`                                                            | `/hooks/use-keyboard-navigation`                                  |
| Reorderable list: drag, keyboard, row-menu moves             | `SortableList`                                                                     | `/sortable-list`                                                  |
| Formatted text (lessons, notes): editor and read-only view    | `RichTextEditor`, `RichText` (+ `sanitizeRichTextDoc`, `richTextToHtml` on the server) | `/rich-text-editor`, `/rich-text`                                 |
| Persisted page size / density                                 | `useViewSettings`                                                                  | `/hooks/use-view-settings`                                        |
| Client-side links, navigate, URL filters on your router       | `ReactRouterLink` / `TanStackRouterLink` and their `use…Navigate`, `use…SearchParams`, `use…ActivePath` hooks | `/router/react-router`, `/router/tanstack-router`                 |

## Builder columns

`BuilderLayout` lays out a builder (forms, courses, lessons): `outline` on the left, `editor` in
the centre (the only required slot), `preview` on the right. Container queries, so it follows
the space it is given: three columns from a 56rem container (13rem / editor / 20rem), wider side
columns from 76rem (16rem / editor / 24.5rem), the preview under the editor below 56rem, and
everything stacked below 34rem. Outline and editor alone: 13rem from 34rem, 16rem from 48rem.
The preview keeps its place in the tree, so swapping `editor` (another section, another selected
item) never remounts it; `previewHidden` hides it without unmounting and gives its column to the
editor. `sticky` pins the outline and/or preview (`{ preview: true }` for one), `scrollSticky`
gives a pinned column its own scroll, and `outlineLabel` / `previewLabel` make them `nav` /
`aside` landmarks. `outlineProps`, `editorProps` and `previewProps` pass a class or test id to
each wrapper.

It does not own tabs, the app rail or a header. A builder's sections go in `useAppShellSubNav`
(or your own tabs inside `editor`), its title, status and actions in `AppShellPageHeader`. To
keep one preview across sections, render one `BuilderLayout` around them and swap `editor`;
nest an outline-and-editor `BuilderLayout` inside a section that has an outline (genesis-forms-builder
does both).

```tsx
<BuilderLayout
  outline={<StepList />}
  outlineLabel="Outline"
  editor={<StepEditor key={selectedId} />}
  preview={<LivePreview />}
  previewLabel="Preview"
  sticky
/>
```

## Import rule

Import by subpath, never the root barrel in app code: `@marktiderman/genesis-ui/button`,
`/card`, `/data`, `/layout`. The root barrel drags every component and peer dependency into
the bundle. Hooks are `@marktiderman/genesis-ui/hooks/<file>` (e.g. `/hooks/use-view-settings`),
not `/hooks`. Never import from the legacy `@genesis/*` scope.

## Theming

Tokens come from `@marktiderman/genesis-design-system`. A Tailwind v4 web app imports, in
order: `tailwindcss`, then `@marktiderman/genesis-design-system/themes/genesis.css` (the
semantic variables), then `.../themes/genesis-tailwind4.css` (the `@theme inline` bridge that
turns them into `bg-primary`, `font-sans` and the rest, plus the `.dark` class variant). Do not
hand-write that bridge, and do not use `presets/tailwind`: it is a v3-shaped JS preset. Override
fonts or colours in an unlayered `:root` after the imports, not in `@theme`, since genesis.css
wins over `@layer theme`. `tailwindFromBrand(brand).css` adds brand ramps
(`--color-neutral-500` and the like) on top. Components reference only semantic tokens
(`bg-primary`, `text-muted-foreground`), never raw colours.

## Data views without hand-rolling

Reach for `ResourcePage` (with `data` for rows you already have) before composing DataTable,
DataGrid and DetailPanel yourself. The parts apps used to hand-roll are props:

- **Column widths:** `width: 180` is px, through a `<colgroup>`; the other columns share the rest.
  Long headers truncate and keep the full text as a tooltip.
- **Clickable cards:** with a custom `renderCard`, `openOnCardClick` makes the whole card one
  keyboard-reachable button that opens the detail. On a bare `DataGrid`, use `onItemClick` and
  `getItemLabel`. Never wrap a card in a `div role="button"`.
- **Permissions:** `can(action, item)` with `"create"`, `"edit"` or `"delete"` hides the New button or
  a row's Edit / Delete (a UI gate; the server still decides). `canEditItem`, `canEdit` and `canDelete`
  are deprecated aliases, still honoured.
- **Names and empty state:** `getTitle` / `getSubtitle` when a record's name spans fields;
  `emptyIcon`, `emptyMessage`, `emptyDescription` and `emptyState` (its action) for the empty list.
- **A list inside tabs:** `header="toolbar"` (on `ResourcePage` or `DataPageShell`) drops the title
  block and keeps the count, view toggle, filters and create button.
- **Shareable state:** `urlState={useReactRouterSearchParams()}` (or the TanStack / browser adapter) keeps
  the open record (`?id=`), search, sort and, with `pagination="server"`, the page in the URL. Back
  closes a record that was opened. A page that owns its own paging uses `useResourceUrlState`.
- **Non-destructive confirm:** `<AlertDialogAction variant="default">` for publish/send; red stays
  the default for deletes.

## A different layout over the same list

`useResourceTable(options)` (from `/data` or `/hooks`) is ResourcePage without its markup. It takes the
same options and returns:

- the rows (`page.data`) and paging (`currentPage`, `totalPages`);
- search, sort and filters (`handleSearchChange`, `handleSortSelect`);
- selection (`selectedIds`, `handleToggleSelect`);
- the open record (`handleRowClick`, `detailOpen`, `selectedItem`, `closeDetail`);
- the built-in form and delete state.

Build a board, a calendar or a custom card wall on it instead of re-deriving that wiring.
`ResourcePage` is this hook plus Genesis's markup.

## Big tables

`DataTable` runs on TanStack Table. Sorting compares numbers, dates and booleans by value. For a long
list without pages, `pagination={false} virtualize` renders only the rows in view (`virtualize={{ height }}`
sets the scroll box). `pinnedColumns={{ left: ["name"], right: ["actions"] }}` keeps columns in view
when scrolling sideways. Users can reorder columns by dragging a header or with Alt+←/→, and the order
is kept per device with `columnOrderKey`.

## Full inventory

`docs/component-reference.md` lists every export with its props and stability tag. It is
generated (`pnpm gen:component-reference`); do not edit it by hand.

## Rich text

`RichTextEditor` (`/rich-text-editor`, Tiptap 3) needs the optional peers
`@tiptap/core @tiptap/pm @tiptap/react @tiptap/starter-kit @tiptap/extensions` (`^3.31`). `RichText` and the
helpers on `/rich-text` need nothing beyond React and run on a server.

- **Store JSON, derive HTML.** `onChange(doc, details)` gives the document JSON (canonical) and lazy
  `details.html` / `details.text`. Persist `doc` (Postgres `jsonb`). If you also need HTML or text (email,
  search, previews), derive them on the server; never trust HTML or JSON a client posts.
- **Sanitize on the server on every write, with limits:**
  `const doc = sanitizeRichTextDoc(body.doc, { maxCharacters: 50_000, maxNodes: 5_000, onTooDeep: "throw" })`
  keeps only the allow-listed nodes (paragraph, h2-h4, lists, blockquote, bold/italic/underline,
  http(s)/mailto/tel/relative links, YouTube/Vimeo/Loom embeds by id). Over a limit, or nested more than 32
  levels, it throws `RichTextLimitError` (`reason`: `"characters" | "nodes" | "depth"`), so answer 413/422
  instead of storing it. Then `richTextToHtml(doc)` (`{ embedAs: "link" }` for email) and
  `richTextToPlainText(doc)`. Both run without a DOM and escape every value.
- **Render with `<RichText value={doc} />`**, not `dangerouslySetInnerHTML`. It re-sanitizes and works in
  server components. If you must inject stored HTML, inject only HTML you produced with `richTextToHtml`.
- The editor adds roughly 135 KB gzipped (ProseMirror + Tiptap), so load it only where people write:
  `const RichTextEditor = lazy(() => import("@marktiderman/genesis-ui/rich-text-editor").then((m) => ({ default: m.RichTextEditor })))`.
  Reading pages use `RichText`, which pulls in no editor code.
- Embeds are off by default: `<RichTextEditor embeds />`. A CSP needs `frame-src` for
  `https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com`. The editor injects no
  `<style>` tag (Tiptap's base rules are classes), so `style-src` needs no `'unsafe-inline'` for it.

```tsx
<RichTextEditor aria-label="Lesson text" value={doc} onChange={setDoc} placeholder="Write the lesson…" embeds maxLength={20000} />
<RichText value={lesson.body} />
```

## Wiring into an app

**Data provider and query cache.** If the app already has a TanStack `QueryClientProvider`,
mount `DataProviderRoot` inside it (or pass `queryClient` to `GenesisProvider`). Plain
`GenesisProvider` creates its own `QueryClient`, a second cache that app invalidations never
reach. On Supabase with RLS, configure `createSupabaseProvider(client, { binTables, resources,
onWrite })` instead of writing a local adapter: zero-row updates/deletes and Postgres error codes
come back as typed `DataWriteError` outcomes (`forbidden`, `gone`, `invalid`,
`unauthenticated`), recycle-bin tables count "gone from view" as success, and per-resource
`prepare` / `create` / `update` / `toFormValues` / `invalidates` cover RPC writes, form shapes and
related query keys. Branch on `isDataWriteError(e) && e.outcome`, never on the message. Details:
`packages/core/README.md`.

**Tailwind class scanning.** Tailwind v4 skips git-ignored paths such as `node_modules`, so genesis-ui's classes
are missing unless the app points at them. Import the shipped source entry — never hardcode an
`@source` path into `node_modules`:

```css
@import "tailwindcss";
@import "@marktiderman/genesis-ui/styles.css"; /* = @source over the package's dist/ */
```

**Router adapters.** genesis-ui never imports a router from its root or layer subpaths. Links default
to a plain `<a>` and navigation to a full page load until you inject an adapter. Take the shipped one
for your router; do not hand-write it. Each lives on its own subpath with its router as an optional
peer, so the other router is never installed or bundled.

```tsx
// React Router v7
import {
  ReactRouterLink,
  useReactRouterActivePath,
  useReactRouterNavigate,
  useReactRouterSearchParams,
} from "@marktiderman/genesis-ui/router/react-router";
// TanStack Router: the same four, named TanStackRouterLink / useTanStackRouter…,
// from "@marktiderman/genesis-ui/router/tanstack-router".

<AppShell linkComponent={ReactRouterLink} activePath={useReactRouterActivePath()} … />
<ResourcePage detail="route" onNavigate={useReactRouterNavigate()} … />
useDataFilters("orders", defs, { searchParams: useReactRouterSearchParams() });
```

The link takes Genesis's string `href` (`/admin?tab=users#top`) and keeps its query and hash; the
TanStack one parses the query with the router's own `parseSearch`, so `validateSearch` sees what a
typed `<Link search>` would give it. Genesis owns the active state: the adapters never add a
router's own `aria-current` or `active` class. Absolute URLs leave the app as plain anchors or a
document navigation. Next.js needs no adapter: pass `next/link` as `linkComponent`.

**Active nav items with `?query` / `#hash`.** Pass the full location as `activePath`
(`pathname + search + hash`, which `use…ActivePath()` above returns). Plain items still match on the path; an item whose `to` carries a
query or hash (`/admin?tab=users`, `/settings#profile`) is active only when those match too.
Do not write a custom `isActive` for this. `isPathActive(to, activePath, { end: true })` is the
exact-path variant.

**Hierarchical navigation — the default.** Describe the logical hierarchy once as a
`NavigationNode<NavItem>` tree and hand it to `AppShell` with the current location. AppShell
derives the global sidebar (the root's `items`), a contextual section (the current node's
`items`, `$param`s filled from the URL), the mobile tab bar (contextual items, else global) and
a back-to-parent link in the content header. `navItems`, `mobileNavItems` and
`parentNavigation={{ href, label }}` override a derived part; `parentNavigation={null}` hides the
link. Never put a back row in page content, never `history.back()`, never copy the resolver.

```tsx
import { AppShell, type NavigationNode, type NavItem } from "@marktiderman/genesis-ui/layout";

const navigation: NavigationNode<NavItem> = {
  id: "app", path: "/", label: "Home", items: globalItems, children: [
    { id: "projects", path: "/projects", label: "Projects", items: [], children: [
      { id: "project", path: "/projects/$projectId", label: "Project", items: [
        { to: "/projects/$projectId", icon: FileText, label: "Overview", end: true },
        { to: "/projects/$projectId/tasks", icon: CheckSquare, label: "Tasks" },
      ] },
    ] },
  ],
};

<AppShell appName="Acme" navigation={navigation} activePath={pathname + search + hash}
  linkComponent={RouterLink}>{children}</AppShell>
```

**Collapsible sidebar.** On desktop the sidebar collapses to an icon rail (56px;
`options.collapsedRailWidth: 64` for the wider one): the logo mark, one icon per item (name in a
tooltip on hover and focus), nested groups in a popover, and the expand button at the bottom.
The panel button beside the logo toggles it; `options.collapseShortcut: "["` adds an opt-in key
(skipped while typing, in a listbox/combobox/menu, or with a dialog open). Pass
`optionsStorageKey` (app-scoped, e.g. `"acme:app-shell"`) to remember the user's choice under
`${key}:collapsed`. A page asks to open collapsed with `defaultCollapsed: true` on its
`NavigationNode` (the nearest node in the trail that sets it wins) or `defaultCollapsed` on
`AppShell`; the user's own toggle always wins once they have used it, and "Reset to defaults" in
the sidebar options hands it back. `options.defaultCollapsed` is the app-wide default, and
`collapsed` +
`onCollapsedChange` make it controlled. The mobile drawer is unaffected.

```tsx
{ id: "builder", path: "/forms/$formId/edit", label: "Form builder", items: [], defaultCollapsed: true }
```

**Sub-navigation (a page's children).** A node's `items` are the current page's child items: a
form's Questions / Logic and endings / Responses / Settings. A node's items are `NavItem`s,
so each needs an `icon`. The hook (`useAppShellSubNav`) and the exported `SubNavTabs` take
`SubNavItem`s instead: a `NavItem` whose `icon` is optional. Without one, the sidebar and mobile
navigation show the label's first letter, and `SubNavTabs` shows the label alone. Each has `label`, `to` (a route, or a `?search` / `#hash`; active state follows the URL,
most specific sibling wins) and an optional `badge` (a count or short status, shown as a chip). Gate by role the same way as other items: filter the list before handing
it over.
For live data (badge counts) the page calls `useAppShellSubNav(items, { mode? })`, which
replaces the node's items while it is mounted, and puts a host chip at the end of the tab row with
`<AppShellSubNavEnd>…</AppShellSubNavEnd>`. The page's resource header (breadcrumb, title,
status, actions) goes in `<AppShellPageHeader>…</AppShellPageHeader>`, which the shell renders
above the tab row (on phones too; at the top of the content when there is no row). Both are
portals; when a layout and its page both mount one, the page's (innermost) renders, and the same
rule picks between `useAppShellSubNav` callers. Shell sub-navigation is opt-in through
`options.subNav`:

- `"section"` (default): exactly the pre-sub-nav shell. The children sit in a labelled section
  below the global sidebar items and replace the phone bar, with no back item.
- `"tabs"`: one row of navigation links across the top of the content, badges as chips, the
  current tab underlined in the brand colour, `aria-current="page"`.
- `"sidebar"`: nested under the active global item ("Forms"); a flyout from it on the rail.
- `"off"`: nothing, desktop or phone; draw your own (`SubNavTabs` is exported for that).

With `"tabs"` or `"sidebar"`, a page with children swaps the phone bar to a back item to the
logical parent ("Forms") plus the children and their badges; leaving the page brings the main
bar back. A node (`subNav` on `NavigationNode`, nearest in the trail wins), the `subNav` prop and
the page's hook override the option, in that order of strength (hook strongest), so one subtree
can opt in. With it on, a page's children also win over an app-wide `mobileNavItems` on that page;
in `"section"` / `"off"`, or on pages without children, `mobileNavItems` applies as before.

```tsx
useAppShellSubNav([
  { to: `/forms/${id}/edit`, label: "Questions", icon: ListChecks, badge: questions.length, end: true },
  { to: `/forms/${id}/edit/logic`, label: "Logic and endings", icon: GitBranch, badge: rules.length },
  { to: `/forms/${id}/edit/responses`, label: "Responses", icon: Inbox, badge: responseCount },
  { to: `/forms/${id}/edit/settings`, label: "Settings", icon: Settings },
]);
<AppShellSubNavEnd><Badge variant="success">Ready to publish</Badge></AppShellSubNavEnd>
```

For chrome outside AppShell, call the same resolver: `resolveNavigation(tree, pathname)` (from
`/layout`, `/data` or the root barrel) returns `{ current, parent, items, trail, params }` with
every path interpolated from the URL's params.

```ts
const nav = resolveNavigation(
  { id: "app", path: "/app", label: "Home", items: globalItems, children: [
    { id: "projects", path: "/dashboard", label: "Projects", items: [], children: [
      { id: "project", path: "/projects/$projectId", label: "Project", items: projectItems },
    ] },
  ] },
  pathname,
);
// pathname "/projects/p1/tasks" → nav.current.id "project", nav.parent.path "/dashboard",
// nav.params { projectId: "p1" }
```
