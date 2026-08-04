# @marktiderman/genesis

## 0.5.0

### Minor Changes

- 1b79c34: Split `genesis-ui`'s components into the layers `docs/FRAMEWORK.md` names: `patterns/` and
  `layout/` become real folders alongside `ui/` (primitives) and `data/` (data-bound).

  **No component changed. No public export name changed.** This is a source reorganisation plus
  new export subpaths, so it is additive.

  **New subpaths.** `@marktiderman/genesis-ui/patterns` and `@marktiderman/genesis-ui/layout`,
  mirrored on the umbrella as `@marktiderman/genesis/ui/patterns` and
  `@marktiderman/genesis/ui/layout`. The umbrella half is not optional: the deprecation below
  tells consumers to move to `/layout`, and without it an umbrella consumer following that
  advice gets `ERR_PACKAGE_PATH_NOT_EXPORTED`, with no migration target short of taking a direct
  `genesis-ui` dependency — and would lose `AppShell`/`PageHeader` outright when the alias is
  removed at the next major.

  Note on the package root: `EmptyState`, `FormField`, `PageLoading`, `SettingsRow`,
  `ToggleRow`, `UserAvatar` and `StatusBadge` are exported from the root and stay that way.
  `AppShell`, `PageHeader`, `ViewToggle` and `ViewSettings` are **not** root exports — they were
  not before this change either — so the layer subpaths (or the deprecated `/data` alias) are
  the only way to reach them.

  | Moved                                                                                             | From               | To                     |
  | ------------------------------------------------------------------------------------------------- | ------------------ | ---------------------- |
  | `AppShell`, `PageHeader`                                                                          | `components/data/` | `components/layout/`   |
  | `ViewToggle`, `ViewSettings`                                                                      | `components/data/` | `components/patterns/` |
  | `EmptyState`, `FormField`, `PageLoading`, `SettingsRow`, `StatusBadge`, `ToggleRow`, `UserAvatar` | `components/ui/`   | `components/patterns/` |

  **One deprecation, no break.** `AppShell` and `PageHeader` keep working from
  `@marktiderman/genesis-ui/data` for one window per FRAMEWORK.md rule 5. Both now carry
  `@deprecated` + `@stability Deprecated` with a migration note pointing at `/layout`, and both
  leave `/data` in the next major. The six per-component subpaths (`/empty-state`,
  `/form-field`, `/page-loading`, `/settings-row`, `/toggle-row`, `/user-avatar`) keep their
  exact public names and simply resolve to the new location — nothing to migrate there.

  Those two aliases are exported as local bindings rather than `export { X } from "../layout/X"`,
  and that is load-bearing rather than stylistic: TypeScript does **not** attach a JSDoc
  `@deprecated` written above an `export ... from` statement to the symbol a consumer imports,
  so the re-export form shows no tag and no migration note on hover — the deprecation is
  invisible exactly where it has to be read. Only a local binding carries it into the emitted
  `.d.ts`. A test asserts this against the real build output through the TypeScript language
  service, so it cannot silently regress.

  **Accessibility, on the two components that changed layer.** `ViewToggle` now reports the
  active view with `aria-pressed` (previously conveyed by a colour variant alone) and gives each
  icon-only button an `aria-label`; `ViewSettings` labels its icon-only trigger and associates
  both Selects with their visible labels via `aria-labelledby` (a `<label>` cannot address the
  `<button>` Radix renders). No API change, no visual change.

  **Build integrity.** `packages/ui/scripts/check-exports-resolve.mjs` now runs after every
  `genesis-ui` build and fails it when an `exports` target does not resolve under `dist/` — the
  one class of breakage invisible to the build, the typecheck and the entire test suite, which
  surfaces only for consumers at runtime after install. `scripts/gen-exports.mjs` learned about
  the new layer folders in the same pass; before that, regenerating the export map would have
  silently deleted `./patterns`, `./layout` and all six relocated per-component subpaths.

  **Why it matters.** Rule 2 says dependencies only run downward: primitives to patterns to
  layouts to data-bound. Until each component sat in the folder its layer names, that rule could
  only be enforced from memory. Step 4 of the migration sequence makes the import-boundary script
  fail the build on a violation, and this split is what gives that script something to read.

  Two classification calls, both now recorded in `docs/FRAMEWORK.md`:
  - `StatusBadge` **moves to `patterns/`**. An earlier revision of this change kept it in `ui/`
    and edited `docs/FRAMEWORK.md` to match, arguing that it composes no primitive so the
    Patterns admission test does not admit it. That reasoning read only the layers table's
    **Leans on** column and skipped **Banned from it**, which bans domain words from primitives.
    `status-badge.tsx` is typed as `"onTrack" | "atRisk" | "offTrack" | "done" | "blocked" |
"inProgress"` — the contract's most emphasized test says in as many words that a primitive
    knowing `onTrack`/`atRisk` is a pattern. The public name and the `./status-badge` subpath
    are unchanged; only the folder and the `dist/` path move.
  - `ViewToggle`/`ViewSettings` **were not on the doc's list but had to move**. `PageHeader`
    imports both, so leaving them in `data/` would have made the Layout tier depend on the
    data-bound tier — the precise violation this split exists to prevent. (`ViewSettings`
    composes three primitives; `ViewToggle` composes one, so rule 2 rather than the admission
    test is what forces it.)

  **Deferred, deliberately:** `DatePicker` composes `Button`, `Calendar` and `Popover` — the
  only remaining file in `ui/` that imports 2+ sibling primitives, so the Patterns admission
  test arguably admits it too. Unlike `StatusBadge` it violates no _ban_, and step 4's
  import-boundary gate does not fail on same-layer imports, so nothing forces the call. It is
  left for a follow-up rather than batched into a change whose value is being provably
  behaviour-neutral.

  Step 3 of the migration sequence in `docs/FRAMEWORK.md`.

