# ADR 0003: Navigation zones

- Status: accepted (web), proposed (native)
- Date: 2026-10-29 (proposed 2026-10-27)
- Features: `feature-gate`, `entitlements`, `tenant-features`
- Related: ADR 0004 (workspaces)

This is the spec for moving zone logic into Genesis. The web behaviour below shipped in a consumer
app, built on today's Genesis primitives; the native shells are still a proposal.

## Context

Apps need zones: you enter a kind of work (your own work, training, coaching, admin) and the
navigation shows that zone's pages. A member who only books classes sees classes and nothing else;
a coach who also runs classes moves between the two.

Genesis has the parts but not zones:

- `genesis-core/navigation` resolves a URL against a tree (`NavigationNode<T>`,
  `resolveNavigation`). It has no gating, ordering or zones, and works on native as well as web.
- `genesis-ui` `AppShell` renders that tree on the web, with nested `NavItem` `children` in the
  sidebar, `mobileNavItems` for the phone bar and a `headerSlot`.
- `genesis-features` has the gate (`featureOn`, `GateSnapshot`, ADR 0001) and `BlockNavItem`, which
  nothing consumes yet.
- Native has no navigation shell.

So each app writes its own gating, ordering and phone-tab priority by hand.

## Decision

### 1. A zone is a grouping over the resolved navigation tree

Zones are not a second navigation config. The app keeps one tree of destinations (each with its
route, parent and access rule, §2), resolves it for the viewer, and then lays zones over the
result: a map from each destination to the zone it sits in, or to `global`.

- **Zones** are an ordered list (`id`, `label`, `icon`). A destination sits in one zone; a zone
  may relabel a destination inside it (a training zone's "Today" reads "Workout").
- **Global pages** (messages, help, settings) sit outside the zones and show in every zone.
- **An optional roll-up** sits above the zones: one page of what needs the viewer now, across every
  zone and tenant. The zones are where they go deeper.
- **A zone shows only when it has a page for the viewer** after the rules, so access decides zones
  without a rule of their own. With one zone, its pages show at the top level and there is no
  switcher.
- **The current zone comes from the path**: the zone whose page is the longest match of the
  location. A page opened from a zone's list but living under another path (a lesson opened from a
  learning list) can be mapped back to that list.
- **Zones gate navigation only.** Routes guard themselves with the same rule, and data stays
  guarded by row-level security.

Because the grouping sits after resolution, `resolveNavigation`'s trail, parent and params are
unchanged, and an app with no zones keeps its tree as it is.

### 2. Access rules are data

Every destination names a rule, and the sidebar, the zones and the route guard all ask it, so they
can't disagree.

```ts
type Audience = "self" | "member" | "staff" | "admin" | "platform";

interface AccessRule {
  feature: FeatureId;   // checked with featureOn (ADR 0001)
  audience: Audience;   // who it is for, checked in each scope the viewer has
}
```

- **A rule is plain JSON**, so the server checks the same rule a menu shows, a route guard reads it,
  and an agent or a settings screen can list who sees what. Anything a rule can't say belongs in
  the route's guard or in row-level security.
- **Audiences:** `self` is any signed-in viewer, for their own things; `member` anyone in the
  tenant; `staff` the tenant's staff; `admin` its admins and owners; `platform` platform admins.
  Within a tenant each includes the ones after it: a `member` rule also holds for staff and admins.
- **A rule holds** when the viewer has a scope where they hold the audience and `featureOn` says
  the feature is on there (shipped, its required modules on, not switched off by the tenant, paid
  for when it has `access: { plan }`). `self` and `platform` use the viewer's own scope.

### 3. Zones per workspace

Which zones show depends on the workspace the viewer is in (ADR 0004 §5): zones resolve over the
scopes that workspace holds. Personal zones show in the personal workspace; a staff zone shows in a
tenant workspace where the viewer is staff, and in the roll-up over the tenants it holds. A tenant
is a workspace, never a zone, so a zone needs no tenant picker of its own.

### 4. Web (shipped behaviour, to upstream)

- **Sidebar:** the roll-up, then each zone as a top-level item with its pages as `children`, then
  the global pages. With one zone, its pages sit at the top level.
- **Phone bar** (`mobileNavItems`, at most five): in a zone, the roll-up, the zone's pages and
  settings, **always including the page you're on**: if it would fall past the fifth tab it takes
  the last zone slot. On the roll-up itself: the roll-up, each zone's first page and settings. A
  section with views of its own (a record's tabs, admin, settings) keeps showing those views.
- **Switcher:** the workspace switcher (ADR 0004) sits in `headerSlot` above the zones.

To upstream: the zone map and roll-up as data next to the navigation tree, a pure function in
`genesis-core/navigation` that returns `{ rollUp, zones, global, zone }` for a resolved tree and a
location, and helpers in `genesis-ui` that turn it into the sidebar and `mobileNavItems`.
`BlockNavItem` gains a zone so a module's pages land in its zone with no app wiring.

### 5. Native shells (still proposed)

On Expo SDK 58 and expo-router 58, checked against the installed source and the SDK 58 docs. The
native phone bar differs from the web one on purpose: native tab bars are recreated when their tab
set changes.

- **Every zone is a root Stack screen with a real URL segment**, holding its own `NativeTabs` and a
  Stack per tab. Not a route group shared between zones: a cold deep link into a shared group picks
  the first group alphabetically. `NativeTabs` can't nest.
- **`Stack.Protected guard={…} redirectTo="/"`** guards each zone in the root layout; `NativeTabs`
  has no `.Protected`.
- **Tabs don't move while you're in a zone.** `NativeTabs` keys itself on the visible tab names in
  order, so any change recreates the tab bar and every tab's state, and Apple's guidance is not to
  hide or disable tab buttons. The tab set is resolved before the zone mounts; if a feature turns
  off inside a zone its tab becomes `disabled` until the next entry. Badges, labels and icons may
  change.
- **Five tabs or fewer, no More tab.** Android throws on a sixth tab, and Apple says to avoid
  overflow tabs.
- **Switching zones** is `router.replace` to the zone's last tab; the last zone and tab are kept
  per login, and server data survives in the query cache.
- **Switcher:** a labelled `Stack.Toolbar.Menu` (native UIMenu) at the top left showing the current
  zone, with a checkmark on it; Android needs `@expo/ui` for the same menu, else an action sheet.
  It is never only a swipe or long press, since hidden mode switches are a known failure.
- **iPad:** `sidebarAdaptable` (iOS 18+).

## Consequences

- An app replaces its hand-written zone grouping and phone-tab priority with the Genesis function
  and its zone map; its tree, rules and route guards stay as they are.
- Apps that declare no zones are unchanged.
- `BlockNavItem` stays and gains a zone; it has no consumers, so it can change now.
- The proposal's open question (is a zone per login or per tenant?) is answered by ADR 0004 §5:
  zones resolve inside the workspace, and `scope: "tenant"` is dropped.
