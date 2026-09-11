# @marktiderman/genesis-ui

## 2.3.1

### Patch Changes

- f5f6d65: **Two eject-path bugs the 2.3.0 tarball shipped with.** The extensibility
  ladder went out as 2.3.0, but the review fixes that landed on the same branch
  afterwards did not — `@marktiderman/genesis-ui@2.3.0` on npm has the slots API
  and neither of these corrections. Both are cases where ejecting a part did
  something other than what the prop's own documentation promised.

  - **`DataPageShell`: ejecting the header no longer takes the filter row with
    it.** `header={null}` ejects the header, and the doc on `header` promises the
    filter row survives that. It only did in the standard branch, where `filters`
    renders as an independent sibling; in the collapsible branch the filter row
    reaches the DOM ONLY as the header's `details` prop, so an ejected header
    removed the filters too — with no error, which is the worst version.
    Collapsing needs a header to collapse into, so without one the standard
    branch renders the filter row on its own.

  - **`ResourcePage`: the `shell` slot is typed as replaceable, not ejectable.**
    `ResourcePageSlots` accepted `null` for `shell` like every other part, but
    the implementation reads `slots?.shell ?? DataPageShell` — `null` falls
    through to the default rather than ejecting, because there is no page
    without a shell root. The type now says so: `shell` takes a component, never
    `null`, matching what the class doc already claimed.

  No runtime behaviour changes for a caller who never ejected a part, and the
  second fix changes no runtime behaviour at all — `null` already fell through to
  the default; only the type stopped permitting it.

  **One type-level narrowing, called out because it is not visible at runtime.**
  In 2.3.0 `ResourcePageSlots` was `Slots<ResourcePageSlotMap<T>>`, so `shell`
  accepted `null` like every other part. It is now
  `Omit<Slots<…>, "shell"> & { shell?: ComponentType<…> }`. A consumer who wrote
  `slots={{ shell: null }}` compiled on 2.3.0 and will not compile on 2.3.1 —
  they should drop the key, which is what that code already did at runtime. Kept
  as a patch deliberately: the previous type described an eject the
  implementation never performed, so this is the type being corrected to match
  shipped behaviour rather than behaviour being taken away.

## 2.3.0

### Minor Changes

- **`slots`, `slotProps` and an eject button on the pattern layer.**

  The pattern components were sealed: `ResourcePage`, `DataPageShell`,
  `PageHeader`, `DataBulkBar` and `DataFilters` accepted neither `className`
  nor a rest spread, so a surface that needed one part changed had exactly two
  options — take the pattern as shipped, or rebuild it. Every surface that
  needed one small difference took the second, and the design system stopped
  being a system.

  This adds the missing rung between "the whole pattern" and "the raw
  primitives":

  - `ResourcePage` takes `slots`, `slotProps` and `className`.
    `ResourcePageSlotMap` names all seven parts it composes (`shell`,
    `filters`, `bulkBar`, `grid`, `table`, `detail`, `form`). A replacement
    receives exactly the props genesis would have passed the default, so the
    common case is wrapping the default rather than reimplementing it.
  - **`null` ejects a part** — `slots={{ bulkBar: null }}` renders the page
    without one. The shell root is the one exception: it takes a component,
    never `null`, because there is no page without it.
  - `slotProps` merges **last**, so it wins over genesis's own value. A hatch
    that silently loses to the default is not a hatch.
  - `DataPageShell` gains `className` and an ejectable `header` slot.
  - `PageHeader` gains `secondaryActions: PageHeaderAction[]`, rendered as one
    overflow menu (`data-testid="page-header-more-actions"`). This exists
    because `actions: ReactNode` let every surface spend the header's action
    budget differently, and one of them blew it.
  - `BulkAction` gains `testId`; `DataBulkBar` gains `className` and exports
    `DataBulkBarProps`.

  Additive throughout — every new prop is optional and no existing prop
  changes meaning. `packages/ui/EXTENDING.md` documents the four rungs and the
  rules that keep them true.

## 2.2.1

### Patch Changes

- **Republished with a real dependency range.** 2.1.0 and 2.2.0 both shipped
  `"@marktiderman/genesis-core": "workspace:^"` verbatim in `dependencies` and
  cannot be installed by anyone. The cause is `npm publish` run from a pnpm
  workspace: npm copies the `workspace:` protocol into the tarball as-is,
  where `pnpm publish` rewrites it to a real semver range at pack time.

  **Publish this repo with `pnpm publish`, never `npm publish`.** `pnpm pack`
  followed by reading the packed `package.json` is the check that catches it.

## 2.2.0

### Minor Changes

- **`ResourcePage`: the level-3 options reach the call site.** Forwards
  `filters` and exposes `renderTable`, surfaces loading and error state in
  server-data mode, and lets a `DataBulkBar` action be `disabled` — the case
  being an in-flight bulk mutation, where every action should be dead until it
  settles so a destructive operation cannot be double-fired on the same
  selection.

  Not installable — see 2.2.1.

## 2.1.0

### Minor Changes

- a91df74: **ResourcePage: server-controlled lists, and the level-3 options reach the call site.**

  Purely additive — every new prop is optional, no existing prop changes meaning, and no
  existing call site needs an edit. Per `docs/FRAMEWORK.md` rule 5 ("additive by default")
  and the versioning policy ("additive surface is a minor"), this is a **minor**.

  **Server-controlled mode.** Supplying any of `page`, `perPage`, `onPageChange`,
  `onPerPageChange`, `onSortChange` or `onSearchChange` tells ResourcePage that the server
  already searched, sorted and paginated `data` — so it renders those rows exactly as given
  instead of doing all three a second time. That double-work was the blocker: page 3 of 40
  was previously re-filtered and re-sorted against only its own rows, and then re-paged on
  top of that, which is why a server-paginated list could not adopt ResourcePage at all.
  Two consequences are visible and deliberate: table header sort is withdrawn in this mode
  (a header click could only reorder one page), and `DataTable`'s own pagination is switched
  off in favour of a pager driven by `page`/`perPage`/`total`/`onPageChange` — rendered only
  when `onPageChange` is supplied, so there is no dead control. Changing search or sort also
  calls `onPageChange(1)`, and "Clear all" now reaches the server rather than emptying the
  controls while the same rows stay on screen.

  **Saved views** reach `DataFilters`: `savedViews`, `onLoadView`, `onSaveView`,
  `onDeleteView`, `canSaveViews`. Pair with `useSavedViews` for per-user storage.

  **Table chrome** reaches `DataTable`: `columnVisibility`, `columnVisibilityKey`,
  `resizableColumns`, `resizeKey`, `stickyHeader`, `stickyFirstColumn`, `pageSizeOptions`.
  Omitting any of them keeps DataTable's own default, so nothing changes for existing pages.

  Together with the existing `viewSettingsKey`, this completes the three levels: the primitive
  offers the option, the instance turns it on or off, and the end user's own choice persists
  to their storage.

  `useResourcePage` gains a matching optional `controlled` flag (defaults to `false`), which
  is what actually bypasses the client-side filter/sort and makes `total` the server's count
  rather than the length of a filtered slice.

### Patch Changes

