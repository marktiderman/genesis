# Genesis Migration Guide

Per-version migration notes for `@marktiderman/genesis-{core,design-system,ui,ui-native}`. **Genesis ships breaking changes at minor on 0.x; consumers need this doc to know what changed.** v1.0+ shifts to breaking changes only at major.

This file is appended to (never rewritten) at every release. Newest version on top.

> **Status conventions:**
> 🟢 No action needed — drop-in replacement.
> 🟡 Action recommended — update preferred but not strictly required.
> 🔴 Action required — code will break without changes.

---

## `@marktiderman/genesis-ui` — `Tooltip`, `Tabs` and `ScrollArea` move to Radix (breaking behavior; **major** semver bump)

🔴 **Action required** — nothing needs editing to *compile*, but working code can stop working. Read the three checks below before upgrading.

Both senses of "major" apply here and they agree. `docs/README.md` fixes the rule — *"Genesis ships breaking changes at **minor on 0.x** and **major on 1.x+**"* — and `genesis-ui` is on **1.x** (1.3.0 as this is written), so a breaking change takes a **major**. The 0.x-ships-breaking-at-minor half of that rule does not apply to this package. It *does* apply to the umbrella `@marktiderman/genesis`, which is on 0.x and therefore takes a **minor** for the very same break — the two different bump levels in this release are the same policy, not a contradiction.

Step 5 of the `docs/FRAMEWORK.md` migration sequence. These were the last three primitives hand-rolling behavior Radix already solves.

**Every existing prop, export and type stays source-compatible.** Two optional props are added — `Tooltip`'s `delayDuration` (pointer-hover delay, default `0`) and `ScrollArea`'s `viewportProps` (addresses the inner viewport, and is the fix for the `ref` break below) — plus `orientation` / `dir` / `activationMode` pass-throughs on `Tabs`. What changed beyond that is the DOM these three render, how they respond to pointer, keyboard and assistive tech, and **which element `ScrollArea`'s `ref` usefully addresses**.

`radix-ui` (the unified package) is a **new required peer dependency** — add it alongside the existing Radix peers.

### The three things that can break

1. **`ScrollArea` no longer scrolls on the element you hold a ref to.** The root is now `overflow: hidden` and scrolling happens on an inner `[data-radix-scroll-area-viewport]`. `ref.current.scrollTop = …`, `ref.current.scrollTo(…)` and `ref.current.scrollHeight` all target the root, which never scrolls — silently, with no error. Anything that scrolls a log, chat pane or long list programmatically must reach the viewport instead, via the new `viewportProps`:

   ```diff
   - const ref = useRef<HTMLDivElement>(null);
   - <ScrollArea ref={ref}>{rows}</ScrollArea>
   - ref.current.scrollTop = ref.current.scrollHeight;
   + const viewportRef = useRef<HTMLDivElement>(null);
   + <ScrollArea viewportProps={{ ref: viewportRef }}>{rows}</ScrollArea>
   + viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
   ```

   `onScroll`, `onScrollCapture` and `nonce` are routed to the viewport **for you** — they have no other correct destination. `scroll` does not bubble, so an `onScroll` left on the root would never fire once; and Radix reads `nonce` only on the viewport, where it spends it on the `<style>` that hides the native scrollbar. Anything else that must address the scroller (`tabIndex`, an `id`) goes through `viewportProps`. Everything else still lands on the root.

2. **`Tabs` selects on `mousedown`, not `click`.** Real pointer use is unaffected (mousedown precedes click). Tests are not: `fireEvent.click(tab)` no longer changes tabs — use `fireEvent.mouseDown(tab, { button: 0 })`, or `userEvent.click`, or activate via keyboard.

3. **`Tooltip`'s bubble is portalled to `document.body` and does not exist while closed.** Any selector, snapshot or `getByRole("tooltip")` that assumed an always-present bubble inside the trigger's wrapper needs to open the tooltip first (focus or hover the trigger) and query from `document.body`.

### Also worth checking

