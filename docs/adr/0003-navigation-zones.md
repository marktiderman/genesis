# ADR 0003: Navigation zones

- Status: proposed
- Date: 2026-10-27
- Features: `feature-gate`, `entitlements`, `tenant-features`

## Context

Mark wants the apps to have zones: you enter a kind of work (the gym, coaching, your team) and the
navigation shows only that zone's destinations. A gym-only member should see the gym and nothing
else; a coach who also runs a gym switches between the two.

Genesis has part of this:

- `genesis-core/navigation` resolves a URL against a tree (`NavigationNode<T>`, `resolveNavigation`)
  and works on native as well as web. It has no gating, ordering or zones.
- `genesis-ui` `AppShell` renders that tree on the web, swapping the phone bottom bar to a section's
  own items. Its `headerSlot` is meant for a switcher, but none exists.
- `genesis-features` has the gate (`featureOn`, `GateSnapshot`, ADR 0001) and `BlockNavItem`
  (`id`, `label`, `path`, `icon`, `order`), which nothing consumes.
- Native has no navigation shell.

So each app writes its own. Growth90's web navigation (`src/lib/navigation.ts`) holds the
destinations, their `feature` and role checks, the order and the phone-tab priority. Its mobile app
hard-codes two tab sets (`apps/mobile/src/lib/tabs.ts`), the everyday tabs and admin mode, behind a
`useNavigation()` seam that waits for "Genesis's dynamic navigation config". Growth90's EOS plan asks
for the same thing: "navigation config that expresses sides, modules and per-organization
entitlements, so web and mobile derive both tab bars from it".

Admin mode on Growth90 mobile is already a zone in all but name: you enter it, it has its own tab
bar and a practice switcher, it remembers your choice, and Done leaves it.

## Decision (proposed)

### 1. A zone is a module: a top-level navigation item

Mark: "zones should be defined by the module or top level navigation item." There is no separate
list of zones. Every top-level item in the navigation tree is a zone, and the destinations under it
are that zone's navigation. Gym, Coaching, Team (EOS) and Admin are top-level items, so they are
zones. Entering one, whether by tapping it, following a link into it or switching to it, scopes the
navigation to its children. A module that turns on (`feature`, ADR 0001) brings its zone with it.

`defineNavigation(items)` in `genesis-core/navigation`, pure and platform-neutral, extends today's
`NavigationNode` tree:

```ts
interface NavItem {
  id: string;
  label: string;
  path: string;                        // a route, as resolveNavigation matches it
  icon: { lucide: string; sf?: string; md?: string };
  feature?: FeatureId;                 // checked with featureOn (ADR 0001); off hides the item and everything under it
  visible?: (viewer: Viewer) => boolean;    // roles and anything else app-specific
  order?: number;                      // among its siblings; lower first
  phone?: "tab" | "more" | "hidden";   // where it goes on a phone; default "tab", overflow to More
  children?: NavItem[];                // on a top-level item: the zone's navigation
  scope?: "login" | "tenant";          // top level only; "tenant": the zone is per practice, with a picker
}
```

- **Top level = zones.** `navigationFor` lists the top-level items a viewer has; these are the
  zones the switcher offers. The zone's landing page is its `path`.
- **Children = the zone's tabs.** Inside a zone, the phone tab bar and the sidebar show its
  children, gated and ordered.
- **A module declares its own zone.** A package's block contributes a top-level `NavItem` with its
  children (`BlockNavItem` becomes `NavItem`), so turning a module on adds its zone with no app
  wiring. The app's config orders the zones and can add destinations to a module's zone.

### 2. One resolver, gated by one snapshot

`navigationFor(config, gate: GateSnapshot, viewer, pathname)` returns:

- `zones`: the top-level items this viewer has, in order, after `featureOn` and `visible`;
- `zone`: the current one, decided by the path (the top-level item the path sits under);
- `tabs` and `more`: the current zone's children for a phone, after gating and ordering;
- `items`: the same for a sidebar;
- the `resolveNavigation` trail, parent and params, as today.

Web and native call the same function with the same snapshot, so a menu item and its route can't
disagree, and the phone tab bar on the web matches the native one.

### 3. Shells

- **Web** (`genesis-ui`): `AppShell` takes `navigation={resolved}`. A `ZoneSwitcher` goes in
  `headerSlot`.
- **Native** (`genesis-ui-native`, `genesis-native`):
  - `ZoneTabs` renders a zone as expo-router `NativeTabs`;
  - a `NavBarTitleMenu` switcher, the native title menu Growth90 already asked for in
    `docs/genesis-upstream.md`;
  - `useZone()`, which remembers the last zone per login, generalising Growth90's
    `src/lib/admin.ts`.

  Expo Router is file-based, so every destination a zone can show needs a route file. The shell
  resolves the zone's tab set before mounting, because native tabs remount when one is hidden or
  shown. Past four or five tabs, a "More" tab lists the rest.

### 4. Rules

- One zone means no switcher. A gym-only member never sees one.
- Deep links open in the zone their path belongs to.
- Zones gate navigation only. Routes still guard themselves with the same `featureOn`, and data
  stays guarded by row-level security.

## Consequences

- Growth90 replaces `src/lib/navigation.ts`'s gating and priority lists, and `apps/mobile`'s static
  tabs, with one config. Admin mode becomes the `admin` zone. Its local `resolveNavigation` goes,
  which also clears Genesis's reimplementation check.
- Gamify and other Genesis apps get zones for free, or a single implicit zone if they don't
  declare any.
- `BlockNavItem` becomes `NavItem` with `children`. It has no consumers, so it can be changed now.

## Open questions

1. Is Home a zone, or above the zones? Growth90's Today rolls up every practice and kind of work for
   the login (`docs/design/user-is-the-root.md`). Proposed: Home stays the roll-up and is always
   there; the others are focused workspaces.
2. Growth90's top-level items, and so its zones: proposed Home, Gym, Coaching, Team (EOS) and Admin.
3. Is a zone per login or per practice? Proposed: a zone can say `scope: "tenant"` (Admin, Gym for
   staff) and get a practice picker; members' zones are per login.
4. Should Growth90 ship a gym zone on mobile before this lands, built like admin mode, and move it
   onto the config later?
