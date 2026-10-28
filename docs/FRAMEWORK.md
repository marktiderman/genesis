# The Genesis Way

Why Genesis exists, how we decide where code goes, and the layered contract that decides what
belongs in Genesis at all. Read this before you build anything, in Genesis or in an app on it.

- **Part 1, the Genesis way:** the purpose, the decision rule (reuse, extend, invent), what
  counts as config and what counts as custom code, and how an invention moves up into Genesis.
- **Part 2, the layered contract:** the layers, the rules, and what is explicitly out.

`docs/component-reference.md` is the inventory. This document is the rule that decides whether
the next thing added to that inventory belongs there at all.

---

# Part 1 — The Genesis way

## The purpose

Genesis exists so that every app built on it writes as little custom code as possible.
Everything an app needs again and again lives in Genesis once, and every app reuses it. An app
configures what Genesis gives it, extends it where it needs to, and invents only what is truly
its own.

## In Mark's words

The rule below comes from this, as Mark put it:

> What is custom code? What's the difference between custom code and configuration?
>
> Anytime you are adding in with a slot, choosing a variant, or populating functions with variables
> and configuration, that should be called config. That's how I consider that config, and I still
> consider that no-code.
>
> Custom code is when we are recreating the header, or we're recreating a button, or rewriting
> something from scratch. Anytime we're writing something out that already exists somewhere else,
> or should exist somewhere else. That's why we have reuse, extend, invent.
>
> Think of it as: anytime we're doing full custom code, we're inventing something. And inventing is
> possible. Inventing is actually needed at times. That's how all this even started. Everything
> starts with an invention, but we just don't want to go there first.
>
> You want to ask, "Can we reuse first?" If so, do it. If we can't reuse what's already there, is
> there a way to extend it? Maybe we add a variant to it, or we add a different something to go work
> with a slot, or we create a component based on another component. If those don't work, then we
> invent it, and we first invent in the client app.
>
> Again, we still want to be wise about what we're writing, how we're writing our code, and being as
> clean as possible. At some point, we're going to say, "Oh, this actually would benefit us multiple
> times inside of our current client app." Then we would make it a component inside the client app.
>
> Let's just say there's something that one app needs that really doesn't need to ship to Genesis
> yet. It's a custom component for coaching your growth. The worksheet component really is: as we
> start dialing into that next, there's going to be some real power there that we might really
> customize for that app that never needs to go to Genesis.
>
> For instance, as we're building out the course builder and the lessons, as we decide, "Hey, we
> actually want a whole learning package inside of Genesis," then it makes sense to move that
> component all the way up to Genesis. Now we're actually inventing something inside of Genesis, but
> from now on, all the other client apps will be able to reuse that, possibly extend it, and then
> possibly invent.
>
> It's really the Genesis way, and it's what we're trying to do here: the purpose of Genesis.

## The rule: reuse, then extend, then invent

Ask these in order, every time, before writing code.

| ID | Principle | What it means |
|---|---|---|
| **G1 Reuse** | Can we reuse what's already there? If so, do it. | Use the Genesis component, hook, layout or provider as it is, configured with its props. |
| **G2 Extend** | If we can't reuse it, is there a way to extend it? | Add a variant, fill a slot, pass a function or configuration, or build a component based on another component. |
| **G3 Invent, in the app first** | If those don't work, invent it, first inside the client app. | Inventing is allowed and sometimes needed. Everything starts with an invention; we just don't go there first. |
| **G4 Promote when it pays** | When an invention would benefit us several times, give it a home one level up. | Used in several places in one app: make it a component inside that app. Wanted by many apps, or a capability Genesis decides to own (a learning package, say): move it into Genesis. |
| **G5 Never recreate** | Don't write out something that already exists somewhere else, or should. | Recreating a header, a button or a page layout is the one kind of code Genesis is here to remove. If Genesis lacks something you keep needing, that's a gap to raise, not a reason to rebuild it. |
| **G6 Be wise and clean** | Whatever we write, write it as cleanly as possible. | Config is still code people read. An invention is held to the same standard as Genesis itself. |

In reviews, cite the ID ("this recreates `PageHeader`, G5") rather than re-arguing the rule.

## Config or custom code