- **`ScrollArea` nests content two levels deeper**, inside the viewport and then a `min-width:100%; display:table` sizing wrapper. A direct-child selector (`.my-scroller > .row`) stops matching, a child with `height: 100%` no longer resolves against the scroller, and former flex children are no longer flex children of anything.
- **`ScrollArea` scrollbars now render on Firefox.** They previously fell back to the OS scrollbar because the old styling was `::-webkit-scrollbar`-only. Intended, but visible.
- **`Tabs` tab order changes.** The triggers become a single roving tab stop (Arrow/Home/End move between them) and each visible panel is focusable per the ARIA pattern. Keyboard-driven E2E flows need re-recording.
- **`Tabs` active styling moved to `data-[state=active]:` variants.** Visually identical, but every trigger now carries the same class string, so `classList.contains("bg-background")` on the active trigger no longer discriminates — read `data-state` instead.
- **`Tooltip` triggers must be a single element that forwards its ref to a DOM node.** A function component that swallows `ref` will not anchor or open properly. Bare text, a fragment, or several children still work (they get a `<span>` wrapper) but, as before, are not keyboard-reachable.
- **`Tooltip.aria-describedby` is now present only while open**, which is the correct ARIA behavior; it used to be permanently set. An `aria-describedby` you set yourself on the trigger is preserved and unioned with the tooltip's, not replaced.
- **`Tooltip` carries your theme across the portal.** The bubble mirrors the nearest ancestor's `data-theme` onto itself, so `[data-theme="dark"]`-scoped variables still resolve on a portalled bubble. The portal target is `document.body`, so a class-based scheme on `html` or `body` (`.dark`, `.theme-dark`) **still applies** and needs no change. The only case that escapes is a non-`data-theme` scope on an ancestor *below* `body` — an app-root `<div class="dark">`, say. For that, either move the class to `html`/`body`, or scope by `data-theme` (what `GenesisThemeProvider` emits).
- **`Tooltip` animates on entrance where it previously did not**, honouring `prefers-reduced-motion` via `motion-reduce:` variants.
- **All three now carry `"use client"`.** They were already interactive, so a Next.js server component can still import them — but they land in the client bundle.

### What you get for it

Portalled, collision-aware tooltips with dismissal and an opt-in `delayDuration`; the complete WAI-ARIA tabs pattern (roles, `aria-selected`, `aria-controls`/`aria-labelledby`, roving `tabindex`, Arrow/Home/End with wrap-around, disabled triggers skipped); and one scrollbar implementation that looks and behaves the same in every browser.

---

## `@marktiderman/genesis-data` — demoted-table cleanup in `scaffold()` (patch)

🟡 **Action recommended** — `genesis-data init` / `scaffold()` behavior changed; review console output after upgrading if your repo has ever run PR #271's core/genesis-only reshuffle.

Follow-up to PR #271 (which moved `harness-uses`/`harness-blocks`/`skills` out of `core:` into `genesis-only:`, and `agents`/`principles`/`library`/`research` the other way). Before this release, `scaffold()` only ever ADDED core contracts — a tenant that had already scaffolded a table before it was demoted kept that table's stale `data/_schema/tables/<t>.yml` and `data/<t>/` trellis forever, still validated by the roller as if still shipped. `scaffold()` now detects every demoted-but-still-recognized table and either:

- **removes** the stale schema file + trellis dir, when the tenant never put real content there — a bare `.gitkeep` and/or an untouched pristine default `_template.md` only — reported in `ScaffoldSummary.demotedRemoved`; or
- **keeps it in place with a loud console warning**, when the tenant has real rows and/or a genuinely customized template — reported in `ScaffoldSummary.demotedKept`. Row-safe: tenant content is never silently deleted.

### What this means for consumers

- Re-run `genesis-data init` (or your `postinstall`/CI step that calls `scaffold()`) after upgrading, and read the console summary — or the new `demotedRemoved`/`demotedKept` arrays if you call `scaffold()` programmatically.
- If a table you cared about shows up under `demotedKept`, migrate/archive its rows manually, then remove `data/_schema/tables/<t>.yml` and `data/<t>/` yourself once done.
- `ScaffoldSummary.demotedRemoved` / `.demotedKept` are **optional** fields — existing code that constructs or mocks this exported type against the pre-existing shape keeps type-checking.

