# The Genesis Framework

What Genesis is, what belongs in it, and — just as importantly — what does not.

This is the contract. `docs/component-reference.md` is the inventory; this is the rule that
decides whether the next thing added to that inventory belongs there at all.

---

## What it is, in one sentence

**A layered contract stack — tokens → primitives → patterns → layouts → data-bound — where
each layer may only depend downward, and every concept has exactly one home.**

The goal is not "more components." It is **the least custom code per application**, across
many applications, without every application inheriting our maintenance burden.

---

## Why layering is the whole design

Genesis is meant to serve many projects, including projects we do not own. That changes the
arithmetic on every decision:

- A bug in a primitive is a bug in every consumer, and we cannot hotfix their deploys.
- A breaking change is a migration multiplied by the number of consumers.
- A concept with two implementations becomes two divergent implementations, on their
  schedule, not ours.

So layering is not filing tidiness. It is the mechanism that keeps those three costs bounded
as the consumer count grows, and it gives a stranger four honest entry points at four levels
of commitment:

| I want… | I take | I commit to |
|---|---|---|
| your look | tokens | nothing |
| your components | + primitives | React + Tailwind |
| your page structure | + patterns, layouts | our composition opinions |
| your whole app skeleton | + data-bound | our resource contract |

A consumer can stop at any rung. That is the product.

---

## The layers

| Layer | Job | Admission test | Leans on | Banned from it |
|---|---|---|---|---|
| **Tokens** | Values | Is it a value, not a component? | **nothing** | React, JSX, behavior |
| **Primitives** | One interaction | Does it do exactly one thing, with no domain vocabulary? | Radix · CVA · a focused third-party lib | Domain words, data fetching, layout opinions |
| **Patterns** | Compose primitives | Does it combine 2+ primitives into a recurring shape? | primitives only | Data fetching, routing |
| **Layouts** | Page structure | Does it position things without knowing what they are? | primitives, patterns | Domain, data |
| **Data-bound** | Bind to a resource | Does it need a resource contract to be useful? | TanStack Query · RHF + zod · adapters | Direct DB/HTTP outside an adapter |

### The test that does the most work

**Domain vocabulary.** A primitive that knows the words `onTrack`, `atRisk`, `engagement` or
`rock` is not a primitive — it is a pattern. This is the test that most often catches a
component filed one layer too low, and a component filed too low is how a second
implementation gets born: the next person needing that shape doesn't find it where they
look, so they write another.

---

## The rules

### 1. One home per concept

Before adding anything, **name the question it answers.** If an existing component answers
that question, extend it instead. `Badge` answers *"what colour is this?"* and `StatusBadge`
answers *"what does this business state look like?"* — different questions, so both may live.
Whereas root `EmptyState` and `/data` `EmptyState` answered the *same* question, which is why
one had to become a deprecated alias of the other.

### 2. Downward dependencies only

A primitive importing a pattern is a build error, not a review comment — the rule that stops
the layers fusing into mud. It is **not machine-checked today**:
`scripts/check-forbidden-imports.mjs` enforces a different rule (app code must not import raw
`react-native` primitives Genesis re-exports), and nothing inspects primitive→pattern or
pattern→layout direction. Step 4 turns this from an opinion into a gate.

### 3. Behavior belongs to Radix

Focus management, keyboard interaction, portals, ARIA relationships, dismissal — **Radix**.
Hand-rolling any of those requires a written justification in the file.

This is the inverse of how the package grew, and the cost is not theoretical: `Tooltip`
shipped `role="tooltip"` with no `id` and no `aria-describedby`, so a screen-reader user
focusing the trigger saw it open and heard nothing. Radix has done that association since day
one, along with the portal, collision detection, delay and dismissal ours still lacks.

### 4. Don't rebuild the ecosystem

Forms → `react-hook-form` + `zod`. Server state → `@tanstack/react-query`. Dates →
`date-fns` + `react-day-picker`. Toasts → `sonner`. Charts → `recharts`. Icons →
`lucide-react`. Command → `cmdk`.

