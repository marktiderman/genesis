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
  phone?: "tab" | "hidden";            // on a phone; default "tab", at most five per zone
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
- `tabs`: the current zone's children for a phone, after gating and ordering, at most five;
- `items`: the same for a sidebar;
- the `resolveNavigation` trail, parent and params, as today.

Web and native call the same function with the same snapshot, so a menu item and its route can't
disagree, and the phone tab bar on the web matches the native one.

### 3. Shells

- **Web** (`genesis-ui`): `AppShell` takes `navigation={resolved}`. A `ZoneSwitcher` goes in
  `headerSlot`.
- **Native** (`genesis-ui-native`, `genesis-native`), on Expo SDK 58 and expo-router 58 (checked
  against the installed source and the SDK 58 docs):
  - **Every zone is a root Stack screen with a real URL segment** (`/gym/…`, `/coaching/…`), holding
    its own `NativeTabs` and a Stack per tab. Admin mode already works this way. It can't be a
    route group shared between zones, because a cold deep link into a shared group picks the first
    group alphabetically, and Expo's docs advise against shared routes for showing different roles
    different screens. `NativeTabs` can't nest, so a zone can't live inside the Home tabs.
  - **`Stack.Protected guard={zones.gym} redirectTo="/"`** guards each zone in the root layout.
    `NativeTabs` has no `.Protected`.
  - **`ZoneTabs`** renders the zone. It resolves the tab set *before* mounting and doesn't change
    which tabs show, or their order, while the zone is on screen. `NativeTabs` keys itself on the
    visible tab names in order, so any change recreates the native tab bar and every tab's state.
    Badges, labels and icons can change freely.
    - If a feature turns off while a person is inside a zone, the tab becomes `disabled` and its
      screen explains why. `hidden` applies the next time they enter.
    - The switcher prefetches the zone's gate before navigating, so the loading state rarely shows.
  - **Switching zones** is `router.replace` to the zone's last tab, with a fade. `useZone()` keeps
    the last zone and tab per login, generalising Growth90's `src/lib/admin.ts`. Server data
    survives in the query cache. Keeping every zone mounted underneath is avoided, because
    `NativeTabs` renders every tab at once.
  - **Switcher UI.** SDK 58 has no native title menu: nothing exposes UIKit's `titleMenuProvider`.
    - The switcher is a labelled `Stack.Toolbar.Menu` (native UIMenu, stable since expo-router
      58.0.16) at the top left, showing the current zone's name, with a checkmark on the current
      zone.
    - On Android the same menu needs `@expo/ui`. Until Growth90 adds that, Android uses an action
      sheet.
    - The `NavBarTitleMenu` ask in Growth90's `docs/genesis-upstream.md` stays open for when the
      platform has it.
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
- **A practice is a picker inside a zone, not another zone**, like Shopify's store name or
  Mindbody's location toggle. That's `scope: "tenant"`.
- **Deep links open in the zone their path belongs to.**
- **Zones gate navigation only.** Routes still guard themselves with the same `featureOn`, and data
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
   there; the others are focused workspaces. The strongest apps (Notion, Slack, Asana) keep Home and
   Inbox the same in every workspace, as a queue of what needs you, and Airbnb's host Today is ordered
   by urgency.
2. Growth90's top-level items, and so its zones: proposed Home, Gym, Coaching, Team (EOS) and Admin.
3. Is a zone per login or per practice? Proposed: a zone can say `scope: "tenant"` (Admin, Gym for
   staff) and get a practice picker; members' zones are per login.
4. Should Growth90 ship a gym zone on mobile before this lands, built like admin mode, and move it
   onto the config later?
