# ADR 0003: Navigation zones

- Status: proposed
- Date: 2026-10-27
- Features: `feature-gate`, `entitlements`, `tenant-features`

## Context

Apps need zones: you enter a kind of work (classes, coaching, your team, admin) and the navigation
shows only that zone's destinations. A member who only books classes sees classes and nothing else;
a coach who also runs classes switches between the two.

Genesis has part of this:

- `genesis-core/navigation` resolves a URL against a tree (`NavigationNode<T>`, `resolveNavigation`)
  and works on native as well as web. It has no gating, ordering or zones.
- `genesis-ui` `AppShell` renders that tree on the web, swapping the phone bottom bar to a section's
  own items. Its `headerSlot` is meant for a switcher, but none exists.
- `genesis-features` has the gate (`featureOn`, `GateSnapshot`, ADR 0001) and `BlockNavItem`
  (`id`, `label`, `path`, `icon`, `order`), which nothing consumes.
- Native has no navigation shell.

So each app writes its own. A consumer app's web navigation holds its destinations, their feature
and role checks, the order and the phone-tab priority by hand. Its mobile app hard-codes two tab
sets, the everyday tabs and an admin mode, behind a seam that waits for a Genesis navigation config
from which web and mobile derive both tab bars. Its admin mode is already a zone in all but name:
you enter it, it has its own tab bar and a tenant picker, it remembers your choice, and Done leaves
it.

## Decision (proposed)

### 1. One config: zones and destinations

`defineNavigation({ zones, destinations })` in `genesis-core/navigation`, pure and
platform-neutral. The zones are an explicit list, and each destination lists the zones it shows in,
so one destination (an inbox, a roll-up of what needs you today) can sit in several zones.

```ts
type Audience = "self" | "member" | "staff" | "admin" | "platform";

interface AccessRule {
  feature: FeatureId;   // checked with featureOn (ADR 0001)
  audience: Audience;   // who it is for, checked in each scope the viewer has
}

interface Zone {
  id: string;
  label: string;
  path: string;                        // the zone's landing page
  icon: { lucide: string; sf?: string; md?: string };
  rule?: AccessRule;                   // default: the viewer has the zone when they have one of its destinations
  order?: number;                      // among the zones; lower first
  scope?: "login" | "tenant";          // "tenant": the zone is per tenant, with a picker
}

interface Destination {
  id: string;
  label: string;
  path: string;                        // a route, as resolveNavigation matches it
  icon: { lucide: string; sf?: string; md?: string };
  zones: string[];                     // the zone ids it shows in
  rule: AccessRule;
  parent?: string;                     // a destination id, for the trail and nesting
  order?: number;                      // within each zone; lower first
  phone?: "tab" | "hidden";            // on a phone; default "tab", at most five per zone
}
```

- **A rule is data, not a function.** `{ feature, audience }` is plain JSON, so the server checks the
  same rule a menu shows, a route guard reads it, and an agent or a settings screen can list who
  sees what. Anything a rule can't say belongs in the route's guard or in row-level security.
- **Audiences:** `self` is any signed-in viewer, for their own things; `member` anyone in the
  tenant; `staff` the tenant's staff; `admin` its admins and owners; `platform` platform admins.
  Within a tenant each includes the ones after it: a `member` rule also holds for staff and admins.
- **A rule holds** when the viewer has a scope where they hold the audience and `featureOn` says the
  feature is on there (shipped, its required modules on, not switched off by the tenant, paid for
  when it has `access: { plan }`). `self` and `platform` use the viewer's own scope.
- **A module declares its own zone.** A package's block contributes zones and destinations
  (`BlockNavItem` becomes `Destination`), so turning a module on adds its zone with no app wiring.
  The app's config orders the zones and can add destinations to a module's zone.

### 2. One resolver, gated by one snapshot per scope

`navigationFor(config, viewer, pathname)`, where the viewer carries their scopes and a
`GateSnapshot` for each:

```ts
interface Viewer {
  self: GateSnapshot;                  // the viewer's own scope
  platform: boolean;                   // platform admin
  scopes: { tenant: string; role: "member" | "staff" | "admin"; gate: GateSnapshot }[];
}
```

It returns:

- `zones`: the zones this viewer has, in order;
- `zone`: the current one, from the path (a destination in several zones keeps the zone the viewer
  is in);
- `tabs`: the current zone's destinations for a phone, after rules and ordering, at most five;
- `items`: the same for a sidebar;
- the `resolveNavigation` trail, parent and params, as today.

