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
surface that needs it forks the page instead.

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