---

## v0.3.x → v1.0 — npm scope rename (old scope → `@marktiderman`) + `genesis-ui` v2.0 (router-agnostic)

🔴 **Action required** — imports break without changes.

First `@marktiderman`-scoped publish. Versions: umbrella `@marktiderman/genesis` `1.0.0`; `-ui` `2.0.0`; `-core` / `-design-system` / `-cli` / `-switchboard` `1.0.0`; `-ui-native` `0.2.0`. Two breaking changes ship together.

### What changed

1. **npm scope rename** — every package moved from the old pre-public scope's `genesis-*` names to `@marktiderman/genesis-*`. The data-layer package also shortened its name: `genesis-data-switchboard` → `@marktiderman/genesis-switchboard` (dropped the redundant `data-` prefix).
2. **`genesis-ui` is now router-agnostic** — the hard `react-router` peer dependency is gone, so the package consumes cleanly from Next.js (or any framework, or none). Components that imported the router directly now take an injectable navigation abstraction and default to plain browser behavior (`<a>` / `window.location`).

### What this means for consumers

- **Everyone:** update every import specifier and dependency entry to the `@marktiderman/*` names (and `-data-switchboard` → `-switchboard`). The old pre-public-scope packages will be `npm deprecate`d with a pointer once the new ones publish. (The legacy `genesis@2.0.0` umbrella under the old scope is a separate lineage, unaffected.)
- **React Router consumers of `genesis-ui`:** inject your router's link + current path. `AppShell`/`StatCard` stay type-safe, but `ResourcePage` route-clicks fall back to a full-page reload until you wire `onNavigate`.
- **Next.js / no-router consumers:** the new defaults (`<a>` + History API) work out of the box — this is what unblocks the Gamify dashboard consuming `@marktiderman/genesis/*`.

### Concrete changes

**1. Scope rename** — `package.json` + imports:

```diff
- "genesis-ui": "^0.3.0"   # old pre-public scope
+ "@marktiderman/genesis-ui": "^2.0.0"
- "genesis-data-switchboard": "^0.3.0"   # old pre-public scope
+ "@marktiderman/genesis-switchboard": "^1.0.0"
```

**2. Router-agnostic `genesis-ui`** — new injectable-navigation contract (exported from the root + `/data`): `LinkComponent` / `GenesisLinkProps` (default `DefaultLink` = plain `<a>`), `NavigateFn` / `defaultNavigate`, `SearchParamsAdapter` / `useBrowserSearchParams`, `isPathActive`. Affected APIs: `AppShell` (+`linkComponent` / `activePath` / `isActive`), `StatCard` (+`linkComponent`), `ResourcePage` (+`onNavigate`), `useDataFilters` (+ optional `{ searchParams }`).

React Router consumers restore the previous behavior by injecting your router:

```tsx
import { Link, useLocation, useNavigate } from "react-router";
import { AppShell, ResourcePage, type LinkComponent } from "@marktiderman/genesis-ui/data";

const RouterLink: LinkComponent = ({ href, ...props }) => <Link to={href} {...props} />;

<AppShell navItems={items} linkComponent={RouterLink} activePath={useLocation().pathname} />;

// ResourcePage row-click nav — wire onNavigate or it falls back to a full-page reload:
const navigate = useNavigate();
<ResourcePage detail="route" onNavigate={navigate} /* … */ />;
```

---

## v0.2.x → v0.3.0 — Theme system unified (PRD-07 Phase A2b)

🟡 **Action recommended for consumers wiring theme manually. Existing v1 path continues to work alongside until the final A2b commit (or G-PR-3b if visual parity is deferred).**

### What changed

The theme system collapses three mechanisms into one runtime model:

- CSS variables on web (Tailwind v4 `@theme` block, emitted by `tailwindFromBrand()`).
- NativeWind v5 token map on native (`themeFromBrand().css` for Metro + `variables.{light,dark}` for runtime mode switching).
- A single `<GenesisThemeProvider>` + `useTheme()` API exposed from `@marktiderman/genesis-design-system`. Identical TypeScript shape on both platforms.