Web and native call the same function with the same snapshots, so a menu item and its route can't
disagree, and the phone tab bar on the web matches the native one.

### 3. Shells

- **Web** (`genesis-ui`): `AppShell` takes `navigation={resolved}`. A `ZoneSwitcher` goes in
  `headerSlot`.
- **Native** (`genesis-ui-native`, `genesis-native`), on Expo SDK 58 and expo-router 58 (checked
  against the installed source and the SDK 58 docs):
  - **Every zone is a root Stack screen with a real URL segment** (`/classes/…`, `/coaching/…`),
    holding its own `NativeTabs` and a Stack per tab. It can't be a route group shared between
    zones, because a cold deep link into a shared group picks the first group alphabetically, and
    Expo's docs advise against shared routes for showing different roles different screens.
    `NativeTabs` can't nest, so a zone can't live inside another zone's tabs.
  - **`Stack.Protected guard={zones.classes} redirectTo="/"`** guards each zone in the root layout.
    `NativeTabs` has no `.Protected`.
  - **`ZoneTabs`** renders the zone. It resolves the tab set *before* mounting and doesn't change
    which tabs show, or their order, while the zone is on screen. `NativeTabs` keys itself on the
    visible tab names in order, so any change recreates the native tab bar and every tab's state.
    Badges, labels and icons can change freely.
    - If a feature turns off while a person is inside a zone, the tab becomes `disabled` and its
      screen explains why. `hidden` applies the next time they enter.
    - The switcher prefetches the zone's gate before navigating, so the loading state rarely shows.
  - **Switching zones** is `router.replace` to the zone's last tab, with a fade. `useZone()` keeps
    the last zone and tab per login. Server data survives in the query cache. Keeping every zone
    mounted underneath is avoided, because `NativeTabs` renders every tab at once.
  - **Switcher UI.** SDK 58 has no native title menu: nothing exposes UIKit's `titleMenuProvider`.
    - The switcher is a labelled `Stack.Toolbar.Menu` (native UIMenu, stable since expo-router
      58.0.16) at the top left, showing the current zone's name, with a checkmark on the current
      zone.
    - On Android the same menu needs `@expo/ui`. Until an app adds it, Android uses an action
      sheet.
    - A native title menu stays a request for when the platform has one.
  - **iPad:** `sidebarAdaptable` (iOS 18+); `preferredPlacement` (iOS 27, expo-router 58.0.26+).

### 4. Rules

From Apple's tab bar guidance, Material 3, and how Slack, Notion, Salesforce, Airbnb, HubSpot,
Wodify, Mindbody and PushPress handle modules and roles:

- **Five tabs or fewer per zone, and no More tab.** Android throws on a sixth tab, and Apple's
  guidance says "Avoid overflow tabs". A module that needs more puts a sidebar on the web and iPad,
  and moves secondary pages into its screens.
- **Tabs don't move while you're in a zone.** Apple: "Don't disable or hide tab bar buttons." The
  tab set is decided on entry.
- **One zone means no switcher**, decided at sign-in. Gmail drops its tab bar when Chat and Meet are
  off, and Wodify members never see the coach toggle.
- **The switcher is visible and labelled with the current zone**, never only a swipe or a long
  press. Airbnb hosts report not finding the travelling/hosting switch, and mode slips are the
  known failure of modes (NN/g).
- **Each zone keeps its place.** Coming back lands on its last tab. Trainerize, which makes
  coaches log out to switch roles, is the cautionary tale.
- **A tenant is a picker inside a zone, not another zone**, like Shopify's store name or
  Mindbody's location toggle. That's `scope: "tenant"`.
- **Deep links open in the zone their path belongs to.**
- **Zones gate navigation only.** Routes still guard themselves with the same rule, and data stays
  guarded by row-level security.

## Consequences

- An app replaces its hand-written gating and priority lists, and its static mobile tabs, with one
  config. An admin mode becomes an `admin` zone, and a local `resolveNavigation` copy goes, which
  also clears Genesis's reimplementation check.
- Apps that declare no zones get a single implicit one.
- `BlockNavItem` becomes `Destination`. It has no consumers, so it can be changed now.

## Open questions

1. Is a zone per login or per tenant? Proposed: a zone can say `scope: "tenant"` (admin, or staff
   work in one tenant) and get a tenant picker; members' zones are per login.