- 3eaf582: Add the layout tier — `Stack`, `Grid`, `Split`, `Section`, `Container` — under a new `components/layout/` folder, exported from the package root and from a new `@marktiderman/genesis-ui/layout` subpath. This is step 7 of the migration sequence in `docs/FRAMEWORK.md` and closes its known gap #4 ("No layout primitives… so every consumer re-derives page scaffolding in app code").

  **Minor, not major or patch:** the surface is purely additive. Five new components, one new export subpath, one new folder. No existing export changes shape, no existing component changes what it renders, and nothing is deprecated — a consumer who upgrades and imports nothing new sees an identical build. Per the versioning policy in `standards/upgrade-process.md`, additive surface is a minor.
  - **`Stack`** — one-dimensional flow. `direction` (`"row" | "column"`, default `"column"`), `gap`, `align` (`start | center | end | stretch`), `justify` (`start | center | end | between | around`), `wrap`. Replaces the `flex flex-col gap-4` / `flex items-center gap-2` strings every app retypes per file. `align`/`justify` are deliberately left undefaulted so a bare `<Stack>` emits no alignment utilities at all — defaulting them would put flexbox's own initial values into the DOM on every instance and beat a consumer's classes at equal specificity. The two unions are exactly native's `FlexAlign` / `FlexJustify`: web flexbox also has `baseline` and `space-evenly`, but native's Yoga vocabulary has neither, so offering them would break the cross-surface promise below. Since the props emit nothing when unset, `className="items-baseline"` reaches them with no class to fight.
  - **`Grid`** — two-dimensional flow for card and tile collections. `cols` (`1`–`6`), `gap`, `align`. `cols` is the count at the _widest_ breakpoint and emits a responsive ramp (`cols={3}` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`), so a card grid reflows without the consumer writing a breakpoint — and, more to the point, so two pages in the same app can't ramp at two different widths. `cols={6}` bottoms out at two columns rather than one, because a six-up is a row of small tiles and stacking those one-per-screen produces a page nobody scrolls to the end of.
  - **`Split`** — master-detail. `start`, `end` (both required), `ratio` (`"1/3" | "1/2" | "2/3"`, default `"1/3"`), `at` (`"sm" | "md" | "lg" | "xl"`, default `"md"`), `gap`. Below `at` it is a plain flex column — master first, detail after, which is the right reading order on a phone; at `at` and up it becomes a twelve-column grid and the panes take complementary spans. `flex-direction` is inert once `display: grid` applies, so the two modes never fight. Both panes carry `min-w-0` so an overflowing table or a long unbroken string can't blow out its track.
  - **`Section`** — a titled region: `title` (required), `description`, `actions`, `level` (`2 | 3 | 4`, default `2`), `headingClassName`. Renders a real `<section>` named by its own heading through `aria-labelledby` — the detail that actually turns it into a navigable landmark, since an unnamed `<section>` is announced as nothing at all. `level` drives both the semantic tag and the type scale, so the document outline and the visual hierarchy can't drift apart by accident. The header row collapses to a column below `sm` so a long title and an action button never fight over one line.
  - **`Container`** — the page gutter. `size` (`"sm" | "md" | "lg" | "full" | "prose"`, default `"lg"`) and `gutter` (default `true`). Five named widths, deliberately — a short list is what stops two pages ending up 4px apart for no reason. `gutter` is a real prop rather than a `className` override because the padding is responsive: passing `px-0` would cancel only the base step and leave `sm:px-6` / `lg:px-8` standing, so the escape hatch that looks like it should work silently doesn't. The three padding steps are the design system's own `spacing.page` token (1rem / 1.5rem / 2rem) expressed as utilities.

  **One layout vocabulary across web and native.** `Stack`, `Grid` and `Split` share a `gap` scale exported as `spaceScale` / `SpaceToken` / `GAP_CLASSES`, and its step names _and pixel values_ are exactly `@marktiderman/genesis-ui-native`'s existing `spaceScale` (`none` 0 · `xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `xl` 24 · `2xl` 32 · `3xl` 48). `gap="lg"` is 16px on both surfaces, and `align`/`justify` accept exactly native's `FlexAlign`/`FlexJustify`. Inventing a second, subtly-different web scale would have been the "one concept, two divergent implementations" failure `docs/FRAMEWORK.md` exists to prevent — and it would have surfaced as a design spec that produces two different pages depending on which package rendered it.

  The parity tests **import the native definitions directly** (`spaceScale`, `spacingClass`, `alignClasses`, `justifyClasses` from `packages/ui-native/src/components/layout/`) rather than comparing against a second hard-coded web-side copy. That distinction is the whole value: a copy cannot observe the other surface, so native could rename, re-value or drop a token with both suites green while `gap` silently diverged. Verified by mutating the native scale (`lg` 16px → 20px) and the native `FlexJustify` union and watching the web suite fail, then reverting. The import is test-only — both native modules are import-free token tables, test files are excluded from the tsup entries, and `genesis-ui` gains no dependency on `genesis-ui-native` at build or runtime.

  Note one intentional shape difference between the surfaces: native splits this into `Stack` (column) + `Inline` (row); on web the two are one component with a `direction` prop, which is the established web idiom. The `gap` / `align` / `justify` vocabulary is identical either way.

  **Layer discipline.** These sit in the Layouts tier, whose admission test is "does it position things without knowing what they are?" — so none of the five imports `@marktiderman/genesis-core`, references a resource, or fetches anything, and none of them imports a pattern or a data-bound component. They are also directive-free: no `"use client"`, so the whole `/layout` subpath stays importable from a React Server Component.

  Token-based Tailwind classes only (no raw hex, no arbitrary values), CVA for every variant, `forwardRef` + `displayName` + an exported `<Name>Props` on each, `testID` → `data-testid` per the package convention, a `data-slot` on every rendered node, and `className` merged through `cn()` throughout. 30 unit tests in `packages/ui/src/components/layout/__tests__/` pin the rendered structure and the emitted classes, including `Split`'s stacking — which lives entirely in responsive prefixes that jsdom never evaluates, so the assertions check that the prefixed classes are present and correctly paired with the requested breakpoint, and that the unprefixed grid classes are absent (an unprefixed `grid` would defeat the stacking entirely).

  `Section`'s `description` renders in a `<div>`, not a `<p>`. The prop is a `ReactNode`, so it can legitimately carry a list or a component with a block root — and a paragraph may not contain those. The browser reparents them out of the `<p>`, changing the DOM shape and hydration-mismatching for SSR consumers. Same call, same reason, as widening `Tooltip`'s bubble from `<span>` to `<div>`.

  **`@marktiderman/genesis`** (umbrella) gains matching `./ui/layout` and `./ui/patterns` subpaths, mirroring how `./ui/data` and `./ui/hooks` already re-export the granular package's layer barrels. Without them an umbrella consumer could not reach a layer barrel at all — they would have to install `genesis-ui` directly or pull the much wider `/ui` barrel — and the deprecation notice on `/data`'s `AppShell`/`PageHeader` re-export would have pointed umbrella consumers at a subpath that did not exist. Both are verified by importing the built artifact through Node's own `exports` resolution, not by reading `package.json`: a missing tsup entry fails no build, typecheck or test — the subpath simply 404s at runtime.

  No new dependencies, and no change to any existing component.