| It is… | When you… | Counts as custom code? |
|---|---|---|
| **Config** (no-code) | choose a variant, fill a slot, set props, pass functions, variables or configuration to a Genesis component, hook or provider, describe a resource, a form or a feature | No |
| **An extension** | build a component on Genesis primitives through their extension points (slots, variants, a wrapper that composes them) | No, as long as it doesn't recreate what it extends |
| **An invention** | write something new that doesn't exist anywhere yet, because reuse and extension didn't fit | Yes, and that's allowed: say why in the PR |
| **A recreation** | write out something that already exists in Genesis or another package, or should | Yes, and the target is zero |

**Measuring custom code.** An app's custom code is its inventions plus its recreations, never
its config. Track both, separately: inventions show where an app is genuinely its own (and
which might be worth promoting); recreations show where Genesis isn't being used, or has a gap.
`genesis doctor` already flags several kinds of recreation (raw HTML in place of Genesis
components, exports that shadow Genesis's, hard-coded colors), and the native rule pack flags
screens that don't use a Genesis screen layout. Each Genesis package also declares the
primitives it owns and the doctor enforces them in every app that installs it: data screens
that hand-build a list instead of a view rendered by `ResourceView` (and the app wrappers around
those tables), record pages that assemble their own header instead of `ResourceWorkspace`, and
direct data access (`supabase.from`, `.rpc`) in screens instead of the view and the resource's
provider. `genesis primitives` lists every such rule. To hold new code to them while old code
moves screen by screen, list them in `doctor.ratchet` and run the doctor with `--base` (a rule
its package declares `newOnly` ratchets without the list); otherwise existing findings stay
warnings, which `--strict` fails.

## Where an invention lives: the promotion ladder

| Rung | Where | When it moves up |
|---|---|---|
| **1 · In the feature** | inside the one screen or module that needs it | It would benefit the app in several places. |
| **2 · In the app** | an app component, built on Genesis primitives | More than one app wants it, or we decide Genesis should own the capability. |
| **3 · Genesis, experimental** | a Genesis package, marked experimental, with no stability promise | It has an owner, tests, accessibility and docs, and an app has replaced its own copy with it. |
| **4 · Genesis, stable** | a Genesis package, in the reference catalogue, checked by `genesis doctor` | — |

Some inventions stay on rung 2 forever, and that's right: a component made for one app's own
domain (a coaching worksheet, say) may never need to go to Genesis. Promote on purpose, not by
default. When something moves up, the app deletes its own copy in the same change.

When an invention moves into Genesis, it becomes something every other app can reuse, extend,
and only then invent around. That's the loop, and it's the point.

## How this stays true

- **In code review:** the pull request template asks what you reused and why extending didn't
  fit. Cite the principle IDs above.
- **In tools:** `genesis features find <term>` searches what exists before you build;
  `genesis doctor` flags recreations in apps; the repo's own lint rules guard Genesis.
- **For agents:** `AGENTS.md` (which `CLAUDE.md` loads) points every agent here first.
- **Changing this document:** it changes by pull request like code. Changing a principle needs
  Mark's sign-off and a line in the pull request saying what changed and why. Part 2 records
  its own corrections in place rather than quietly rewriting them; Part 1 does the same.

---

# Part 2 — The layered contract

What Genesis is, what belongs in it, and — just as importantly — what does not.

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

The one exception is form *products* (feedback, surveys, exercises, onboarding, intake):
`@marktiderman/genesis-forms` owns its state, because values, visibility, navigation and
validation there are one reactive graph that must also run on the server. CRUD forms
(`ResourceForm`) stay on `react-hook-form` + `zod`. See [FORMS.md](./FORMS.md).

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
| **Business domain** | an app's nouns (its kinds of customer, session, plan or engagement) are one company's vocabulary | consuming apps |
| **Auth policy** | every org's providers, sessions and sign-up rules are different | app. The sign-in screens are in: `AuthScreen` on native (assembled from `AuthBranding`, `SocialAuthRow` and `AuthForm`, each a slot), used with whatever auth the app runs |
| **Routing** | router-agnostic is already a contribution gate | app; genesis-ui ships thin per-router adapters on their own subpaths (`/router/react-router`, `/router/tanstack-router`), each router an optional peer |
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
`DataProvider` and the app has competing data patterns — a situation observed in a
real consuming app.

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
