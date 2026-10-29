# ADR 0004: Workspaces

- Status: proposed
- Date: 2026-10-28
- Features: `workspaces`, `app-shell`
- Related: ADR 0003 (navigation zones, proposed, #449): this ADR answers its per-login or per-tenant
  question. Zones follow the workspace (section 5).

## Context

A person who works in several organizations (a coach on staff at two gyms, an agency running
several clients' accounts) needs to know which one they are looking at. When an app's staff pages
list every organization's records together, it isn't clear where a new record goes, which
organization's settings are open, or whose clients a search covers.

Most multi-tenant products solve this the same way: you choose where you are working first, at the
top of the sidebar, and everything below it belongs to that choice. Slack, Linear, Notion and
Vercel do this, as do Shopify's store picker and Mindbody's location toggle.

Genesis has most of the parts:

- `ViewerScope` carries a `ResourceScope` (`{ orgId }`, `{ personId }`), and every view declared
  with `scope: ["org_id"]` already filters by it and fills it in on new records.
- `AppShell` has a `headerSlot` documented as the place for a "workspace picker", which doesn't
  exist yet.
- ADR 0003 leaves open whether zones are per login or per tenant.

So each app writes its own picker, its own way of reading the organization from the URL, and its
own wiring into the scope.

## Decision (proposed)

### 1. A workspace is where you are working, chosen first

A **workspace** is one of:

- a **tenant**: one organization the viewer belongs to;
- the **roll-up**: every tenant the viewer works in, seen together;
- **personal**: the viewer's own things, belonging to no tenant.

Apps add kinds (a location, a team) by augmenting `GenesisWorkspaceKinds`, and the switcher groups
and orders them like the built-in ones.

```ts
interface Workspace {
  id: string;
  kind: "tenant" | "rollup" | "personal"; // plus the app's own kinds
  label: string;
  description?: string;                   // a second line: the viewer's role there
  path: string;                           // "/o/acme", "/all", "/me": the prefix of every URL inside it
  scope: ResourceScope;                   // what every view reads: { orgId }, { orgId: [...] }, { personId }
  roles?: GenesisViewerRoles;             // the viewer's roles there, for view guards
  timeZone?: string | null;               // the scope's clock
  image?: string;                         // a logo; else initials, or the kind's icon
  badge?: string | number;                // a count or status beside it in the switcher
  theme?: { accent?: string };            // its brand: re-points --primary on its tile and row
  meta?: Record<string, unknown>;         // the app's own; Genesis never reads it
}
```

### 2. The URL says which workspace you are in

Every page inside a workspace sits under its `path`, so a link, a bookmark and the back button
each land in the right workspace. `workspaceAt(workspaces, pathname)` reads the current one,
matching at segment boundaries and preferring the longest prefix.

Switching is a link, not a state change. `workspaceHref` keeps the viewer's place when it makes
sense: between two workspaces of the same kind it keeps the section (`/o/acme/clients/42` →
`/o/globex/clients`), never a record that belongs to the old workspace. Between kinds it lands on
the new workspace's landing page. An app passes its own `keep` rule when it needs another.

The app's front door (a URL in no workspace) opens `defaultWorkspace`: the workspace the viewer was
last in on this device, if they still have it, else their first tenant.

### 3. One scope drives everything inside

`WorkspaceScope` replaces `ViewerScope` in an app with workspaces. It reads the workspace from the
URL and passes its `scope`, `roles` and `timeZone` to `ViewerScope`, so every list, form, count and
search under it is scoped with no screen code. It remembers the workspace per viewer, and gives the
switcher its list through `useWorkspace()`.

Scope narrows what a screen asks for. It never grants access: row-level security still decides
what comes back, as everywhere in Genesis.

### 4. The switcher

`WorkspaceSwitcher` (`@marktiderman/genesis-ui/layout`) shows the current workspace with its
picture and a second line, and opens a menu of the viewer's workspaces grouped by kind, the
current one checked. Its variants fill the shell's three places:

| Variant   | Where                                   | Shows                         |
| --------- | --------------------------------------- | ----------------------------- |
| `sidebar` | `AppShell headerSlot`                   | picture, name, second line    |
| `rail`    | `AppShell collapsedHeaderSlot`          | the picture, named for screen readers |
| `bar`     | `AppShell mobileHeaderSlot` (new)       | picture and name, in place of the app name |

It is always shown, even with one tenant, because personal is always there and the name tells
the viewer where they are.

Apps customize it without forking it, on the same ladder as every Genesis pattern (FRAMEWORK
G1, G2):

- **Props.** The group headings (`kindLabels`), the pictures (`kindIcons`), a badge per workspace
  (`Workspace.badge`, or `renderBadge`), a search box (`search`: on by itself past seven
  workspaces, matching the name and second line, `filterWorkspaces` in core), typed actions at the
  bottom (`actions`: `{ id, label, icon, href | onSelect, shortcut, disabled }`) and any other items
  (`footer`), and a controlled `open`.
- **Keyboard.** `shortcuts={{ open: "mod+shift+o", jump: true }}`: a configurable shortcut opens
  the menu, and ⌘1 to ⌘9 (Ctrl elsewhere; `jump: "alt"` for Alt, since browsers keep some of
  those for tabs) go straight to a workspace in the menu's order (`orderedWorkspaces`). Both are
  off by default. Only the switcher on screen answers, so the sidebar, rail and bar copies don't
  all fire, and a jump navigates through `onNavigate` (the router's navigate).
- **Styling by part.** Every element carries `data-scope="workspace-switcher"` and a
  `data-part` (`root`, `trigger`, `image`, `name`, `description`, `indicator`, `content`,
  `search`, `group`, `group-label`, `item`, `item-name`, `item-description`, `item-indicator`,
  `item-shortcut`, `badge`, `empty`, `separator`, `footer`, `action`), the anatomy Ark UI and Zag
  use, plus state attributes in Radix's style: `data-state="open|closed"`, `data-variant`,
  `data-kind`, and `data-current` on the current row (Radix adds `data-highlighted` and
  `data-disabled`). `classNames` adds Tailwind classes per part, so
  `classNames={{ item: "data-[current]:font-medium" }}` works without a stylesheet. This is the
  design system's styling, not a second one: colors stay the semantic tokens, and the two sizes
  apps tune are CSS variables (`--workspace-switcher-menu-width`, default 16rem, and
  `--workspace-switcher-image-radius`).
- **Brand per workspace.** A workspace's `theme.accent` goes through `workspaceThemeStyle`, the
  same contrast-checked `brandThemeStyle` public pages use, and re-points `--primary` on that
  workspace's tile and row. An app can put the current workspace's on its shell.
- **Slots.** genesis-core's `slots`/`slotProps` contract (Material UI's shape): replace or drop
  the `image`, `item`, `badge`, `empty` or `search` part, each receiving what the default would,
  or pass more props to a part, including the `trigger` button and the menu `content`.
  `renderImage`, `renderItem` and `renderBadge` are one-function shorthands and keep working.

### 5. Zones live inside a workspace

This answers ADR 0003's open question (per login or per tenant): zones follow the workspace. The workspace is chosen first; zones are resolved inside
it, over the scopes the workspace holds: one tenant's for a tenant, all of them for the roll-up,
the viewer's own for personal. A staff zone shows in a tenant workspace where the viewer is staff;
the personal zones show in the personal workspace. The switcher sits above the zone switcher in
`headerSlot`.

## Consequences

- An app replaces its own organization picker and URL parsing with a list of `Workspace`s and
  `WorkspaceScope`. Its views keep `scope: ["org_id"]` and need no change.
- Staff URLs move under a workspace path (`/o/$org/…`). An app moving to workspaces redirects its
  old URLs to the same page in the default workspace.
- `ResourceView` applies the scope itself (`scopeFilter`): each of the view's `scope` keys filters
  the list, a screen's own `filter` wins over it, and `scoped={false}` opts a list out. A roll-up's
  scope is a list of tenants (`{ orgId: [...] }`), so its lists show any of them, and a new record
  there asks which tenant it belongs to instead of starting in one.
- Native shells reuse `workspaceAt`, `workspaceHref` and `defaultWorkspace`, which have no DOM; the
  native switcher comes with ADR 0003's native shells.

## Later

- AppShell taking the current workspace's brand itself (today an app spreads
  `workspaceThemeStyle(current)` on its shell).
- A badge on the collapsed rail's picture when another workspace has one.
- Replacing the trigger itself through `slots` (today: `slotProps.trigger`, `classNames.trigger`
  and the `image` slot).
- Locations as a workspace kind or a filter inside a tenant.