- 3da1131: Rebuild `Tooltip`, `Tabs` and `ScrollArea` on Radix. These were the last three
  primitives in the package still hand-rolling behavior — open/close, focus,
  keyboard, ARIA relationships, scrollbars — that `docs/FRAMEWORK.md` rule 3
  ("behavior belongs to Radix") says Genesis should not be maintaining across
  every consumer.

  **Every existing prop, export and type stays source-compatible** — no call site
  needs editing to compile. Two optional props are **added**, and one of them
  exists because a behavioral change needed an escape hatch:

  | Added                    | On           | Why                                                                                                                      |
  | ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
  | `delayDuration?: number` | `Tooltip`    | Pointer-hover delay, default `0`. New capability the CSS version could not offer.                                        |
  | `viewportProps?`         | `ScrollArea` | Addresses the inner viewport — the element that now actually scrolls. This is the typed answer to the `ref` break below. |

  `Tabs` additionally gains `orientation`, `dir` and `activationMode` as
  pass-throughs, by virtue of being Radix's `Tabs.Root` now.

  What changes beyond that is what these three render and how they respond to a
  keyboard, a screen reader and a pointer.

  🔴 **This is a major.** `docs/README.md` fixes breaking changes at major for
  1.x+, and `docs/FRAMEWORK.md`'s migration sequence spells out the rule for
  exactly this step: "behavior change on existing API is a minor on 0.x and a
  major on 1.x+". Nothing here is source-incompatible — no call site needs
  editing to compile — but correct, working code can stop working, and the
  specific ways are listed per component below. The headline ones:
  - **`ScrollArea` no longer scrolls on the element you have a ref to.** Scroll
    moved to an inner viewport, so `ref.current.scrollTop = 0` silently does
    nothing now. Anything that scrolls a log, a chat pane or a long list to the
    bottom programmatically needs the viewport instead — pass
    `viewportProps={{ ref }}` (new, see below).
  - **`Tabs` selects on `mousedown`, not `click`.** Real pointer use is
    unaffected (mousedown precedes click), but `fireEvent.click(tab)` in a test
    no longer changes tabs. This repo's own tab tests had to change.
  - **`Tooltip`'s bubble does not exist in the DOM until it opens**, and when it
    does it opens into a portal on `document.body`. Selectors, snapshots and
    `getByRole("tooltip")` calls that assumed an always-present bubble inside the
    wrapper will fail.

  **Why `@marktiderman/genesis` (the umbrella) also bumps.** It declares
  `"@marktiderman/genesis-ui": "workspace:*"` — an exact pin at publish — and
  re-exports that surface, so it inherits this package's semver obligations even
  though its own source is untouched. Changesets would otherwise bump it a patch
  purely because a workspace dependency moved (`updateInternalDependencies:
"patch"`), and a `^0.4.x` consumer would take a `genesis-ui` major
  automatically. The umbrella is on 0.x, where this repo ships breaking at minor.
  #387 makes the same correction for the major that already merged; this entry is
  here so the guarantee does not depend on the two landing in the same release —
  changesets bumps a package once per release, from the changesets that release
  consumes, so an entry attached to a different release does not cover this one.

  **Install note:** `radix-ui` (the unified package — one range in place of the
  21 granular `@radix-ui/*` declarations) is a new **required** peer dependency,
  in line with every other Radix peer this package declares. All three components
  import it at module scope and the root barrel re-exports all three, so it is
  needed by any import of `@marktiderman/genesis-ui` and cannot honestly be
  optional.

  ***

  ### `Tooltip`

  Backed by Radix `Tooltip`. The old implementation was CSS-only: a `group`
  wrapper whose bubble was `hidden` and revealed by `group-hover:block` /
  `group-focus-within:block`. That is a surprising amount of missing behavior for
  seven lines of Tailwind — no portal (so an `overflow:hidden` ancestor clipped
  the bubble), no collision detection (so it ran off-screen near a viewport
  edge), no dismissal, no delay, and an `aria-describedby` link that had to be
  hand-wired with `useId` + `cloneElement`.

  What it gains: a portal, viewport collision handling, a configurable pointer
  delay, Escape/scroll/blur dismissal, and Radix's own trigger ↔ bubble ARIA
  association.
  - **`content` stays `ReactNode`** and the bubble stays a `<div>` with
    `whitespace-nowrap` — unchanged from the previous release, including the
    caveat that rich content does not soft wrap on its own.
  - **New `delayDuration` prop**, defaulting to `0`. Radix's own default is
    700ms; inheriting that on upgrade would read as the tooltip having broken,
    so the instant-on-hover feel of the CSS version is preserved and the delay
    is opt-in. Keyboard focus is never delayed either way.
  - **`aria-describedby` is now Radix's**, with one shim kept. Radix sets
    `aria-describedby` on the trigger while open and renders the bubble with the
    matching `id` and `role="tooltip"`, so the manual `useId` + `cloneElement`
    pass is gone. What Radix does _not_ do is compose: `Slot` merges child props
    _over_ slot props for every attribute that isn't `className`, `style` or an
    `on*` handler, so a trigger that already carried `aria-describedby="hint"`
    would have silently dropped the tooltip's id — reintroducing exactly the
    silence CMT-367-003 fixed. A small wrapper unions the two instead. The
    association is now correctly absent while the tooltip is closed, rather than
    pointing at a hidden element.
  - 🟡 **The trigger child must be a single element that forwards its ref to a
    DOM node.** Radix anchors and instruments the child directly (`asChild`), so
    a function component that swallows `ref` will not position or open properly.
    Bare text, a **fragment**, or several children get a `<span>` wrapper instead
    — a fragment needs catching explicitly, because `React.isValidElement(<>…</>)`
    is `true` and `Slot` would otherwise clone the fragment rather than the DOM
    node inside it, dropping every handler and the ref so the tooltip never opens.
    That span deliberately gets no `tabIndex`, since a text trigger was never a
    tab stop and inventing one would renumber a consumer's tab order. It is also
    therefore still unreachable by keyboard: pass a focusable element if that
    matters.
  - **Theme scope travels with the portal.** `GenesisThemeProvider` scopes
    mode-specific CSS variables under a `[data-theme="…"]` wrapper, and a portal
    lands the bubble on `document.body` — outside it, where `bg-foreground` /
    `text-background` would resolve against the light `:root` values and a dark
    app would render a light tooltip. The bubble now mirrors the nearest
    ancestor's `data-theme` onto itself, read at open time so a runtime theme
    toggle is picked up. Mirroring rather than re-parenting the portal is
    deliberate: portalling into the themed element would put the bubble back
    inside the very `overflow:hidden` container the portal exists to escape.
    Consumers without a themed ancestor get untouched markup.
  - **The new entrance animation respects `prefers-reduced-motion`.** The CSS-only
    implementation had no motion at all, so the fade/zoom/slide is new; it ships
    with `motion-reduce:animate-none motion-reduce:transition-none` rather than
    running unconditionally, per `design-opinions.md` ("premium motion on by
    default; reduced-motion respect handles accessibility").
  - 🟡 **The bubble is portalled to `document.body`.** It is no longer a sibling
    of the trigger, and no longer in the DOM at all while closed. The wrapper
    `<div>` survives with `group relative inline-flex` — it is where `className`
    and the rest of `HTMLAttributes<HTMLDivElement>` still land — but positioning
    no longer comes from it, so `side` is now Radix's `side` (subject to
    collision flipping) rather than a fixed set of absolute-position utilities.

  ### `Tabs`

  Backed by Radix `Tabs`. The old implementation was a React context and a row of
  plain `<button>`s: selection worked and nothing else did. It shipped no
  `tablist` / `tab` / `tabpanel` roles, no `aria-selected`, no
  `aria-controls`/`aria-labelledby` pairing, one tab stop per trigger, and no
  Arrow / Home / End navigation — i.e. none of the WAI-ARIA tabs pattern beyond
  the click handler.

  What it gains: the full role and ARIA wiring, a roving `tabindex` so the whole
  tablist is one tab stop, Arrow/Home/End movement with wrap-around, disabled
  triggers skipped during navigation, automatic activation on arrow, and
  Enter/Space activation. `defaultValue` stays required, and `value` /
  `onValueChange` keep working for controlled use; `orientation`, `dir` and
  `activationMode` come along as new optional pass-throughs.
  - 🟡 **Activation moved from `click` to `mousedown`** (Radix's choice, so the
    panel is already swapped by the time the button releases). Users notice
    nothing; synthetic `fireEvent.click(tab)` in tests stops selecting.
  - 🟡 **Each visible panel is now focusable (`tabIndex=0`)** per the ARIA
    pattern, and the triggers collapse into a single roving tab stop. Tab order
    changes in both directions — keyboard-driven E2E flows through a tabbed page
    will need re-recording.
  - 🟡 **Active styling is now `data-[state=active]:` variants** rather than
    classes applied from a JS boolean. Visually identical (`bg-background`,
    `text-foreground`, `shadow-sm`), but every trigger now carries the same class
    string and the attribute decides, so a test asserting
    `classList.contains("bg-background")` on the active trigger fails.
  - Radix adds `id`s, `aria-controls`, `data-state` and `data-orientation` to the
    rendered nodes. DOM snapshots of a tabbed page will churn.

  ### `ScrollArea`

  Backed by Radix `ScrollArea`. The old implementation was one `overflow-auto`
  div plus a stack of `::-webkit-scrollbar` pseudo-element rules — a WebKit-only
  vocabulary, so Firefox ignored every one of them and drew the OS scrollbar
  instead. The "design system scrollbar" was a Chrome/Safari-only promise.

  What it gains: a real scrollbar element with the same thumb in every browser,
  draggable, with the hover and transition styling the rest of the system uses,
  plus a corner element when both axes scroll. `orientation` keeps its exact
  meaning — Radix derives the viewport's `overflow-x`/`overflow-y` from which
  scrollbars are mounted, so `"vertical"` still clips horizontally and vice
  versa. `type` is exposed and defaults to `"auto"` (scrollbar present exactly
  while the content overflows, which is what `overflow-auto` did) rather than
  Radix's own `"hover"`.
  - 🔴 **Programmatic scrolling on the root ref stops working.** The root is now
    `overflow: hidden` and the scrolling element is an inner
    `[data-radix-scroll-area-viewport]`. Setting `scrollTop` / calling
    `scrollTo()` / reading `scrollHeight` on the element `ref` gives you the
    root, which never scrolls. This is silent — no error, just nothing moves.
    **New `viewportProps` prop** is the typed way through:
    `viewportProps={{ ref: viewportRef }}`, then use `viewportRef`.
  - **`onScroll` is routed to the viewport for you.** It would otherwise be the
    same failure in handler form, and a worse one, because there is no ref to
    notice: `scroll` events do not bubble, so an `onScroll` left on the root
    would never fire once and infinite-loading or scroll-position UI would break
    in silence. `onScrollCapture` goes with it. Everything else — `className`,
    `style`, `id`, `role`, `aria-*`, `data-*`, bubbling handlers — still lands on
    the root, which is the component's box and their right owner. Props that must
    address the scroller and are not auto-routed (a `tabIndex`, an `id` for
    `aria-controls`) go through `viewportProps`.
  - **`nonce` is routed to the viewport too.** Radix injects the `<style>` that
    hides the native scrollbar from `Viewport` and reads a nonce only there; on
    the root the prop was accepted (React's `HTMLAttributes` declares it) and
    inert, so under a strict `style-src 'nonce-…'` policy the rule was blocked and
    the native scrollbar appeared alongside the custom one.
  - 🟡 **Content is nested two levels deeper**, inside the viewport and then a
    `min-width:100%; display:table` wrapper Radix uses for horizontal sizing.
    Consequences worth checking: a direct-child selector (`.my-scroller > .row`)
    no longer matches, a child with `height: 100%` no longer resolves against the
    scroller, and flex children of the old container are no longer flex children
    of anything.
  - 🟡 **Scrollbar appearance changes on non-WebKit browsers** — Firefox users
    were getting the native scrollbar and now get the styled one. That is the
    point, but it is a visible change.

  ### All three
  - All three now carry `"use client"`. They were already interactive; Radix
    makes that explicit, and the build stamps the directive so a Next.js server
    component can still import them. Expect them in the client bundle.
  - Wired for the unified `radix-ui` package rather than granular
    `@radix-ui/react-*` entries — see the install note above — and marked
    external in the build so nothing gets inlined into our chunks.
  - 39 new/rewritten tests cover the behavior each one gained: tooltip opening on
    focus, dismissing on Escape, portalling out of its wrapper, and unioning the
    caller's own `aria-describedby` while open; Arrow/Home/End movement,
    wrap-around, disabled-skipping and roving `tabindex` for tabs; viewport,
    scrollbar and per-orientation overflow for scroll area.

- 149a734: Bump the umbrella to a **minor** so it does not deliver `genesis-ui`'s breaking
  change inside a patch range.

  `@marktiderman/genesis` depends on `@marktiderman/genesis-ui` as `workspace:*`,
  which pnpm rewrites to an **exact** version at publish time, and it re-exports
  that package's surface. `genesis-ui` is going to **2.0.0** — it now requires the
  unified `radix-ui` peer in place of 21 granular `@radix-ui/react-*` peers.

  Changesets was going to bump the umbrella 0.4.10 → **0.4.11** on its own: a
  patch. A consumer holding the ordinary `"@marktiderman/genesis": "^0.4.10"`
  would therefore pick that up automatically and receive `genesis-ui@2.0.0` with
  it — and, under pnpm or Yarn Classic, no `radix-ui` in their tree. Every
  migrated component would then fail to resolve it at runtime, from a version
  range that promised nothing would break.

  On 0.x this repo ships breaking changes at **minor** (`docs/README.md`), so the
  umbrella goes to **0.5.0**. That is the version signal a `^0.4.x` range is
  supposed to stop at.

  The rule this makes concrete: **a package that exact-pins and re-exports another
  package inherits that package's semver obligations.** The umbrella's own source
  did not change here — its dependency's contract did, and that is enough.

### Patch Changes

- Updated dependencies [4d02f31]
- Updated dependencies [86a6515]
- Updated dependencies [9412ff4]
- Updated dependencies [1b79c34]
- Updated dependencies [3eaf582]
- Updated dependencies [e1e5b94]
- Updated dependencies [3da1131]
- Updated dependencies [beaa503]
- Updated dependencies [2e0dcb3]
- Updated dependencies [1766706]
- Updated dependencies [bb33975]
- Updated dependencies [847e93a]
- Updated dependencies [e1e5b94]
  - @marktiderman/genesis-ui@2.0.0
  - @marktiderman/genesis-design-system@1.2.0
  - @marktiderman/genesis-core@1.1.1

## 0.4.10

### Patch Changes

- Updated dependencies [b4de53f]
  - @marktiderman/genesis-switchboard@2.0.0

## 0.4.9

### Patch Changes

- Updated dependencies [c3d1c7e]
  - @marktiderman/genesis-core@1.1.0

## 0.4.8

### Patch Changes

- Updated dependencies [2ef8730]
  - @marktiderman/genesis-ui@1.3.0

## 0.4.6

### Patch Changes

- a1e3f92: genesis-data: `init` now publishes the two-way GITDATA.md doctrine to `data/GITDATA.md`, reaching
  parity with `genesis-sync.sh`'s harness path. Follow-up to PR #292 (which taught the harness to
  vendor `data/GITDATA.md` to a tenant's root as a read-only, tenant-scoped projection) — a
  Codex finding on that PR (CMT-292-008) noted the npm package's own `init` scaffold only ever
  shipped `schema/` + `templates/`, so a tenant installed via `npx @marktiderman/genesis-data init`
  alone (never running the harness sync) never received the doctrine at all.

  `scripts/collect-assets.mjs` now bundles the canonical `data/GITDATA.md` verbatim into a new
  `doctrine/` package asset (alongside the existing `schema/` + `templates/`, same anti-fork
  re-derive-at-pack-time discipline — fails loud if the canonical source is missing). `scaffold()`
  publishes it with the identical shape genesis-sync.sh produces: the doctrine body verbatim, under
  a generated read-only header naming this tenant's own CORE tables (scoped from the same
  `distribution.yml` `core:` list the harness itself reads — package and harness banners are
  scoped identically, no parity gap). Refreshed every run, same as every other contract file
  (`inherit, never fork`: a hand-edited tenant copy is overwritten on the next `init`). A pre-parity
  install (bundled with no `doctrine/GITDATA.md`) degrades gracefully — a loud warning, no thrown
  error, schema/templates still publish.

  New optional `ScaffoldSummary.doctrinePublished` field (optional for the same source-compat
  reason as `demotedRemoved`/`demotedKept`: a required member would be source-breaking for any
  consumer that mocks the type in a patch release).