- 73f6234: `ResourcePage` requires `total` as well as `perPage` when `onPageChange` is supplied.

  `total` omitted was the second door into the room `perPage` omitted opened.
  `displayTotal` falls back to `0`, so the range span read "No records" and
  `Next` stayed disabled while `page.data` rendered rows directly below it. A
  surface that says "no records" above visible records is a lie, not a degraded
  view.

  The pager now refuses to render when either prop is missing. It shows a
  `role="alert"` message naming the missing prop or props
  (`data-testid="resource-page-pagination-error"`) and logs once per mount. Rows
  still render. Nothing that already passes both props changes.

## 2.0.1

### Patch Changes

- 7cfc703: First publish from the new public repo. No functional changes — every package's current version already matches what's published from the predecessor repo, so this bump is required before this repo's release workflow can publish anything at all (npm rejects republishing an existing version).
- Updated dependencies [7cfc703]
  - @marktiderman/genesis-core@1.1.2

## 2.0.0

### Major Changes

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

- 847e93a: **BREAKING:** adopt Radix's unified `radix-ui` package — **21 peer dependencies become 1**.

  Marked `major`, not `minor`, because it requires consumer action to keep working.
  `genesis-ui` is on 1.x, and `docs/README.md` fixes breaking changes at major for 1.x+.
  A consumer holding `^1.3.0` under pnpm or Yarn Classic — neither auto-installs missing
  peers — would otherwise resolve this release with only the old `@radix-ui/react-*`
  packages present, and every migrated component would fail to resolve `radix-ui` at
  runtime. A major keeps existing ranges from selecting it silently.

  `genesis-ui` declared 21 separate `@radix-ui/react-*` peers, every one of them
  genuinely imported. Radix now publishes `radix-ui`, a single package
  re-exporting all 34 public primitives as namespaces, so consumers install and
  version-manage one entry instead of twenty-one — and version skew across
  independently-drifting ranges becomes impossible.

  **Consumers must swap the 21 `@radix-ui/react-*` entries for `radix-ui@^1.6.7`.**
  That is the whole migration: no component API changes, no visual change.

  Internally each import moved from `import * as X from "@radix-ui/react-y"` to
  `import { Y as X } from "radix-ui"`, which preserves every usage site verbatim
  (`X.Root`, `X.Trigger`, …). Two files needed more than the mechanical rewrite:
  `command.tsx` imported a bare `DialogProps` type (now `Dialog.DialogProps` via
  the namespace) and `button.tsx` imported `Slot` directly (now `Slot.Root`).

  Kept as a `peerDependency` rather than a dependency on purpose: a consumer that
  also installs Radix directly must resolve to a single copy, or Radix's context
  providers end up duplicated across two React trees.

  Tree-shaking is sound — `radix-ui` declares `sideEffects: false` and exposes a
  `./*` subpath, so unimported namespaces drop out of a consumer bundle. The
  honest trade is that it depends on all 55 Radix packages, so a misconfigured
  bundler pulls more than it uses, and per-primitive version pinning is no longer
  possible.

  Step 2 of the migration sequence in `docs/FRAMEWORK.md`. It is what makes
  adopting the remaining Radix primitives (`tooltip`, `tabs`, `scroll-area`,
  `toolbar`, `visually-hidden`, `accessible-icon`) cost nothing at the dependency
  layer.

### Minor Changes

- 4d02f31: Add three primitives closing common gaps in consumer apps (Breakthrough master-plan item 26, U10-U12):
  - `UserAvatar` — canonical user-identity avatar. Wraps `Avatar`/`AvatarImage`/`AvatarFallback` and computes initials from a `name` prop (falls back to initials automatically on a missing or failed image load). `size` is `"sm" | "default" | "lg"`, matching the scale already used by `Button`/`Toggle`/`Spinner`. The root carries `role="img"` + `aria-label={name}` so the person's full name is the accessible name on both the image and the initials path, and initials are read as Unicode graphemes so non-BMP names (`𐐀 Smith`, `😊 Jones`) and combining marks survive intact.
  - `SettingsRow` and `ToggleRow` — row layout for settings/preferences lists: label + description on one side, a control on the other. `SettingsRow` takes arbitrary trailing `children` plus a `descriptionId` so a consumer-supplied control can reference the description through `aria-describedby`; its label text renders as a real `<label for>` only when `htmlFor` is supplied, and as a plain `<span>` otherwise, so rows whose control names itself (a Button) or has none (a Badge) never emit a `<label>` associated with nothing. `ToggleRow` is `SettingsRow` pre-wired with `Switch`, generating both the `id`/`htmlFor` and the `aria-describedby` pairing (via `useId`) so the label _and_ the description are announced when the control is focused; its `testID` lands on the Switch — the node automation has to click — with `rowTestID` for the row wrapper. Each ships at its own subpath (`@marktiderman/genesis-ui/settings-row`, `@marktiderman/genesis-ui/toggle-row`).
  - `PageLoading` — full-page or in-section loading state: a centered `Spinner` with an optional message, as the loading-state counterpart to `EmptyState`. `variant` is `"page" | "section"`.

  All three are additive, token-only (no new colors), accept a `testID` prop consistent with the rest of the package, and ship with a `<Name>Props` type and a Storybook story in `apps/sample`. No new dependencies — everything composes existing `genesis-ui` primitives (`Avatar`, `Switch`, `Label`, `FormDescription`, `Spinner`). The accessibility and selector behaviour is pinned by unit tests in `packages/ui/src/components/ui/__tests__/`.

- 86a6515: `DetailPanel` gains a `layout` prop (`"inline" | "dialog" | "sheet"`) that swaps the rendering shell around its existing header/content while keeping the same prop surface. Default is `"sheet"`, matching today's fixed right-anchored slide-in panel — existing `<DetailPanel>` consumers that don't pass `layout` are unaffected.
  - `"sheet"` (default): now composed from the shared `Sheet` primitive instead of a hand-rolled fixed panel. Same slide-in-from-right look, plus a real backdrop/focus-trap/Escape-to-close at all breakpoints (previously the backdrop was mobile-only).
  - `"dialog"`: composes the shared `Dialog` primitive for a centered modal presentation.
  - `"inline"`: new — a plain in-flow panel with no overlay/backdrop/fixed positioning, for master-detail / split-pane layouts.

  `ResourcePage`'s `detail="modal"` now renders through `<DetailPanel layout="dialog">` instead of its own bespoke `Dialog` block, so `detail="panel"` and `detail="modal"` share one implementation. Two small, intentional visual side effects of that consolidation: Edit/Delete move from a footer button row to the same header icon buttons `detail="panel"` already uses, and `detailWidth` now takes effect for `detail="modal"` (previously silently ignored there). As a bonus, the "no `renderDetail`/no `detailFields`" auto-render-all-fields fallback that `detail="panel"` already had now also applies to `detail="modal"` (previously that combination rendered nothing in modal mode).

  `SheetContent` (`packages/ui/src/components/ui/sheet.tsx`) gains an optional `showCloseButton` prop (default `true`), mirroring `DialogContent`'s existing prop of the same name, so composing consumers like `DetailPanel` can suppress the built-in close affordance and provide their own.

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