Genesis's value is **composition and opinion**, not reimplementation. Every library we
re-implement is code we own across every consumer, forever.

### 5. Additive by default, one deprecation window

At many consumers a breaking change is many migrations. New capability ships additively;
removals ship as a deprecated alias that survives until the next major. The `EmptyState`
convergence is the reference implementation of this: source-compatible, visually changed,
documented as such.

### 6. A dependency is declared where it is imported

If `genesis-ui` doesn't import it, `genesis-ui` doesn't declare it. Duplicate declarations
across packages are the same overlap problem one level up, and they make every consumer
install things they never use.

---

## What is explicitly OUT

Naming the exclusions matters as much as the inclusions — scope creep is how overlap gets in.

| Out | Why | Where it lives instead |
|---|---|---|
| **Business domain** | EOS, coaching, engagements are one company's vocabulary | consuming apps |
| **Auth** | every org's is different | app; Genesis provides slots |
| **Routing** | router-agnostic is already a contribution gate | app |
| **Server-state config** | consumers own cache policy | app, via TanStack Query |
| **The data source** | this is the whole point of adapters | switchboard adapters |

The last one is load-bearing. **Adapters are what let a stranger plug in Postgres, Supabase
or REST and still get our pages.** Without that boundary, "use Genesis" means "use our
database", and the framework stops being adoptable.

---

## Current state, measured

Counted from the tree, not estimated. **Packages (7):** `genesis-design-system`, `genesis-ui`, `genesis-ui-native`, `genesis-core`,
`genesis-switchboard`, `genesis-cli`, `genesis` (umbrella).

**`genesis-design-system` has zero dependencies.** Pure values. That layer is already exactly
right and needs nothing.

**`genesis-ui` — 58 components in the primitive and pattern tiers** (since step 3: 51 in
`ui/`, 7 in `patterns/`, which `ViewToggle`/`ViewSettings` then joined from `data/`):

| Backing | Count | Notes |
|---|---:|---|
| Radix | 23 | all 21 declared Radix peers are genuinely imported — zero waste |
| Focused third-party | 8 | recharts, embla, vaul, react-day-picker, date-fns, input-otp, react-resizable-panels, sonner |
| Own code | 27 | mostly presentational, correctly so — plus three that shouldn't be |

**Known gaps, to be closed:**

1. ~~**Four layers live in two folders.**~~ Closed by step 3.
2. **Three own-code primitives carry behavior Radix already solves**: `tooltip`, `tabs`,
   `scroll-area`.
3. **Five declared peers are never imported** by `genesis-ui`: `@hookform/resolvers`,
   `@tanstack/react-query`, `@tanstack/react-table`, `react-dom`, `zod`. Three of the five are
   already correctly declared by `genesis-core`. Consumers install all five for nothing.
4. **No layout primitives.** No `Stack`, `Split`, `Section`, `Container` — so every
   consumer re-derives page scaffolding in app code.

---

## Target structure

```text
genesis-design-system     tokens          (unchanged — already clean)

genesis-ui
  ui/                     primitives      one interaction, no domain
  patterns/               patterns        compositions, no data
  layout/                 layouts         structure, no domain, no data
  data/                   data-bound      resource contract required

genesis-core              hooks, DataProvider, resource contracts
genesis-switchboard       adapters (supabase, jsonb, code)
```

Moving `AppShell`/`PageHeader`/`ViewToggle`/`ViewSettings` out of `data/` and `StatusBadge`/
`FormField`/`SettingsRow`/`ToggleRow`/`UserAvatar`/`PageLoading`/`EmptyState` out of `ui/` is
not cosmetic — it is what makes rules 1 and 2 enforceable by a script instead of by memory.

Two notes from executing this section against the actual source:

- **`ViewToggle`/`ViewSettings` were missing from the list**, and had to move. Neither touches
  a resource. `ViewSettings` composes three primitives; `ViewToggle` composes only `Button`,
  so the admission test alone would not have caught it. The binding reason is rule 2:
  `PageHeader` imports both, so leaving them in `data/` made the Layout tier depend on the
  data-bound tier — the exact violation this split exists to prevent.