- Updated dependencies [a1e3f92]
  - @marktiderman/genesis-data@0.3.3

## 0.4.5

### Patch Changes

- fc38b88: Harden `genesis-sync.sh`'s tenant install path and ship the plugin's slash-commands surface
  (`.claude/commands`) to vendored tenants — previously the sync's `SURFACES` list omitted it
  entirely, so a tenant install could look successful while shipping zero commands (card 11094).

  This changes what the plugin/marketplace distribution actually contains (new commands surface,
  a hardened `.claude-plugin` manifest), so per [the Claude plugin version-management
  docs](https://code.claude.com/docs/en/plugins-reference#version-management) it needs its own
  version bump — `/plugin update` skips a re-fetch when `plugin.json`'s version is unchanged, which
  would otherwise leave already-installed fleets running the stale commandless plugin even after
  this fix merges (Codex review on PR #291).

  Also: preflight all `REQUIRED_SURFACES` against the source clone before mutating the tenant's
  `$DEST` at all, so a doomed sync (missing/malformed required surface) aborts cleanly instead of
  partially overwriting some surfaces before the abort fires.

## 0.4.4

### Patch Changes

- 209ca2d: Five more findings surfaced by CodeRabbit reviewing Gamify's genesis-harness re-vendor
  (gamify-platform PR #881, round 3), confirmed present in this repo's own current main:
  - `scripts/harness/readiness.py` `parse_pr_arg()`: `/pull/(\d+)` had no boundary after the digits,
    so trailing garbage (`/pull/881oops`) still resolved to PR 881. Now requires a `/`, `?`, `#`, or
    end-of-string right after the number.
  - `scripts/harness/obligation-check.py`: an unparseable `--stale-days` value raised an unhandled
    `ValueError` traceback instead of the clean usage-error pattern already used for `--today`.
  - `scripts/harness/slugs.py` / `glossary.py`: broke a circular import (`slugs -> glossary ->
slugs`) by extracting the shared `TERM_HEADING` regex into a new dependency-neutral
    `glossary_terms.py` that both modules import from.
  - `scripts/harness/genesis` (dispatcher help text): notes bun/pnpm/yarn as alternatives to npm for
    bootstrapping a tenant, matching README.md's and genesis-sync.sh's existing phrasing.
  - `skills/alignment/SKILL.md`: the frontmatter `description` was silently out of sync with the
    file's own body (which already says Batch 1 is `N = max(10, count of closed-hand Values)`, never
    a hard 10-item cap) — description updated to match; `data/skills/` digest regenerated.

  Two more findings from the same round were investigated and rejected as stale/false-positive on
  the actual current code (not applied):
  - `data/_schema/tables/library.yml`'s `sprint` FK `pending: true` is intentional, not leftover —
    Gamify (the real consumer this targets) has zero real `library`/`sprint` rows today, so
    un-pending now would repeat the `conversations.yml` mistake in reverse (see PR discussion).
  - `skills/alignment/references/frame-dimensions.md`'s "Stack — pnpm" line accurately describes
    Genesis's own current stack (`packageManager: pnpm@9.15.4`, `pnpm-lock.yaml` present) — Gamify's
    bun mandate is a Gamify-repo convention, not Genesis's own.

- 209ca2d: Four more findings surfaced by Codex reviewing Gamify's genesis-harness re-vendor
  (gamify-platform PR #881, round 4), confirmed present in this repo's own current main:
  - `scripts/harness/readiness.py` `run()`: a WARN (GitHub still computing mergeability, or
    re-review ordering can't be confirmed because the head commit date didn't load) was silently
    counted as a PASS in both the printed verdict and the `--ci` exit code — an operator could read
    "READY (operator-mergeable)" and `--ci` exit 0 even though a condition's own evidence said "not
    confirmed." Warns now block the unqualified READY verdict and `--ci` exits 1 on any WARN, same as
    a FAIL.
  - `scripts/harness/readiness.py` `findings_dir_tally()`: a CMT row with an unrecognized status
    (typo like `fixedd`, or an unsupported one like `resolved`) was neither in the addressed nor
    unaddressed set, so it silently satisfied rl-2 as if addressed. Now checked against the
    `ADDRESSED` whitelist directly — anything outside it counts as unaddressed.
  - `scripts/harness/readiness.py` `is_tracked()`: used `git ls-files --error-unmatch`, which checks
    the INDEX, not HEAD — a `git add`ed-but-not-yet-committed `_REVIEW` stamp satisfied rl-1/rl-4
    without ever landing in a commit the operator/CI can see. Now uses `git cat-file -e HEAD:<path>`.
  - `scripts/harness/obligation-check.py` `check_canon()`: a task/feature row's own `fulfills:
cm-9999` backlink to a nonexistent canon anchor (typo, or an anchor removed/renamed after the
    row linked it) was silently dropped — the report could stay clean while a tracker claimed to
    discharge an obligation that was never real. Now cross-checked against the real anchor set and
    fires a `DANGLING` finding when it doesn't resolve.

  10 new regression tests; each fix proven by reverting it and confirming the corresponding test
  fails before restoring it.

## 0.4.3

### Patch Changes

- acaecd8: Five more findings surfaced by CodeRabbit reviewing Gamify's genesis-harness re-vendor
  (gamify-platform PR #881, round 3), confirmed present in this repo's own current main:
  - `scripts/harness/readiness.py` `parse_pr_arg()`: `/pull/(\d+)` had no boundary after the digits,
    so trailing garbage (`/pull/881oops`) still resolved to PR 881. Now requires a `/`, `?`, `#`, or
    end-of-string right after the number.
  - `scripts/harness/obligation-check.py`: an unparseable `--stale-days` value raised an unhandled
    `ValueError` traceback instead of the clean usage-error pattern already used for `--today`.
  - `scripts/harness/slugs.py` / `glossary.py`: broke a circular import (`slugs -> glossary ->
slugs`) by extracting the shared `TERM_HEADING` regex into a new dependency-neutral
    `glossary_terms.py` that both modules import from.
  - `scripts/harness/genesis` (dispatcher help text): notes bun/pnpm/yarn as alternatives to npm for
    bootstrapping a tenant, matching README.md's and genesis-sync.sh's existing phrasing.
  - `skills/alignment/SKILL.md`: the frontmatter `description` was silently out of sync with the
    file's own body (which already says Batch 1 is `N = max(10, count of closed-hand Values)`, never
    a hard 10-item cap) — description updated to match; `data/skills/` digest regenerated.

  Two more findings from the same round were investigated and rejected as stale/false-positive on
  the actual current code (not applied):
  - `data/_schema/tables/library.yml`'s `sprint` FK `pending: true` is intentional, not leftover —
    Gamify (the real consumer this targets) has zero real `library`/`sprint` rows today, so
    un-pending now would repeat the `conversations.yml` mistake in reverse (see PR discussion).
  - `skills/alignment/references/frame-dimensions.md`'s "Stack — pnpm" line accurately describes
    Genesis's own current stack (`packageManager: pnpm@9.15.4`, `pnpm-lock.yaml` present) — Gamify's
    bun mandate is a Gamify-repo convention, not Genesis's own.

## 0.4.2

### Patch Changes

- ec452ac: Five findings surfaced by CodeRabbit + Codex reviewing Gamify's genesis-harness re-vendor
  (gamify-platform PR #881), all confirmed present in this repo's own current main:
  - `data/_schema/tables/sprints.yml`: the `master_sprint`/`master` `anyOf` let a row set BOTH to
    different valid ids — the resolver prefers `master_sprint`, so the row validated while the
    deprecated `master` alias silently pointed elsewhere. Added a mutual-exclusion `not: {allOf:
[...]}` branch; both fields non-null now fails validation.
  - `data/_schema/tables/library.yml`: `sprint` was narrowed to `pattern: "^GEN-[0-9]{2}$"`, but the
    `sprint` FK is `pending: true` and `sprints`' own `id_style` is a freeform slug (real ids include
    `MASTER-2026-07-14` and slug-style squad sprints) — widened back to `minLength: 1`.
  - `scripts/harness/roller.py`: `scope:feedback` finding ids (`BUG-001`, `FR-01`, ...) reuse the
    source doc's own numbering per report with no report shard embedded in the id itself — unlike
    `scope:pr-review` ids, which self-namespace via `CMT-<pr>-NNN`. Table-wide duplicate-id
    uniqueness meant a second report's own `BUG-001` collided with an earlier report's. Scoped the
    check to `(shard, id)` for `scope:feedback` findings only.
  - `scripts/harness/genesis-sync.sh`: two related sync gaps — templates were only ever copied when
    absent, so a schema field change never refreshed an EXISTING tenant template (now refreshes when
    the on-disk template still byte-matches what the tenant's OLD stamped SHA shipped, i.e.
    untouched since last sync); and the registry-detection regex only matched a `{ ... }` flow-map,
    silently skipping a brace-less block-style `registry:` declaration (now detects both).
  - `scripts/harness/slugs.py`: `slug_registry()` carried its own byte-for-byte duplicate of
    `glossary.py`'s `TERM_HEADING` regex — now imports and reuses the shared pattern.

- Updated dependencies [ec452ac]
  - @marktiderman/genesis-data@0.3.2

## 0.4.1

### Patch Changes

- 94c1a0b: genesis-data: `scaffold()`'s demoted-table cleanup now normalizes line endings before comparing a
  surviving `_template.md` against the known pristine-default hash, and no longer crashes on a
  non-regular `_template.md`. Follow-up to PR #278 (which taught `scaffold()` to recognize an
  untouched default template as safe to clean up, not tenant content): the hash check compared raw
  bytes, so a tenant checkout with `core.autocrlf=true` (or any other CRLF-converting checkout)
  never matched the LF-computed reference hash and the table was kept forever even though nothing
  was actually customized — now fixed by normalizing CRLF/CR to LF on both sides before hashing.
  Separately, the same check called `fs.readFileSync()` unconditionally; if `_template.md` happened
  to be a directory (or any other unreadable/non-regular entry) `scaffold()` threw instead of
  failing safe — it now stats the entry first and treats any stat/read failure as tenant content
  (row-safe: never silently deletes, never crashes on unexpected shapes).
- Updated dependencies [94c1a0b]
  - @marktiderman/genesis-data@0.3.1

## 0.4.0

### Minor Changes

- 44f320a: gitdata: redefine the shipped core set in `data/_schema/distribution.yml`. Two moves: (1) `harness-blocks`, `harness-uses`, and `skills` leave `core:` for `genesis-only:` — they are Genesis-internal harness/skill operational data the provider authors and rolls, and a consumer repo should not carry them; (2) `agents`, `principles`, `library`, and `research` move the other way, from `genesis-only:` into `core:`, so consumers now receive them.

  Net effect: `genesis-data init` (and the umbrella's `./data` re-export) now publishes **14** core table contracts (was 13), and `genesis-only` narrows to exactly `harness-uses`, `harness-blocks`, `skills`. Reference-clean: every core table references only other core tables (`agents.skills` is a free-string array, not a roller FK, so `agents` shipping while `skills` stays genesis-only is fine). The three genesis-only tables still live in Genesis's own `data/` and validate under the roller — only their shipping status changed. Row-safe/idempotent as before: a tenant that already scaffolded any of these dirs keeps its rows untouched.

### Patch Changes

- 1c11025: gitdata: closes out the remaining CodeRabbit/Codex findings on the schema-consistency sweep
  (PR #276). `principles.adopted` is now `required` (not just constrained) inside the
  `status: proposed` branch, so a proposed row must explicitly carry `adopted: null` rather than
  omit the key. `conversations`/`experiments`/`features`' `sprint` FK retires its stale
  `pending: true` — `sprints` has migrated (siblings `tasks`/`debriefs`/`research` already enforce
  `sprints.id`) and every real row already carries a valid id, so a typo'd sprint slug now dangles
  instead of validating clean. The roller gains a `where:` reference filter (narrows the resolvable
  target set to rows matching a sibling-field constraint) and `sprints.master_sprint`/`master` use it
  to require `squad: master` on the target — a child sprint pointing at itself or another child
  sprint (invisible to the real rollup) now dangles instead of silently passing.

  Round 2 (Codex fresh pass): `principles.sprint` retires the same stale `pending: true` its sibling
  `conversations`/`experiments`/`features` already lost above — the FK now resolves against
  `data/sprints` instead of skipping. `genesis-data init`'s scaffold gains a non-fatal roller-compat
  check: publishing a core schema that uses a reference construct (currently `conditional:`,
  `debriefs.subject`) a tenant's already-vendored `scripts/harness/roller.py` predates now surfaces a
  loud `⚠` warning instead of silently landing a schema the tenant's harness can't validate — closing
  the gap where a schema-only `genesis-data init` re-run (without a matching `genesis-sync` harness
  re-vendor) could otherwise crash or silently mis-validate `debriefs` rows.

- 1c11025: gitdata: schema-consistency sweep surfaced by a consumer tenant's PR review. Retires the
  pre-migration `^GEN-[0-9]{2}$` sprint pattern on `conversations`/`experiments`/`features` (they now
  match the already-migrated `minLength: 1` slug shape on `tasks`/`debriefs`), widens `findings`' CMT
  id pattern to accept the `RABIT-`/`CR-` reviewer-tag forms, and tightens several tables: `sprints`
  gains `additional_fields: forbid`, a named filename `id` capture, and a conditional requiring
  non-master squads to name a `master_sprint`; `findings` requires non-whitespace `resolution` once
  `status` leaves `open`; `reports.findings` is now typed + FK-referenced; `principles.adopted` is
  only required once `status` leaves `proposed`. The roller also gains a `conditional:` reference
  kind (scope-conditional joins, e.g. `debriefs.subject`) and tightens the conversation transcript
  twin check to stem equality, not just existence. A tenant re-vendoring these tables gets stricter,
  more accurate validation — no schema-shape break for already-conformant rows.
- 71c42db: genesis-data: `scaffold()` now cleans up demoted tables. Follow-up to PR #271 (which moved
  `agents`/`principles`/`library`/`research` into `core:` and `harness-uses`/`harness-blocks`/`skills`
  out into `genesis-only:`) — that PR's own review flagged that `scaffold()` only ever ADDS core
  contracts, so a tenant that had already run `init` with an older `core:` list kept stale
  `data/_schema/tables/<t>.yml` files and trellis dirs for tables now demoted to `genesis-only`,
  forever. `scaffold()` now detects any tenant-side schema file for a table Genesis still recognizes
  (core or genesis-only) but no longer ships as core, and either removes it (schema file + trellis
  dir) when the tenant has no real rows there, or leaves it in place with a loud warning when real
  rows exist (row-safe: never silently deletes tenant data). A tenant's own unrelated custom schema
  files are never touched.
- Updated dependencies [1c11025]
- Updated dependencies [1c11025]
- Updated dependencies [1c11025]
- Updated dependencies [71c42db]
- Updated dependencies [44f320a]
  - @marktiderman/genesis-data@0.3.0

## 0.3.1

### Patch Changes

- Updated dependencies [128981d]
  - @marktiderman/genesis-design-system@1.1.1

## 0.3.0

### Minor Changes

- e171c4e: Add `@marktiderman/genesis-data` — the Genesis Git Data System, consumer-installable. A tenant can now `npx genesis-data init` to publish the 13 core table contracts (schemas + templates) into `data/_schema/` and scaffold a git-trackable `data/<t>/` trellis, then validate with the roller. The ship manifest is re-derived from `data/_schema/distribution.yml` at pack time (anti-fork); `genesis-only` tables never ship. The scaffold is idempotent and row-safe (never deletes, overwrites, or git-adds tenant rows).

  The umbrella `@marktiderman/genesis` gains a `./data` subpath re-export and depends on the new package (minor bump: 0.2.4 → 0.3.0).

### Patch Changes

- Updated dependencies [e171c4e]
  - @marktiderman/genesis-data@0.2.0

## 0.2.4

### Patch Changes

- Updated dependencies [88ad204]
- Updated dependencies [38d08d3]
- Updated dependencies [1e56f68]
- Updated dependencies [f4da5b4]
- Updated dependencies [e37afdd]
  - @marktiderman/genesis-ui@1.2.0
  - @marktiderman/genesis-ui-native@2.0.1
  - @marktiderman/genesis-design-system@1.1.0

## 0.2.3

### Patch Changes

- ed72a30: Establish `@marktiderman/genesis` as the single Genesis version coordinate.

  The umbrella now depends on every sub-package (`-core`, `-ui`, `-design-system`,
  `-switchboard`, `-ui-native`) via `workspace:*`, so each published tarball
  exact-pins its dependencies — `@marktiderman/genesis@X` resolves one reproducible
  set rather than a drifting caret range. The umbrella version is the canonical
  "which Genesis am I on?" number: the vendored harness stamp
  (`GENESIS_SOURCE_VERSION`) and the plugin/marketplace stamp
  (`.claude-plugin/plugin.json`) both track it, collapsing three previously
  disconnected version markers into one. See `packages/genesis/README.md` →
  "The Genesis version coordinate".

## 0.2.2

### Patch Changes

- f58d4cc: Republish the umbrella with its build output. The 0.2.1 tarball shipped
  without `dist/` (2 files, no JS, no types): the Release workflow's build
  step filtered `@marktiderman/genesis-*`, which matches every granular
  package but not the umbrella itself, so `changeset publish` packed an
  unbuilt package. The workflow now builds `@marktiderman/*`, and the
  umbrella's dts emission carries the reachable-failure hardening. 0.2.1
  is deprecated on npm.
- Updated dependencies [613e4bc]
  - @marktiderman/genesis-ui@1.1.1

## 0.2.1

### Patch Changes

- cd56129: Emit deterministic `.d.ts` declaration shims for every umbrella subpath.

  The umbrella holds no code — each entry is a one-line
  `export * from "@marktiderman/genesis-*"` barrel — so its declarations should be
  thin re-exports, not a re-bundle of the granular packages' types. tsup's `dts`
  bundler silently dropped `ui.d.ts` (the re-export of the largest package,
  `genesis-ui`) between builds, publishing a typeless `@marktiderman/genesis/ui`
  subpath (`TS7016` for strict consumers — this shipped in `0.2.0`). The build now
  copies each barrel to `dist/<name>.d.ts` in `onSuccess`: it cannot drop an
  entry, duplicates no types, and always resolves to the granular package's own
  declarations. The `smoke:web` pack-gate already asserts every subpath ships both
  its `import` and `types` target, so a future regression fails CI.

## 0.2.0

### Minor Changes

- 41cd84d: Introduce the `@marktiderman/genesis` umbrella package — one-install ergonomics over the Genesis DS. It holds no code of its own and re-exports the granular packages via subpath exports: `/core`, `/ui` (+ `/ui/data`, `/ui/utils`, `/ui/status-colors`, `/ui/hooks`), `/design-system` (+ `/design-system/tokens`, `/design-system/theme`), `/switchboard`, and `/native` (`@marktiderman/genesis-ui-native`).

  Each granular `@marktiderman/genesis-*` package remains independently installable as an escape hatch. `react-native` is an optional peer dependency, so web installs never require it and bundlers tree-shake `/native` out unless a consumer explicitly imports it.

### Patch Changes

- Updated dependencies [3a35b0f]
- Updated dependencies [41cd84d]
- Updated dependencies [54a8afb]
- Updated dependencies [41cd84d]
- Updated dependencies [e972635]
- Updated dependencies [41cd84d]
  - @marktiderman/genesis-switchboard@1.0.0
  - @marktiderman/genesis-ui@1.0.0
  - @marktiderman/genesis-ui-native@2.0.0
  - @marktiderman/genesis-core@1.0.0
  - @marktiderman/genesis-design-system@1.0.0