- e1e5b94: Add the page templates — `DetailPage`, `FormPage`, `DashboardPage`, `SettingsPage` in `components/layout/`, plus the data-bound `ResourceDetailPage` in `components/data/`. This is step 8, the last, of the migration sequence in `docs/FRAMEWORK.md`, and the step its central claim rests on: _"a new app is shell + templates + a resource config. Not dozens of hand-assembled pages."_

  **Minor, not major or patch:** the surface is purely additive. Five new components, four new export subpaths. Nothing existing changes shape, renders differently, or is deprecated — a consumer who upgrades and imports nothing new gets a byte-identical build of everything they already had. Per the versioning policy in `standards/upgrade-process.md`, additive surface is a minor.

  ## Which layer each template landed in, and why

  `docs/FRAMEWORK.md` lists all four under its **Layout tier** heading, but the layers table one section earlier gives the admission test that actually decides: _"Data-bound — does it need a resource contract to be useful?"_, and the prose next to the list says so outright — _"anything requiring a resource contract is data-bound and lives in that layer, not this one. `ResourcePage` is the existing example."_ Where a heading and an admission test disagree, the test wins; that is how `StatusBadge` was filed in step 3, and the resulting move is what the "Target structure" section records. Each of the four was put through the test on its own:

  | Template             | Needs a resource contract?                                         | Layer     |
  | -------------------- | ------------------------------------------------------------------ | --------- |
  | `DetailPage`         | No — it positions a header, a content region and a metadata column | `layout/` |
  | `FormPage`           | No — it positions a header, fields, a summary and an action bar    | `layout/` |
  | `DashboardPage`      | No — tiles and regions arrive as props                             | `layout/` |
  | `SettingsPage`       | No — rows and their persistence are the app's                      | `layout/` |
  | `ResourceDetailPage` | **Yes** — it fetches a record by id through `DataProvider`         | `data/`   |

  Only `DetailPage` was split into halves, and only because only it had two separable jobs. A detail _route_ really does need a resource contract — that is the hand-written page a resource config should be deleting — so the binding half ships as `ResourceDetailPage` in `data/`, and the structure half stays data-free in `layout/`. The pairing is the one `AppShell` (layout) and `ResourcePage` (data-bound) already have, and it means an app with its own fetching gets the page shape without inheriting the provider.

  The other three were deliberately **not** split, for reasons specific to each:
  - **`FormPage`** — its data-bound twin already exists. `ResourceForm` answers "bind a form to a resource" and has since before this step, including a `layout="page"` mode. Adding a `ResourceFormPage` would be a second answer to a question that already has one, which is the failure rule 1 ("one home per concept") exists to prevent — the same failure the root/`data` `EmptyState` convergence had to undo. `FormPage` renders a real `<form>` and forwards `onSubmit`, which is what keeps it usable for a **hand-written** form rather than only for `ResourceForm`'s.
  - **`DashboardPage`** — a data-bound dashboard needs an aggregate/metric contract, and `genesis-core` ships none. `useResource` and `useOne` return rows, not sums over rows. Building the template first is precisely what "Why templates need the contract first" warns against, so the honest move is to ship the layout and leave the binding until there is something to bind to.
  - **`SettingsPage`** — settings persistence is not a resource contract. Genesis's answer for the storing half is `useStorage`, which `docs/FRAMEWORK.md`'s own layering treats as a platform utility rather than a data surface, and the caller wires it up outside the component.

  No `AuthPage`, per the same document: auth is out of scope, and a template that knows how you authenticate would contradict that.

  ## What each one is
  - **`DetailPage`** — one record's full view. `title` (required), `subtitle`, `breadcrumb`, `actions`, `sidebar`, `sidebarAt` (default `"lg"`). `Split` at `ratio="2/3"` is the backbone: eight of twelve tracks for content, four for metadata, stacking content-first below the breakpoint so a phone shows the record before its provenance. With no `sidebar` there is no `Split` at all — an empty four-track column eats a third of the width and shows nothing.
  - **`FormPage`** — a titled form. `title` (required), `description`, `errors`, `actions`. Renders a real `<form>` and spreads every form attribute, so a plain `type="submit"` button in `actions` submits it with no `form=` wiring at the call site. `errors` renders inside a destructive `Alert`, so the validation summary announces itself via `role="alert"` instead of being a paragraph a screen reader walks past. The action bar is `sticky bottom-0` against `AppShell`'s scrolling `<main>`, and renders only when `actions` is set — an empty sticky strip is a border floating over the content.
  - **`DashboardPage`** — a stat row over a free-form region. `title` (required), `subtitle`, `actions`, `stats`, `statColumns` (default `4`, reusing `Grid`'s `cols` scale). The two regions are separate on purpose: stats are a fixed-shape row that must reflow as a unit, everything below stacks. Folding both into one `children` is how the stat row ends up hand-gridded per page at a different breakpoint each time — the drift `Grid` exists to stop.
  - **`SettingsPage`** — a sectioned settings surface with a nav rail. `title` (required), `description`, `actions`, `sections`, `navAt` (default `"md"`). Sections are a prop rather than children because the rail needs their titles and ids; declaring each once makes "the rail says Notifications and the heading says Alerts" unrepresentable. Each renders through `Section`, so it is a real `<section>` named by its own heading via `aria-labelledby` — the thing that makes the rail's visual promise ("jump to Notifications") true for a screen-reader user too. **The rail appears only when there is more than one section**, which is a consequence of the content rather than a prop nobody remembers to set.
  - **`ResourceDetailPage`** — `DetailPage` with `useOne` bound to it. `resource`, `id`, `titleField`, `subtitleField`, `select`, `breadcrumb`, plus `actions` / `sidebar` / `children` as render props over the loaded record. It owns the three non-record states, because a per-app `isLoading &&` is exactly the hand-written code a template exists to remove: loading (or an id that hasn't resolved) → `PageLoading`; absent → `EmptyState` saying so; any other failure → `EmptyState` carrying the provider's message verbatim, because an error state that hides what went wrong is the one nobody can act on. A nullish `id` is the loading state, not the not-found state — nothing was asked, so nothing is missing.

    Two details that are not obvious and both cost a real defect to find:

    **Absence arrives as an error, not as empty data.** Every provider Genesis ships signals "no such row" by throwing — `createMockProvider` throws `[MockProvider] Record not found: …`, the switchboard provider throws `no "<resource>" row with id …`, and the Supabase provider's `.single()` surfaces PostgREST's `PGRST116`. So a `!data` check alone would leave the not-found state unreachable in production while a deleted record showed a generic failure carrying a raw database string. The component classifies those three shapes as not-found (verified against each provider's `getOne`, cited in the source) and keeps `!data` for a custom adapter that resolves empty instead. The tests drive the _real_ `createMockProvider` for this, not a stub — a stub that resolves empty is precisely what would make an unreachable branch look covered.

    **`enabled` is presence, not truthiness.** `useOne` defaults to `enabled: !!id` and `Identifier` is `string | number`, so a record with primary key `0` would never be fetched and a page that exists would report itself missing without the provider ever being asked. `ResourceDetailPage` passes `enabled: id != null`.

  ## Layer discipline, mechanically checked

  `packages/ui/src/components/layout/` imports nothing from `data/` and reaches no data package, directly or transitively — `scripts/check-layer-boundaries.mjs` (step 4) reports clean. Everything the templates lean on is at or below their own tier: `Split` / `Grid` / `Section` from `layout/`, `EmptyState` / `PageLoading` from `patterns/`, `Alert` from `ui/`.

  **The templates do not compose `PageHeader`.** Step 3 has moved it into `layout/`, so composing it is legal now — it was tried, built and measured, and it does not fit:
  1. **`PageHeader.title` and `.subtitle` are `string`.** All four templates would narrow their title from `ReactNode`, and a record heading is the one place a `StatusBadge` beside the name is routine.
  2. **Cost, measured on the emitted bundle.** `@marktiderman/genesis-ui/detail-page`'s closure goes from **5.8 KB / 5 chunks to 34.4 KB / 14**, and picks up a runtime dependency on **`radix-ui`** (Popover, Collapsible, Switch, and Select via `ViewSettings`) — for a header that renders a title, a line under it and a slot, and mounts none of that. Per-component subpaths exist so a consumer does not pay for what they did not import.
  3. **`PageHeader` has no slot above the title** (no breadcrumb / back link) and hard-codes `data-testid="page-title"` on its `<h1>`.

  Explicitly _not_ a reason, having checked rather than assumed: RSC. `PageHeader` is `"use client"`, but the emitted `detail-page.js` is **not** stamped with the directive when it imports it — a server module importing a client module is the ordinary boundary. The upstream change that would make folding correct is widening `title`/`subtitle` to `ReactNode` and lifting the list chrome out of `PageHeader`; that is a `PageHeader` change, not a page-template one.

  What the four render instead is ~10 lines of header markup each — markup, not a new exported component — so there is still exactly one _exported_ answer to "give me a configurable page header".

  The layout templates are also directive-free — no `"use client"` — so the whole `/layout` subpath stays importable from a React Server Component. `ResourceDetailPage` carries the directive, as every data-bound component must.

  **Width is deliberately not an opinion in any of them.** `Container` already answers "how wide is this page and what are its gutters", so the templates wrap rather than duplicate it — and, practically, `AppShell`'s `<main>` already applies the page padding, so a template that also gutters would double it.

  ## Packaging

  Four per-component subpaths — `./dashboard-page`, `./detail-page`, `./form-page`, `./settings-page` — in alphabetical position in `exports`, **each with a matching `tsup.config.ts` entry**. That pairing is load-bearing and easy to get wrong: a subpath with no entry type-checks, builds and tests completely green, then 404s for the consumer at runtime because nothing was ever emitted at the path it points to. `scripts/check-exports-resolve.mjs` now runs after every build and turns exactly that omission into a build failure — it reports all 71 subpaths resolving, and each of the four was additionally imported for real out of `dist/`. The tsup entries are listed one by one rather than globbed as `layout/*.tsx`, because a glob would be _wider_ than the `exports` map: it would emit `stack.js`, `AppShell.js` and the rest at paths no `exports` entry declares, which Node answers with `ERR_PACKAGE_PATH_NOT_EXPORTED`. `ResourceDetailPage` ships from the existing `./data` barrel, like every other data-bound component; all four templates are also on the package root and on `./layout`.

  Token-based Tailwind only (no raw hex, no arbitrary values), `forwardRef` + `displayName` + an exported `<Name>Props` on each layout template, `testID` → `data-testid`, a `data-slot` on every region, and `className` merged through `cn()` throughout. 37 unit tests across `layout/__tests__/page-templates.test.tsx` and `data/__tests__/resource-detail-page.test.tsx` pin the assembly — which regions exist, in what DOM order, and which primitive backs each — including the two behaviours nothing else in the toolchain can see: `DetailPage`'s sidebar collapse, which lives entirely in responsive prefixes happy-dom never evaluates (so the assertions check the prefixed classes are present, paired with the requested breakpoint, and that the unprefixed grid classes are absent), and `FormPage`'s sticky action bar.

  **`ResourceForm` is not a `FormPage` child.** It renders its own `<form>`, and `FormPage` renders one too; nesting them is invalid HTML — the browser drops the inner element, SSR and hydration disagree about the tree, and one submit fires both handlers. The two are alternatives, and the docs say so.

  No new dependencies, and no change to any existing component. Ships alongside a `@marktiderman/genesis-core` patch (`useOne`'s cache key), which `ResourceDetailPage`'s `select` prop depends on for correctness — see that changeset.

  **The export-map generator now knows the layout tier.** `packages/ui/scripts/gen-exports.mjs` resolved each per-component subpath to `components/ui/` or `components/patterns/` and nothing else, because until this change no layout component had one — step 7 shipped its five primitives with the `/layout` barrel alone. These four templates are the first, so without the fix the next regeneration of the map would have deleted all four: a breaking `exports` arriving as a pure-deletion diff that reads like a no-op, which is exactly the failure #384 wrote that script to close, reopening one tier up. `check-exports-resolve.mjs` cannot catch it — it verifies that _declared_ subpaths resolve, so once the declarations are gone there is nothing left to fail; run against the truncated map it reports `OK … (67 subpaths)` and exits 0 while the consumer's import is `MODULE_NOT_FOUND`. The two gates gate opposite directions.

  Fixed with a `LAYOUT_SUBPATH_COMPONENTS` list mirroring the existing `PATTERN_SUBPATH_COMPONENTS`, because holding a per-component subpath is a public API fact rather than a consequence of a folder: the four templates have one, and step 7's `Stack`/`Grid`/`Split`/`Section`/`Container` deliberately do not (that is step 7's surface to change, not step 8's), nor do `AppShell`/`PageHeader`, which came from `components/data/` and never had one to keep. The both-folders collision guard now covers all three tiers by reporting whichever folder already claimed a name, instead of naming a hard-coded pair that silently stops applying when a tier is added.

  **Cross-surface vocabulary.** `@marktiderman/genesis-ui-native` already ships a `SettingsPage`, and it exports a `SettingsPageSection` type of the same name with a different shape: `rows: SettingsPageRow[]` plus a `footnote`, because a native settings screen is a sectioned list of drill-in rows and a jump rail has nowhere to live on a phone. That structural difference is real and stays — it is the same platform-idiom accommodation `Stack` documents against native's `Stack`/`Inline` split. What does not get to differ is the vocabulary for the fields the two share, so the web section's heading is `title`, native's word, rather than `label`, which is what it was called until this was noticed. `id` means the same thing on both. The divergence is documented on the type itself, the way `Stack`'s is, so a consumer of both surfaces reads it where they will hit it. No parity test is added, unlike `spaceScale`'s: a field-name drift here is a compile error at the call site, whereas a spacing-scale drift silently renders the wrong pixels — which is why that one needed a test and this one does not.

- beaa503: Add four new Radix-backed primitives — `Toolbar`, `VisuallyHidden`,
  `AccessibleIcon` and `PasswordToggleField` — using the unified `radix-ui`
  package. This is step 6 of the migration sequence in `docs/FRAMEWORK.md`.

  **Why `minor`, not `major` or `patch`.** Every export here is new. No existing
  component's props, rendering or behaviour changed, and the peer contract is
  untouched (see below), so nothing a consumer has today can break — that rules
  out a major. But four new components is public API surface, not a fix, which
  rules out a patch. Per the versioning policy: additive surface is a minor.

  **Why now, and why these four.** They are effectively free. `radix-ui@1.6.7`
  re-exports all 34 primitives from one package, so adopting a primitive it
  already ships adds nothing to the install graph — no new `@radix-ui/*` entry,
  no new version range to keep in step. That is the whole reason this step is
  cheap: the usual cost of leaning harder on Radix (a consumer install list that
  grows with every primitive) does not apply.

  **This release adds no peer dependency.** `radix-ui: ^1.6.7` is already a
  required peer as of the previous release, which took it on as a **major** with
  its own migration note (21 granular `@radix-ui/*` peers collapsed to 1). The
  peer block here is byte-identical to that release's; the only dependency-shaped
  change is that `radix-ui` is now also enumerated in the tsup `external` list
  alongside the other 15 peers already there. That entry changes no emitted byte
  — tsup externalizes `peerDependencies` by default — it just makes the list a
  complete statement rather than a partial one.
  - **`Toolbar`** (`Toolbar`, `ToolbarButton`, `ToolbarLink`, `ToolbarSeparator`,
    `ToolbarToggleGroup`, `ToolbarToggleItem`, `toolbarVariants`) — a group of
    controls that behaves as **one tab stop**: Tab moves past the whole cluster,
    Arrow/Home/End move between the items inside it.

    Filed under `ui/` as a primitive, not under a layout folder, and that is a
    deliberate reading of the framework's own test. A layout "positions things
    without knowing what they are"; this one knows its children are focusable
    controls and manages their focus. A `Toolbar` _layout_ that only handled
    spacing would be a separate, behaviour-free composition.

    `orientation` is forwarded to both Radix (which uses it to choose Left/Right
    vs Up/Down) and the CVA class (which uses it to choose the flex direction),
    so the keyboard axis and the visual axis cannot disagree. `ToolbarButton`
    reuses `buttonVariants` and `ToolbarToggleItem` reuses `toggleVariants`,
    defaulting to `ghost`/`sm` — a toolbar is a dense strip of controls, not a
    page's primary action — rather than declaring a second button look.

  - **`VisuallyHidden`** — text clipped out of the layout but kept in the
    accessibility tree. The label an icon-only control needs, the `DialogTitle` a
    dialog must have even when the design shows none, live-region status text.

    Radix rather than Tailwind's `sr-only` because Radix applies the clip
    rectangle as **inline styles**, so there is no stylesheet for a consumer's
    purge configuration or a competing utility to lose. When `sr-only` gets
    defeated the failure is silent: the text simply becomes visible.

  - **`AccessibleIcon`** — the correct pattern for an icon-only control: hides the
    glyph from assistive tech (`aria-hidden` + `focusable="false"`) and appends a
    visually-hidden label, so the control gets a real accessible name. Done by
    hand this is three easily-forgotten steps, and getting one wrong yields a
    button announced as "button" with no name — which looks entirely fine on
    screen. It renders no host element of its own (it clones the child), so it
    takes no `ref` and no `className`; that is documented in the file.
  - **`PasswordToggleField`** (`PasswordToggleField`, `…Input`, `…Toggle`,
    `…Slot`, `…Icon`) — a password field with a show/hide control that preserves
    caret position, derives the toggle's accessible name from the current state,
    and re-masks the field when the form is submitted or reset. That last part is
    the one nobody writes by hand, and it is why this wraps Radix instead of
    `useState` + `type={shown ? "text" : "password"}`.

    Note the root renders a `relative` wrapper `div`. Radix's own root is a
    context provider with no DOM node, and the toggle is positioned `absolute`,
    so without that wrapper the button resolves against whatever positioned
    ancestor the consuming page happens to have — landing nowhere near the field.

    🟡 **Shipped as `@stability Experimental` — the only such component in this
    package.** Radix exports it as `unstable_PasswordToggleField` and documents
    the API as subject to change; the underlying
    `@radix-ui/react-password-toggle-field` is still on `0.1.11`. `FRAMEWORK.md`
    says explicitly: adopt it behind that stability marker, or wait, but do not
    ship it as Stable. So its props may change in a **minor** release of this
    package, unlike everything else here. Pin `@marktiderman/genesis-ui` if that
    is unacceptable, or compose `Input` + `Button` yourself. Our wrapper does not
    use the `unstable_` prefix in its own export name — the JSDoc tag, the
    showcase badge and this note carry the signal instead.

  `Experimental` is a new value in the `@stability` vocabulary, which previously
  ran `Stable | Beta | Deprecated`. Three places had to learn it, and the two
  generators are the ones that would have failed quietly:
  - `scripts/gen-component-reference.mjs` — an unrecognised value failed its
    regex and rendered as _untagged_, which the legend defines as "treat as
    Beta". That understates the risk.
  - `apps/sample/scripts/generate-primitive-docs.ts` — an unrecognised value fell
    through to `stable`, so the showcase would have advertised a volatile API as
    the supported one. The same failure the `Deprecated` bucket was added to fix.
  - `standards/upgrade-process.md` — the canonical policy that _defines_ the
    values. It now documents what `Experimental` means for production use, why it
    is narrower than `Beta` (upstream owns the timing, not us), and how something
    graduates out of it: to `Beta` once the vendor stabilises the API, then up
    the normal ladder. A value the tooling renders but the standard does not
    define is not a policy, it is a string.

  One documentation correction worth stating plainly, because an earlier draft of
  this work had it backwards. `VisuallyHidden`'s robustness argument — inline
  styles cannot be lost by a consumer's build — has an exact inverse: a
  `className` cannot override the clipping _deliberately_ either. The component
  therefore does **not** support a class-driven focus reveal, and it is the wrong
  primitive for a skip link, which needs state rather than a class. The override
  channel is the `style` prop, which Radix spreads last. Both halves are now
  stated in the JSDoc and pinned by tests.

  Each primitive ships behavioural tests (roving tabindex and focus movement for
  `Toolbar`; a11y-tree presence, clip-not-hide, and the className-loses /
  style-wins pair for `VisuallyHidden`; accessible-name derivation for
  `AccessibleIcon`; type flipping, `aria-controls`, state-dependent label,
  re-mask-on-submit and the containing-block guarantee for
  `PasswordToggleField`) and a per-component subpath export, so
  `@marktiderman/genesis-ui/toolbar` resolves to just that component.

- 2e0dcb3: `ResourcePage` gains three additive props so consumers can adopt it without losing custom cards or list keyboard navigation:
  - `renderCard(item, index, actions)` — override the default card/list-item renderer for grid and list views while ResourcePage keeps handling data-fetching, filtering, and layout. Receives the new `ResourceCardActions<T>` (also exported): the resource's `update`/`remove`/`refetch` plus a row-bound `open()` that activates the row, opening the configured detail panel/modal/route. Row activation is not applied automatically to a custom card — wrapping it would double-fire against cards that bring their own click handling and would hijack clicks on nested controls — so call `actions.open()` from wherever your card should activate.
  - `gridCols` — Tailwind grid-column classes passed straight through to the underlying `DataGrid`'s own `gridCols` prop.
  - `keyboardNavigation` (default `true`) — wires the existing (previously unconsumed) `useKeyboardNavigation` hook: j/k (or Arrow Up/Down) move a focus cursor a row at a time, Arrow Left/Right move a card within the row, Enter opens the focused item, Backspace (⌫) closes an open detail view, and x toggles the focused item's selection when `bulkActions` are configured. Set to `false` to opt out.

  `ResourcePage`'s built-in default card and list row are now real activatable rows — `role="button"`, a tab stop, Enter/Space activation, a focus-visible ring, and `data-testid="resource-card"` / `data-testid="resource-list-row"`. Previously they carried only an `onClick`, so a keyboard-only user could reach them with neither Tab nor (before this release) a list cursor.

  Because keyboard navigation is on by default, it is scoped so it cannot disrupt existing `ResourcePage` consumers or the surrounding app:
  - Active only in grid and list views — table view manages its own independent sort/pagination.
  - Cursor keys suspend while a detail panel/modal or the built-in form is open, so they cannot drive the list behind the overlay; ⌫ stays live there so it can dismiss it. Escape is never consumed, so Radix's own dismiss on `DetailPanel`'s dialog/sheet shells still works.
  - Backspace is intercepted only while there is an open detail to close, so the key stays available to the browser and the app everywhere else — and even then it is left alone for text-entry surfaces and for composite widgets that use it themselves (listbox, menu, tree, grid, combobox, spinbutton, slider, `canvas`, or anything under `[data-keyboard-nav="off"]`).
  - A key that would do nothing is never swallowed: Arrow Up/Down fall through to the browser's page scrolling on an empty list, and at either end of a full one.
  - Modified chords (Ctrl/Meta/Alt) are never captured, so app shortcuts such as Cmd+K keep working.
  - The cursor stops at the last item actually rendered by `DataGrid`'s infinite-scroll batching rather than walking into unrendered rows.

  `useKeyboardNavigation` gains two options: `onBack` (fired on Backspace, and the switch that decides whether Backspace is intercepted at all) and `overlayOpen` (suspends cursor/activation keys while keeping the dismissal keys live). It now also ignores modified chords, contenteditable surfaces, and focused controls or anything inside a `dialog`/`menu`/`listbox`, so Enter on a focused button activates that button instead of re-opening the list's focused row.

  Its `columns` option now drives the _vertical_ stride, so Arrow Down/Up (and j/k) move a whole row in a multi-column grid instead of one cell to the right, while Arrow Left/Right move one cell. `columns` is now optional: left unset, the hook measures the live column count from the container's resolved `grid-template-columns` on each keypress — the only value that stays correct across a responsive ramp such as `sm:grid-cols-2 lg:grid-cols-3`. A non-grid container measures as one column, so list stepping is unchanged.

  `DataGrid`'s list view now also gets the `focusedIndex`/`keyboardContainerRef`-driven focus ring and `data-nav-item` scroll targeting that its grid view already had.

- 1766706: Add progress/health status tokens and a `StatusBadge` component.

  **`@marktiderman/genesis-design-system`** — extended the `status` color
  tokens (`tokens/dtcg/colors.json` source, mirrored in `src/tokens/colors.ts`
  and regenerated into `src/tokens/native.ts`) with five new EOS/OKR-style
  progress tokens, each resolving to an existing `semantic` color (no new
  hues): `onTrack` / `done` → `semantic.success`, `atRisk` → `semantic.warning`,
  `offTrack` → `semantic.error` (joining the existing `blocked`, same color),
  `inProgress` → `semantic.info`.

  **`@marktiderman/genesis-ui`** — added `StatusBadge`, a CVA-based component
  (structural sibling of `Badge`) whose `status` variant keys are exactly this
  new token vocabulary (`onTrack` / `atRisk` / `offTrack` / `done` / `blocked`
  / `inProgress`), type-checked against
  `@marktiderman/genesis-design-system`'s `status` tokens via a `Pick<>` +
  `satisfies` guard so the two packages can't silently drift. Where `Badge`
  answers "what color is this badge", `StatusBadge` answers "what does this
  business status look like as a badge" — it owns the status → semantic-token
  mapping so consumers pass a status name instead of hand-rolling their own
  status-to-color lookup. Colors are token-only (`bg-success` / `bg-warning`
  / `bg-destructive` / `bg-info`, the same semantic Tailwind families `Badge`
  already uses) — no raw hex in the component. `@marktiderman/genesis-design-system`
  is now a peer dependency of `@marktiderman/genesis-ui`.

  Motivating consumer: `marktiderman/breakthrough`'s master-plan item 25 (U9)
  replaces its local, raw-Tailwind-class `status-colors.ts` with this
  token-backed `StatusBadge`.

- bb33975: Widen `Tooltip`'s `content` to `ReactNode`, add `asChild` to `Button`, and converge the two `EmptyState` implementations onto one canonical component. Every prop and type in this release stays source-compatible; **`EmptyState` changes what it renders** — see its entry below before upgrading.
  - **`Tooltip`** — `content` was typed as `string`; it now accepts `ReactNode` so tooltips can carry icons, formatted text, or multiple lines, not just plain strings. `TooltipProps` is now exported from the package root. (`content` previously collided with the RDFa `content?: string` attribute `HTMLAttributes` already declares; `TooltipProps` now `Omit`s that before redeclaring it with the wider type — every existing string-content usage still satisfies the new type.)

    Two fixes ride along. The bubble now also carries `group-focus-within:block`, not just `group-hover:block` — previously a keyboard user who tabbed to the trigger never saw the tooltip at all. And the bubble is a `<div>` rather than a `<span>`, since phrasing content cannot legally contain the block elements a `ReactNode` `content` invites. Both are covered by new tests. Note the bubble keeps `whitespace-nowrap`, so rich content does not soft wrap on its own — pass an explicit `<br />` or a `whitespace-normal` node.

  - **`Button`** — adds the standard shadcn/Radix `asChild` pattern via `@radix-ui/react-slot`: render `Slot` instead of `<button>` so consumers can compose Button's classes onto an anchor, router `Link`, or other element without an extra wrapper node. The spinner and `startIcon`/`endIcon` chrome are not injected in this mode (Radix `Slot` takes exactly one child).

    **Install note:** `@radix-ui/react-slot` is a new **required** peer dependency, in line with every other Radix peer this package declares (none are optional). `button.tsx` imports `Slot` at module scope and the root barrel re-exports `Button`, so it is needed by any import of `@marktiderman/genesis-ui` — it cannot honestly be marked optional. It is already an internal dependency of every other `@radix-ui/*` package, so hoisted installs will have it; a strict/isolated `node_modules` layout needs it added explicitly.

    Two details worth knowing when using `asChild`:
    - **`disabled` gets ARIA semantics, not the attribute.** `disabled` is button-only — anchors and router links ignore it, don't match `:disabled`, and stay fully clickable. So in `asChild` mode Button emits `aria-disabled`, blocks click/Enter/Space activation, and applies the disabled styling directly, instead of forwarding a `disabled` attribute that would do nothing. `loading` is treated the same way (inert, but no spinner injected). Known limitation: Radix `Slot` composes handlers child-first, so a handler on the child itself still runs before Button's guard — the default action is still prevented.
    - **Typing follows the rendered element.** `Button` is now overloaded: `ButtonAsChildProps` (new, also exported) types `ref` and event handlers against `HTMLElement`, since that is what `Slot` forwards them to — an anchor ref is accepted, and handlers can no longer reach button-only members like `.form` on what is really an anchor. `ButtonProps` is unchanged for the default `<button>` mode and remains an `interface` (still safe to `extend`); its `asChild` is typed `false` so the overloads discriminate, meaning `asChild` must be passed as a literal rather than a computed boolean. `CarouselPrevious`/`CarouselNext` now `Omit` `asChild` from their props — they render two children, which `Slot` cannot accept.

  - **`EmptyState`** — the root `EmptyState` (`@marktiderman/genesis-ui`) is now canonical and gains `hasFilters` / `onClearFilters` (renders a "no results match your current filters" state with a "Clear all filters" action in place of `title`/`description`/`action`) plus a deprecated `message` prop kept for source compatibility. `@marktiderman/genesis-ui/data`'s `EmptyState` is now a `@deprecated` re-export of the root component (`@stability Deprecated`, targeted for removal at the next major/2.0) instead of a separate implementation.

    🟡 **Visual change for `/data` consumers — check your empty states after upgrading.** Every prop the `/data` variant offered (`icon` / `message` / `action` / `hasFilters` / `onClearFilters`) still compiles and still means the same thing, so no call site needs editing. But the alias now renders the ROOT component, and the two never looked alike:

    |                    | `/data` before                                  | root, after                                                                               |
    | ------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
    | entrance animation | `animate-fade-in`                               | none                                                                                      |
    | container          | `py-16`                                         | `flex … py-12 px-4`                                                                       |
    | default icon       | `Search`, bare, `h-10 w-10`, muted at 30% alpha | `FileQuestion`, `h-8 w-8` at full muted, inside an `h-16 w-16 rounded-full bg-muted` chip |
    | message element    | `<p>` muted, base size                          | `<h3>` `text-lg font-semibold`                                                            |
    | default copy       | "No items found"                                | "No results found"                                                                        |
    | action offset      | `mt-4` (clear-filters `mt-2`)                   | `mt-6`                                                                                    |

    This reaches further than direct importers: `DataPageShell` passes `emptyIcon` / `emptyMessage` straight through and neither has a default, so any page that omits them picks up the new icon and copy. That is the intended outcome of converging two divergent implementations — one design system, one empty state — but it is a real appearance change, so budget a visual pass rather than treating the upgrade as a no-op.

### Patch Changes

- 9412ff4: Drop five peer dependencies `genesis-ui` declares but never imports:
  `@hookform/resolvers`, `@tanstack/react-query`, `@tanstack/react-table`,
  `react-dom` and `zod`.

  Verified by scanning every non-test source file in `packages/ui/src` for an
  import of each — none matched. Three of the five (`@tanstack/react-query`,
  `zod`, `@hookform/resolvers`) are already declared correctly by
  `@marktiderman/genesis-core`, which does import them, so a consumer using both
  packages is unaffected; a consumer using only `genesis-ui` stops being told to
  install five libraries it never loads.

  `@tanstack/react-table` is the one worth calling out separately: `table.tsx` is
  a presentational `<table>` wrapper and `DataTable` handles its own sorting and
  pagination, so nothing in the package has ever imported it. Removing the
  declaration reflects that; adopting TanStack Table in `DataTable` remains open
  as a separate decision.

  `genesis-ui` has no runtime import change — nothing in its source imported
  these, so nothing can break through this package.

  **Do not read this as "you may uninstall all five."** `genesis-ui` depends on
  `@marktiderman/genesis-core`, which imports and correctly declares
  `@tanstack/react-query`, `zod` and `@hookform/resolvers` — anything using
  `genesis-ui/data` or `genesis-ui/hooks` still needs those three, now sourced
  from core rather than double-declared here. And per the usual rule, an
  application that imports a package directly should declare it directly rather
  than rely on a transitive peer.

- Updated dependencies [1766706]
- Updated dependencies [e1e5b94]
  - @marktiderman/genesis-design-system@1.2.0
  - @marktiderman/genesis-core@1.1.1

## 1.3.0

### Minor Changes

- 2ef8730: Add Linear/Notion-style chrome options on `AppShell` and `PageHeader` (`AppShellOptions` / `PageHeaderOptions`): collapsible header details, sidebar collapse + secondary/subnav groups, mobile bottom nav, customize popovers with optional localStorage, and `scrollRoot: "window"` for React Router scroll restoration. Additive and back-compatible — existing layouts keep prior defaults.

## 1.2.0

### Minor Changes

- f4da5b4: Form primitives now carry the modern shadcn hooks consumers rely on (closes genesis#238 for Input/Textarea/Label):
  - `Input`, `Textarea`, `Label` emit a `data-slot` attribute (`input` / `textarea` / `label`) for slot-targeted styling and testing.
  - `Input` + `Textarea` add `aria-invalid:` error styling (`border-destructive` + `ring-destructive/50`), so validation state is reflected visually — inert until `aria-invalid` is set, so no change to existing usage.
  - `Textarea` adds `field-sizing-content` (auto-grow with content) while keeping its `min-h-[80px]` floor.

  Additive only — no prop/type changes; unblocks tenants (e.g. gamify dashboard) collapsing their local shadcn copies onto genesis-ui. Full base-class modernization (h-9/ring-[3px]) + the RHF `Form`/`FormField` API remain a follow-up.

### Patch Changes

- 88ad204: Fix Badge `success`/`warning`/`info` status text failing WCAG AA contrast. The variants rendered same-hue text on a tinted chip (e.g. `text-success` on `bg-success/15`), measuring ~1.9–3.1:1 against the 4.5:1 AA floor. Native now uses the AA-safe darker status token (`text-success-dark` etc. → ~6.3–7.4:1); web uses the matching 700-weight ramp (`text-emerald-700`/`text-amber-700`/`text-blue-700`, with `dark:` 300 stops for the darkened chip). Chip backgrounds and all other variants are unchanged.

## 1.1.1

### Patch Changes

- 613e4bc: Repoint genesis-ui's internal data components at the genesis-core provider
  context, fixing a dual-context packaging drift.

  `genesis-ui` shipped its own private copy of the data provider context and the
  resource hooks (`use-resource`, `use-one`, `use-resource-form`, `use-wizard`).
  Because every `createContext()` call mints a distinct instance, the exported
  `<GenesisProvider>` — which comes from `@marktiderman/genesis-core` — populated
  core's context, while `ResourcePage` (resource mode), `ResourceForm`, and
  `RelationField` read genesis-ui's local, never-populated copy. The result was a
  thrown `useDataProvider must be used inside <DataProviderRoot> or
<GenesisProvider>` even when the app WAS wrapped correctly.

  The internal imports now resolve through the same `@marktiderman/genesis-core`
  specifiers the public `./hooks` and `./provider` entry points already re-export,
  and the orphaned local copies are deleted, so components and provider share one
  context instance. This is an internal repoint — the public API and dts surface
  are unchanged.

## 1.1.0

### Minor Changes

- 90446ff: Add `loading`, `startIcon`, and `endIcon` slots plus a `type="button"` default to `Button` (promoted from the Gamify `genesis-web` mirror so the dashboard can consume `genesis-ui` directly). Additive — the existing `ButtonProps` (variant/size/ref) is unchanged.

## 1.0.0

### Major Changes

- e972635: Rename the npm scope from the old pre-public scope to `@marktiderman` across all Genesis packages: `genesis-*` → `@marktiderman/genesis-*`.

  The data-layer package additionally shortens its name to `@marktiderman/genesis-switchboard` (dropping the redundant `data-` prefix while keeping the `genesis-` family prefix consistent with the other packages).

  **Breaking change.** Consumers must update every import specifier and dependency entry (e.g. `genesis-ui` → `@marktiderman/genesis-ui`, and `genesis-data-switchboard` → `@marktiderman/genesis-switchboard`). Per npm best practice the previous pre-public-scope names will be `npm deprecate`d with a pointer to the new names once the `@marktiderman/*` packages are published. The legacy `genesis@2.0.0` umbrella package under the old scope is unaffected (separate lineage).

### Minor Changes

- 41cd84d: Make `@marktiderman/genesis-ui` router-agnostic — remove the hard dependency on React Router so the package can be consumed cleanly from Next.js (or any framework, or no router at all).

  `react-router` has been dropped from `peerDependencies`. Components that previously imported the router directly now accept an injectable navigation abstraction and default to plain browser behavior (a `<a>` element / `window.location`), so they work with no router out of the box.

  **Breaking change** for consumers relying on the built-in React Router integration. New router-agnostic contract (exported from the package root and `/data`):
  - `LinkComponent` / `GenesisLinkProps` — an injectable link component contract (`href`, `className`, `onClick`, `children`, `aria-current`). Default: `DefaultLink` (plain `<a>`).
  - `NavigateFn` / `defaultNavigate` — an injectable imperative-navigation callback. Default: full-page navigation.
  - `SearchParamsAdapter` / `useBrowserSearchParams` — a router-agnostic `useSearchParams`-shaped adapter. Default: browser History API.
  - `isPathActive` — the default active-path matcher (prefix match, `/` exact).

  Affected component/hook APIs:
  - **`AppShell`** — new props `linkComponent?: LinkComponent`, `activePath?: string`, `isActive?: (to, activePath) => boolean`. Previously relied on RR `NavLink` for links + active state; now inject your router's link and pass the current path.
  - **`StatCard`** — new prop `linkComponent?: LinkComponent` (used when `href` is set). Previously rendered an RR `Link`.
  - **`ResourcePage`** — new prop `onNavigate?: NavigateFn` (used only for `detail="route"` row clicks). Previously called RR `useNavigate`.
  - **`useDataFilters`** — new optional third arg `{ searchParams?: SearchParamsAdapter }`. Previously called RR `useSearchParams`; now defaults to the browser History API.

  **Migration (React Router consumers):**

  ```tsx
  import { Link, useLocation } from "react-router";
  import { AppShell, type LinkComponent } from "@marktiderman/genesis-ui/data";

  const RouterLink: LinkComponent = ({ href, ...props }) => (
    <Link to={href} {...props} />
  );

  <AppShell
    navItems={items}
    linkComponent={RouterLink}
    activePath={useLocation().pathname}
  />;

  // ResourcePage row-click navigation — wire onNavigate to your router, or it
  // silently falls back to a full-page reload (defaultNavigate) with no type error.
  const navigate = useNavigate();
  <ResourcePage detail="route" onNavigate={navigate} /* … */ />;
  ```

  **Migration (Next.js consumers):** pass `next/link` directly as `linkComponent` (it already accepts `href`), and set `ResourcePage`'s `onNavigate={router.push}` (from `next/navigation`'s `useRouter`) — without it, `detail="route"` row clicks fall back to a full-page reload instead of SPA navigation.

- 41cd84d: Make `@marktiderman/genesis-ui` a smooth Next.js App Router consumer — three fixes surfaced by a real RSC consumption spike:
  1. **Ship `"use client"` in the built dist.** Interactive components (anything using React hooks or Radix/`cmdk`/`vaul`/`embla`/`input-otp`/`react-day-picker`/`react-resizable-panels`/`sonner` client primitives) now carry `"use client"` at the source, and the build preserves per-file directives on the emitted chunks. Previously the dist had **no** directives, so a Next.js RSC server graph importing the barrel crashed at module-init (`Cannot read properties of undefined (reading 'displayName')`). Pure presentational primitives (Button, Card, Badge, Alert, Input, Table, Separator, Skeleton, Spinner, Tooltip, Typography, …) stay directive-free and remain server-importable. The barrel (`.`) is a neutral re-export shell — importing a server-safe primitive from it does not pull a client boundary.
  2. **Per-component subpath exports.** `@marktiderman/genesis-ui/button`, `/card`, `/dialog`, … (one subpath per primitive) now resolve to just that component instead of dragging the whole barrel + ~25 peer deps (all Radix, recharts, cmdk, vaul, …). The curated `.`, `./data`, `./hooks`, `./utils`, `./status-colors`, `./provider` subpaths are unchanged. `react-router` stays fully isolated — no primitive pulls a router dependency.
  3. **Correct `.d.ts` React-namespace aliasing.** `cva` variant props (`variant`, `size`, …) are now exposed on component prop types. Previously the bundled types referenced a bare `React` namespace while importing React as `React$1`, collapsing the `VariantProps` intersection so consumers couldn't pass `variant`/`size` in JSX (`Property 'variant' does not exist on ButtonProps`). Every source file now imports React consistently as `import * as React from "react"`, so the emitted types stay coherent.

  No API surface is removed; existing imports keep working. New: 52 per-component subpaths.

### Patch Changes

- Updated dependencies [e972635]
  - @marktiderman/genesis-core@1.0.0

## 0.2.0

### Minor Changes

- a4d4872: feat(theme): unified `<GenesisThemeProvider>` + `useTheme()` API across web and native (PRD-07 A2b).

  `useTheme()` returns the same TypeScript shape on web + native:
  `{ brand, mode, resolvedMode, setMode, tokens }`. Build-time codegen via the
  `tailwindFromBrand` (web) / `themeFromBrand` (native) factories shipped in
  A4.0 (the cross-platform-factory spike) feeds the provider's runtime layer; consumers no
  longer maintain three parallel theme mechanisms.

  This PR ships the unified API ADDITIVELY behind the `GENESIS_THEME_V2` env
  flag. The legacy v1 native provider at
  `@marktiderman/genesis-design-system/providers/native` continues to work — it
  will be removed in the final commit of A2b once visual parity is confirmed
  on `apps/sample` + `apps/sample-native`, OR in a follow-up `G-PR-3b` PR if
  parity is deferred. See `docs/MIGRATION.md` `v0.2.x → v0.3.0`.

  Ships in v0.2.0.

## 0.1.1

### Patch Changes

- 00b2743: First publish from the canonical `marktiderman/genesis` repo. Bumps the existing `@marktiderman/genesis-*` v0.1.0 packages (originally published 2026-04 from prior fork repos PRD-07 Phase A6 retires) to v0.1.1 with the canonical genesis-repo content. Consumers install with zero auth: `pnpm add @marktiderman/genesis-ui`. Each publish emits a Sigstore provenance attestation linking the tarball back to this commit + the workflow run via OIDC. Publishing infrastructure: Changesets + `changesets/action` + `.github/workflows/release.yml` using **OIDC Trusted Publishing** (no NPM_TOKEN secret; short-lived token issued at publish time via GitHub Actions identity).
- Updated dependencies [00b2743]
  - @marktiderman/genesis-core@0.1.1