A `GENESIS_THEME_V2` env-flag gates the new path during the dual-mode window so v0.2.x consumers stay unaffected. Set `GENESIS_THEME_V2=true` (or `VITE_GENESIS_THEME_V2=true` for Vite consumers) to opt in.

### Before (v0.2.x)

```tsx
// Web — relies on CSS vars in app.css; no provider exists
import "./app.css";
<GenesisProvider mock={...}>
  <App />
</GenesisProvider>;

// Native — different import path + brand-id string + separate hook name
import { GenesisThemeProvider } from "@marktiderman/genesis-design-system/providers/native";
<GenesisThemeProvider brand="genesis" mode="light">
  <App />
</GenesisThemeProvider>;

// const theme = useGenesisTheme();   ← native-only hook
```

### After (v0.3.0)

```tsx
// Same import + same shape on both platforms
import {
  GenesisThemeProvider,
  useTheme,
  type CanonicalBrand,
} from "@marktiderman/genesis-design-system";

const brand: CanonicalBrand = { /* full canonical brand object */ };

<GenesisThemeProvider brand={brand} mode="system">
  <App />
</GenesisThemeProvider>;

// Anywhere in the tree, same shape on web + native:
const { brand, mode, setMode, tokens } = useTheme();
```

### Migration steps

1. **Construct a `CanonicalBrand` object.** The unified provider takes a full brand object (not the v1 brand-id string). Use the OOTB Genesis brand inline, or import a consumer brand package (`@gamify/brand`, `@acme/brand`).
2. **Replace the v1 native import.** Swap `@marktiderman/genesis-design-system/providers/native` for the root `@marktiderman/genesis-design-system`. Remove `useGenesisTheme()` calls; replace with the unified `useTheme()`.
3. **Wire the factory output once at brand-package build time.** `tailwindFromBrand(brand).css` lands in your web `app/styles/tailwind.css`; `themeFromBrand(brand).css` lands in your native `apps/<app>/global.css`. The provider is the runtime layer; the factories are build-time.
4. **(During the dual-mode window) Beta-test behind `GENESIS_THEME_V2=true`.** Observe rendering against your existing v1 setup. Report regressions before the v1 path is removed.

### Concrete changes

- New exports from `@marktiderman/genesis-design-system`: `GenesisThemeProvider`, `useTheme`, `resolveTokens`, types `ResolvedTokens`/`UseThemeReturn`/`ThemeMode`, plus the `GENESIS_THEME_V2` flag readers.
- New subpath `./theme` (defaulted to web variant; Metro picks `./theme/index.native.js` via `react-native` export condition).
- v1 surfaces (`./providers/native` + `useGenesisTheme()`) remain available during the dual-mode window. They are scheduled for removal in the final A2b commit OR in a follow-up `G-PR-3b` PR after visual parity is confirmed in CI.
- TypeScript `jsx: "react-jsx"` enabled in `packages/design-system/tsconfig.json` to support the new `.tsx` provider files.

---

## v0.1.0 → v0.1.1 (PRD-07 Phase A1 — first canonical publish)

🟡 **Action recommended for prior consumers; pure additive otherwise.**

### What changed

This is the first publish from the canonical `marktiderman/genesis` repo. The packages at `@marktiderman/genesis-{core,design-system,ui,ui-native}` v0.1.0 were originally published from prior fork repos (`acme/acme-app` and `acme/acme` workspace forks — PRD-07 Phase A6 retires those forks). v0.1.1 swaps the published content to the canonical genesis-repo source.

### What this means for consumers

**If you currently install `@marktiderman/genesis-*@0.1.0`:**