- **`StatusBadge` moves, and an earlier revision of this document was edited to say it should
  not.** Recorded rather than quietly reverted, because editing the contract to match the
  implementation is the failure mode this document exists to prevent. The argument for keeping
  it consulted only the **Leans on** column and skipped **Banned from it**, which bans domain
  words from primitives — and the emphasized test below the layers table settles it: *"A
  primitive that knows the words `onTrack`, `atRisk`, `engagement` or `rock` is not a
  primitive — it is a pattern."* `status-badge.tsx` is typed as `"onTrack" | "atRisk" |
  "offTrack" | ...`, the only domain-carrying file among the 51 left in `ui/`. Failing the
  Patterns admission test does not make a component a primitive when the Primitives row bans
  what it carries. Domain vocabulary is banned from *primitives*, not from patterns (which ban
  data fetching and routing) — carrying it is part of what makes something a pattern.

---

## On Radix: adopt the unified package

`radix-ui@1.6.7` is a single package re-exporting all 34 public primitives, and **it replaces
21 peer declarations with one.** The main cost of leaning harder on Radix — a consumer install
list that grows with every primitive we adopt — does not survive that. It also makes version
skew impossible: one range instead of 21 independently drifting ones.

Available and not yet used (13). The ones worth taking:

| Primitive | Why |
|---|---|
| `tooltip` | replaces own-code missing portal, collision detection, delay, dismissal |
| `tabs` | replaces own-code missing roving tabindex, arrow/Home/End, `aria-controls` |
| `scroll-area` | replaces own-code; cross-browser scrollbar styling is genuinely miserable |
| `toolbar` | **new** — note this is a *primitive*, not a layout: Radix Toolbar owns roving tabindex and arrow/Home/End navigation, so it fails the layout test ("positions things without knowing what they are") and passes the primitive one |
| `visually-hidden` | **new** — screen-reader-only text, needed by every icon-only control |
| `accessible-icon` | **new** — the correct pattern for icon buttons |
| `password-toggle-field` | **new** — but Radix exports it as `unstable_PasswordToggleField` and calls the API subject to change. Adopt as `@stability Experimental` behind that name, or wait; do **not** ship it as Stable |

Deliberately **not** taken: `toast` (sonner is better DX and already adopted),
`one-time-password-field` (`input-otp` works), `progress` and `separator` (a `<div
role="separator">` does not need a dependency), `form` (our `form-field` + RHF is the
established doctrine), `menu` (low-level; `dropdown-menu`/`context-menu` already wrap it).

### The honest downsides

- **Bundle.** The unified package depends on all 55. Tree-shaking removes what is unimported,
  but a misconfigured bundler gets more than it uses; granular packages give a harder
  guarantee. Mitigated by keeping subpath exports so consumers import narrowly.
- **Migration.** 23 files change import path. Mechanical, but not free.
- **Version coupling.** One range means no pinning a single primitive back — in practice a
  benefit, but a real loss of granularity.
- **Maturity.** The unified package is younger than the granular ones it wraps. Low risk, not
  zero.

None of these outweighs collapsing 21 peers into 1 and closing three behavioral gaps.

---

## Layout tier

Two sub-tiers, and keeping them apart is what prevents the next overlap.

**Layout primitives** — unopinionated bones. No data, no domain, infinite reuse, zero
lock-in: `Stack`, `Grid`, `Split` (master-detail), `Section`, `Container`. Radix `Toolbar`
is **not** in this list — it carries keyboard behavior, so it belongs with the primitives; a
`Toolbar` *layout* that only handles spacing would be a separate, data-free composition.

**Page templates** — where the leverage is. Note the split: `AppShell` is a true layout
(structure, no data), while anything requiring a resource contract is **data-bound** and
lives in that layer. `ResourcePage` is the existing example — page-shaped, but it needs a
`DataProvider`, so it is not a layout.

**Listing a template here does not file it in this tier.** Each one is filed by the layers
table's admission test — *"does it need a resource contract to be useful?"* — and the answer
differs per template, so the tier is named per template rather than inherited from this
heading. This is the same correction `StatusBadge` earned in step 3, recorded under *Target
structure*: the layers table wins over the prose.

| Template | Needs a resource contract? | Layer | Ships from |
|---|---|---|---|
| `AppShell` | no — positions nav, header and content | layout | `genesis-ui/layout` |
| `PageHeader` | no — a title row plus list chrome | layout | `genesis-ui/layout` |
| `DetailPage` | no — positions header, content and a metadata column | layout | `genesis-ui/layout` |
| `FormPage` | no — positions header, fields, summary and an action bar | layout | `genesis-ui/layout` |
| `DashboardPage` | no — tiles and regions arrive as props | layout | `genesis-ui/layout` |
| `SettingsPage` | no — rows and their persistence are the app's | layout | `genesis-ui/layout` |
| `ListPage`, as `ResourcePage` | **yes** — lists a resource | data-bound | `genesis-ui/data` |
| `ResourceDetailPage` | **yes** — fetches a record by id | data-bound | `genesis-ui/data` |

Where a template has both a structure job and a binding job, it is **split** rather than
filed under whichever job is louder: `DetailPage` (layout) owns the shape, and
`ResourceDetailPage` (data-bound) binds `useOne` to it — the same pairing `AppShell` and
`ResourcePage` already have. An app with its own fetching gets the page shape without
inheriting the provider, which is the whole reason the rungs in the table at the top of this
document are separable.

Not every template earns a data-bound half, and the reason is per template rather than a
policy: `FormPage`'s already exists as `ResourceForm` (rule 1 — one home per concept),
`DashboardPage`'s would need an aggregate contract `genesis-core` does not ship, and
`SettingsPage`'s persistence is not a resource contract at all.

**No `AuthPage`** — auth is out of scope above, and a template that knows how you
authenticate would contradict that; Genesis provides the shell and the form primitives, the
app owns the flow.

**The target: a new app is shell + templates + a resource config.** Not dozens of
hand-assembled pages.

### Why templates need the contract first

Templates only pay off if the data layer conforms. A consuming app can hold hundreds of
`genesis-ui` imports and still hand-write every form, because `ResourcePage` needs a
`DataProvider` and the app has competing data patterns — the observed situation in
Breakthrough today.

Two different axes, worth not conflating. **Within the data-bound layer** the order is
contract → templates: a template is unusable until its contract exists. **Across the package**
the sequence below runs hygiene → primitives → layouts → templates, each step independently
shippable.

---

## Migration sequence

Ordered so that each step is independently shippable and none blocks on a decision that
hasn't been made.

1. **Dependency truth** — drop the five unimported peers from `genesis-ui`. Zero risk, and it
   makes rule 6 true before it is enforced.
2. **Unified Radix** — swap 21 granular peers for `radix-ui`. Mechanical, one range.
3. **Folder split** — `patterns/` and `layout/` become real; `AppShell`/`PageHeader` leave
   `data/`. Old subpaths stay as deprecated aliases per rule 5.
4. **Enforce layering** — extend the existing import-boundary script so rule 2 fails the
   build.
5. **Behavioral Radix adoption** — `tooltip`, `tabs`, `scroll-area`.
6. **New Radix capability** — `toolbar`, `visually-hidden`, `accessible-icon`,
   `password-toggle-field`.
7. **Layout primitives** — `Stack`, `Grid`, `Split`, `Section`, `Container`.
8. **Page templates** — `DetailPage`, `FormPage`, `DashboardPage`, `SettingsPage` as
   layouts, plus `ResourceDetailPage` as the data-bound half of the first. See the Layout
   tier table above for which template lands in which layer and why.

Steps 1–4 are structural and carry no visual change. Steps 5–6 are behavior changes. Steps
7–8 add public API. **Every step that changes a released package needs a changeset** with the
semver bump to match — additive surface is a minor, behavior change on existing API is a
minor on 0.x and a major on 1.x+, per the versioning policy.
