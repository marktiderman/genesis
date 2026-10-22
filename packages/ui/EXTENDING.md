# Extending genesis

Genesis is a starting point. If it ever becomes a ceiling, that is a bug in
genesis, not a reason to fork it.

**REUSE > EXTEND > INVENT** only works if extending is actually available. When
the only two options are "take the pattern exactly as shipped" or "rebuild it
yourself", every surface that needs one small difference takes the second, and
the design system stops being a system.

So every pattern component offers a **ladder**. You step down one rung — not
off — when a rung stops fitting.

## The four rungs

### 1 · The pattern

```tsx
<ResourcePage title="Questions" resource="questions" columns={["title"]} />
```

The whole page, wired. Take this when it fits.

### 2 · The pattern, with one part swapped — `slots` / `slotProps`

The rung that keeps you on the ladder. Keep every piece of wiring that was
already right, change the one part that was not.

```tsx
<ResourcePage
  title="Questions"
  // Replace a part. Yours receives exactly the props genesis would have
  // passed the default — so wrap the default, don't reimplement it.
  slots={{ filters: MyFilters }}
  // Or keep the part and pass it more props. Wins over ours.
  slotProps={{ table: { className: "text-xs" } }}
/>
```

**The eject button** is `null`:

```tsx
// Shell, filters and grid — no bulk bar. Selection still works; it just
// isn't shown. A pattern is a default, not a mandate.
<ResourcePage slots={{ bulkBar: null }} />
```

Every interior part a pattern composes is named in its slot map
(`ResourcePageSlotMap`). That map is the contract: **a part added to the
render tree gets added to the map in the same change**, otherwise the next
surface that needs it forks the page instead. (The delete confirmation,
`deleteDialog`, joined the map with the built-in delete.)

Type your slots with the exported types rather than reaching into the props:

```tsx
import type { ResourcePageSlots, ResourcePageSlotProps } from "@marktiderman/genesis-ui/data";

const slots: ResourcePageSlots<Practice> = { filters: null };
const slotProps: ResourcePageSlotProps<Practice> = { table: { stickyHeader: true } };
```

**Before writing a slot, check for the prop.** A slot that exists only to
compute a subtitle, gate Edit per row, confirm a delete, drop the title or
add an empty-state sentence is a slot genesis now owes you as a prop
(`getSubtitle`, `canEdit` / `canDelete`, `allowDelete` / `confirmDelete`,
`header="toolbar"`, `emptyDescription`) — and those exist.

### 3 · The primitives

```tsx
<DataPageShell title="Questions" filters={<DataFilters … />}>
  <DataTable … />
</DataPageShell>
```

75 subpath exports (`@marktiderman/genesis-ui/data`, `/button`, `/table`, …).
Compose the page yourself, with genesis's parts.

### 4 · The hook

```tsx
const page = useResourcePage({ … });   // state, paging, selection, sorting
return <WhateverYouWant {...page} />;
```

Nine hooks under `@marktiderman/genesis-ui/hooks`. All of the logic, none of
the markup.

## Which rung?

| You need to… | Rung |
| --- | --- |
| Ship a standard list page | 1 |
| Change one part, keep the rest | **2 — `slots`** |
| Drop a part you don't want | **2 — `slots={{ x: null }}`** |
| Add a class or a `data-testid` | **2 — `slotProps`, or `className`** |
| Lay the page out differently | 3 |
| Keep the behaviour, none of the look | 4 |

Dropping to rung 3 because one part was wrong means re-deriving all the
wiring that was already correct — and that re-derivation is where forks come
from. Reach for rung 2 first.

## The rules that keep this true

1. **Every pattern root takes `className`,** merged with `cn()`, never
   replacing its own layout.
2. **Every interior part is named in the slot map.** Unreachable parts are how
   a consumer ends up forking.
3. **`slotProps` wins over genesis's own value.** A hatch that silently loses
   to the default is not a hatch — the consumer sets the prop, sees nothing
   change, and goes back to forking.
4. **Prefer a data prop to an opaque `ReactNode` slot** for the ordinary case.
   `secondaryActions` exists because `actions: ReactNode` let every surface
   spend the header's action budget differently, and one of them blew it.
   Keep the `ReactNode` slot for genuinely arbitrary chrome.
5. **When a downstream app hand-builds something genesis nearly had, that is
   the bug report.** `ListPage`, a hand-rolled bulk bar and a forked header
   were each a missing prop away from not existing.

## Navigation: declare the tree, not the chrome

Rule 5 in practice. Apps kept re-deriving the same three things by hand: the
contextual nav for "where am I", the mobile tab bar for it, and a back row
placed inside page content. `AppShell` now derives all of them from one
`NavigationNode` tree, so the ladder for app navigation is:

1. **`navigation`** — pass the tree and `activePath`. The root's `items` are
   the global sidebar; the current node's `items` become a contextual section
   (and the mobile tab bar); its logical parent becomes the back link in the
   content header. `$param` segments in paths and item `to`s are filled from
   the URL, and a static segment beats a `$param` sibling.
2. **Override one part** — `navItems`, `mobileNavItems` or
   `parentNavigation={{ href, label }}` win over what the tree derives;
   `parentNavigation={null}` hides the back link.
3. **`resolveNavigation(tree, pathname)`** — the same resolver, for chrome
   outside AppShell.

Do not copy `resolveNavigation` or `NavigationNode` into an app, and do not
put a back row in page content or call `history.back()`. genesis-lint
(`scripts/check-navigation-reimplementation.mjs`) fails a local declaration of
either.