- API surface is preserved. Public exports unchanged.
- Internal implementation may differ from the prior fork-published v0.1.0 (canonical genesis repo has had additional native-parity work that the forks didn't carry).
- Bump to `^0.1.1` to consume the canonical version.

**If you're installing fresh:**

- Install the latest. No migration needed.

### Concrete changes from prior fork-published v0.1.0

- `@marktiderman/genesis-ui-native` package description updated: `"(NativeWind v4)"` → `"(NativeWind v4-5)"` (matches the existing peerDeps range `^4.0.0 || ^5.0.0-preview`).
- NativeWind peer-dep range widened from `"^4.0.0 || ^5.0.0"` to `"^4.0.0 || ^5.0.0-preview"` so consumers on NativeWind 5 prereleases (e.g., Gamify mobile on `5.0.0-preview.2`) can resolve. Stable `^5.0.0` continues to satisfy.
- Hook namespace convention locked at root `@marktiderman/genesis-core` (PRD-07 Phase A1.8). See `packages/core/src/hooks/index.ts` for the convention. **No existing hook signatures change.**

### Publishing infrastructure migrated to OIDC Trusted Publishing

Internal note (not consumer-facing): publishes now use [npm OIDC Trusted Publishing](https://docs.npmjs.com/trusted-publishers) instead of `NPM_TOKEN`. No long-lived secret; no 2FA bypass; provenance attestations native via `id-token: write` on the workflow. Consumers see no difference except that every published tarball has a verifiable Sigstore provenance attestation linking it back to the exact commit + workflow run.

---

## Visual regression (Phase D-VR)

🟡 **Action recommended for repo maintainers.** No consumer-facing API change.

PRD-07 Phase D-VR ships the visual regression infrastructure that catches silent rendering regressions in `@marktiderman/genesis-ui` (web) and `@marktiderman/genesis-ui-native` (mobile) before they reach downstream consumers. Two surfaces, two pipelines.

### Native — Maestro screenshot diff

- Flows: `apps/sample-native/.maestro/flows/screenshot-{light,dark,reduced-motion}.yaml`.
- Showcase screens: `apps/sample-native/app/components-showcase/*` (deep-link only).
- Workflow: `.github/workflows/visual-regression.yml` (iOS + Android).
- Diff tool: `scripts/diff-screenshots.mjs`.
- Coverage report: `pnpm visual:coverage` → `coverage/visual-coverage.json`.
- Baseline lives in `apps/sample-native/.maestro/screenshots/`. First run on `main` after this PR establishes the baseline; subsequent PRs diff against it.

See `apps/sample-native/.maestro/README.md` for local-run instructions.

### Web — visual regression (not currently covered)

- Storybook: `apps/sample/.storybook/{main.ts,preview.tsx}`.
- Stories: `apps/sample/stories/*.stories.tsx`.
- Workflow: **none.**

`.github/workflows/chromatic.yml` was deleted on 2026-08-03. It had been gated
behind `vars.CHROMATIC_ENABLED == 'true'`, which was never set, so it had never
run once — and activating it required a paid Chromatic account that was never
purchased. Rather than leave a workflow nobody could use and an activation
procedure nobody had followed, both were removed together.

**Known gap — and it is wider than web.** `visual-regression.yml` targets only
`apps/sample-native` and `packages/ui-native`, so web surfaces (`apps/sample`,
`packages/ui`, `packages/design-system`) have **no visual-regression workflow at
all**. But the native side is not actually covered either: as of 2026-08-03 that
workflow reports *"baseline empty (0 captures pending)"* and passes — it has
nothing to diff against until captures are committed to
`apps/sample-native/.maestro/screenshots/`. A green result there currently means
"nothing was compared", not "nothing changed".

So the honest position is: **neither web nor native has a working
visual-regression check today.** Storybook and the stories remain, so this is a matter of wiring up a
runner — Chromatic or otherwise — not of rebuilding the fixtures.

To restore Chromatic specifically: `git show <sha>:.github/workflows/chromatic.yml`
from before that date brings the workflow back, then create a Chromatic project
for `marktiderman/genesis`, add `CHROMATIC_PROJECT_TOKEN` as a repository secret
and `CHROMATIC_ENABLED=true` as a repository variable.

---

## Upcoming (planned per PRD-07)

### v0.1.x → v0.2.0 — brand-strip + canonical schema finalization (Phase A2)

🔴 **Action required for any consumer reading from the schema.**

Will document at release. Highlights:
- 4 brand presets removed from `@marktiderman/genesis-design-system` (`brand-{acme,gamify,breakthrough,team-tiderman}` move to consumer brand packages). `brand-genesis` stays as OOTB fallback.
- `rank` token category dropped from canonical schema (move to consumer brand packages under the new `extensions` slot).
- New `extensions: Record<string, ColorScale>` slot on the canonical token schema for consumer-domain categories.
- Migration: consumers either depend on the new `@<consumer>/brand` packages (which fill the schema) OR fall back to `brand-genesis`.

### v0.x → v1.0 — stability gate

🟢 **No automatic action.**

v1.0 ships only when ALL of:
- 5 production consumer apps where `@marktiderman/genesis-*` is the primary DS (sample-native + sample do NOT count)
- NO workspace fork of `@marktiderman/genesis-*` exists in any consumer repo
- 0 open migration-critical bugs
- 90 consecutive days with all 4 conditions held

Per PRD-07 D3.4. Once v1.0 ships, breaking changes only at major; deprecation lifecycle stretches from "1 minor at 0.x" to "2 minor at 1.x+" per PRD-01 D16.

---

## Configuring Genesis (`genesis.config.yml`)

PRD-07 Phase D5.6 + D5.7. Genesis consumers may add one root-level config file at `genesis.config.yml` (repo root) — the single source of truth for which hooks fire, which CI checks block, and per-repo allowlists. It is optional (zero-config works); when present, it lives at the repo root and is the only place these knobs are read from. See `genesis.config.example.yml` for the canonical reference (every ACTIVE value shown = its default; keys marked reserved are not yet wired; the file is optional — zero-config works).

### Why one file

Before this consolidation, doctrine knobs lived in scattered `.skip-hooks.yml`, `lint-overrides.json`, ad-hoc env vars, and inline comments. SIMPLIFICATION #5: pull every Genesis knob into one place so `git diff genesis.config.yml` answers "what doctrine is this repo running?" in one shot.

### Schema versioning

The file MUST declare `schema_version: <int>` at the top. Validator (`scripts/validate-genesis-config.mjs`) refuses unknown versions. When the schema changes shape (rename a key, change an enum), bump the schema version in the same PR and document the migration here.

### Flag-creep guards (D5.7)

The validator enforces three guards to keep this file from drifting into a sprawling DSL:

1. **HARD MAX 40 keys (recursive count).** Adding a 41st key requires an RFC against `schema/genesis-config.schema.json`. The cap is intentional — every flag is a future migration.
2. **Schema-version field gates breaking changes.** Consumers must explicitly bump `schema_version` before genesis-lint accepts new shapes. Catches silent semantic drift.
3. **Warn-mode age check.** Any flag that's been in `mode: warn` for >90 days surfaces as a deprecation candidate. The intent of `warn` is "we're rolling this out; flip to `block` or remove within a quarter." Anything older than 90 days is dead code in disguise.

### How to add a new hook or CI check

1. Add the entry to `schema/genesis-config.schema.json` (shape).
2. Add the default to `genesis.config.example.yml` (consumer default).
3. Update this section + `hooks/README.md` (docs).
4. Run `node scripts/validate-genesis-config.mjs` to confirm under-40 keys.
5. If you tipped over 40, the validator FAILS — open an RFC before merging.

### Per-mode semantics

- `mode: block` — hard fail. PreToolUse hooks return exit 2; CI checks fail the workflow.
- `mode: ask` — only valid for `design-system-first`. Surfaces a confirmation prompt to the user; agent proceeds if the user OKs.
- `mode: warn` — emits a warning; does not block. Use for new checks during rollout.
- `mode: off` — disabled entirely. Use sparingly; prefer `warn` so you still see signal.

---

## How this file gets updated

Appended on every release in the same PR that bumps the version. Authored by the human/agent shipping the release. Format: a `## v<from> → v<to>` heading, status emoji, "What changed" section, "What this means for consumers" section, "Concrete changes" section.

Source of truth for *why* a change happened: the PR description + the relevant PRD-07 phase. This doc is the *what*.
