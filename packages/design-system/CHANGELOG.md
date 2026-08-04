# @marktiderman/genesis-design-system

## 1.2.1

### Patch Changes

- 7cfc703: First publish from the new public repo. No functional changes — every package's current version already matches what's published from the predecessor repo, so this bump is required before this repo's release workflow can publish anything at all (npm rejects republishing an existing version).

## 1.2.0

### Minor Changes

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

## 1.1.1

### Patch Changes

- 128981d: Reconcile the `genesisBrand` brand green with its DTCG token source and add a drift guard (CMT-240-048).

  The published `genesisBrand` preset hardcodes a hex ramp, while the theme that actually renders is generated from the DTCG tokens under `tokens/dtcg/*.json`. The brand green had silently drifted: the preset (and the DTCG `brands/genesis.json` hex) shipped emerald-600 (`#059669`) while the rendered `--primary` and the documented brand color are emerald-500 (`160 84% 39%` ≈ `#10b981`) — a documented conflation ("`160 84% 39%` = `#059669`", which is false). This makes the DTCG tokens the source of truth and locks the relationship with a test that fails on any future drift (`src/presets/__tests__/brand-genesis-drift.test.ts`).

  Value changes (all toward the documented canonical emerald-500 `#10b981`):
  - **DTCG source** `tokens/dtcg/brands/genesis.json` → `brand.primary` `#059669` → `#10b981` (now internally consistent with its own `primary-hsl` `160/84/39`).
  - **Preset** `src/presets/brand-genesis.ts` → `genesisBrand.accent.DEFAULT`, `genesisBrand.accent.light`, `genesisBrand.status.success.DEFAULT`, and `genesisColors.primary` `#059669` → `#10b981`. `accent.dark` (`#34d399`) is unchanged; the neutral ramp is unchanged (already matches the DTCG source).
  - **Legacy native provider default** `src/providers/native.ts` → `GENESIS_PRIMARY` `#059669` → `#10b981`. A React Native consumer that imports the legacy `./providers/native` provider and omits the `primary` prop now defaults to the same emerald-500 as the rest of the token surface instead of the stale emerald-600 (CMT-266-001).

  This changes rendered output for consumers of the `genesisBrand` preset (accent + success surfaces move from emerald-600 to emerald-500). The generated native/CSS tokens already reflect emerald-500 for the rendered `--primary`.

## 1.1.0

### Minor Changes

- 1e56f68: Add `genesisBrand` — the canonical full `CanonicalBrand` for the Genesis OOTB brand — as the single source of truth for the brand palette. Genesis's own `apps/sample` and `apps/sample-native` now import it instead of inlining the hex ramp, so the design system owns the palette and app code stays token-gate clean (WS-F / audit R1.6).

### Patch Changes

- 38d08d3: Design-system self-consumption (dogfooding) cleanups.
  - **design-system:** the React Native theme (`nativeThemeLight` / `nativeThemeDark`) is now generated from the canonical DTCG themes (`tokens/dtcg/themes/{light,dark}.json`) via a Style-Dictionary target, instead of a hand-rolled palette hardcoded in `providers/native.ts`. Behavior-preserving — the resolved light/dark surface colors are byte-identical to the previous literals. The `brand-genesis` neutral ramp drift (stops `300` and `900`) is corrected to match the canonical DTCG source, so there is one palette.
  - **ui-native:** `Input`, `Textarea`, and the nav-bar search field now default `placeholderTextColor` to the design-system `nativeColors.neutral[400]` token instead of a hardcoded hex (input/textarea unchanged visually; the nav-bar moves off an off-palette gray onto the zinc scale).

## 1.0.0

### Major Changes

- e972635: Rename the npm scope from the old pre-public scope to `@marktiderman` across all Genesis packages: `genesis-*` → `@marktiderman/genesis-*`.

  The data-layer package additionally shortens its name to `@marktiderman/genesis-switchboard` (dropping the redundant `data-` prefix while keeping the `genesis-` family prefix consistent with the other packages).

  **Breaking change.** Consumers must update every import specifier and dependency entry (e.g. `genesis-ui` → `@marktiderman/genesis-ui`, and `genesis-data-switchboard` → `@marktiderman/genesis-switchboard`). Per npm best practice the previous pre-public-scope names will be `npm deprecate`d with a pointer to the new names once the `@marktiderman/*` packages are published. The legacy `genesis@2.0.0` umbrella package under the old scope is unaffected (separate lineage).

## 0.2.2

### Patch Changes

- 0f73e78: fix: loosen `BrandExtensions` index signature from `Record<string, ColorScale>` to `Record<string, unknown>` so consumer-defined nested-ColorScale extensions (e.g. Acme's `flowTemplate: Record<string, ColorScale>`) declaration-merge correctly.

  No runtime behavior change; types only. Factories already cast each extension entry to `ColorScale` at the call site (`from-brand.ts:393`, `from-brand.ts:607`), and the runtime `validateBrand` helper still requires each extension value to be a `ColorScale`.

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

  Ships in v0.2.2.

## 0.2.1

### Patch Changes

- Loosen `BrandExtensions` index signature from
  `Record<string, ColorScale>` to `Record<string, unknown>` so consumer
  brand packages that declaration-merge nested-`ColorScale` extensions
  (e.g. Acme's `flowTemplate: Record<string, ColorScale>`) compile
  without type-assertions at every call site.

  Consumers that augment `BrandExtensions` with their exact extension
  shape — single `ColorScale` for flat scales like `rank`, nested map
  for grouped scales — get full type safety. Consumers that don't get
  `unknown` for extension keys and must narrow before use; same safety
  floor, more flexible ceiling.

  No runtime change: `tailwindFromBrand()` and `themeFromBrand()` already
  cast each extension entry to `ColorScale` at the call site
  (`from-brand.ts:393`, `from-brand.ts:607`). The runtime `validateBrand`
  helper still requires each extension VALUE to be a `ColorScale` — the
  fallback index sig is purely a TypeScript-level relaxation.

  **Install:**

  ```sh
  pnpm add @marktiderman/genesis-design-system@0.2.1
  ```

## 0.2.0

### Minor Changes

- 5020d70: feat(design-system): A4.0 cross-platform factory spike — `tailwindFromBrand()`, `themeFromBrand()`, `debugBrandPreset()` ship in `@marktiderman/genesis-design-system` and the canonical schema gains optional cross-platform fields (typography, spacing, radius, shadow, gradient, platformOverrides). Color-only brands keep working — every new field is optional. Verdict: GO single-config WITH ESCAPE HATCH per `docs/prds/PRD-07-genesis-consumption-architecture/research/a4-0-cross-platform-factory-spike.md` Section 7. Unblocks A7.1 (`@gamify/brand`) and A4.1 (`@acme/brand`).
- 210aa8f: BREAKING (allowed pre-1.0): brand presets removed from design-system; canonical schema gained `extensions` slot for consumer-specific scales; `rank` moved to extensions.

  PRD-07 Phase A2 / A2.7 / A2.9 / A2.10 — G-PR-2.

  **Removed (4 brand presets and their DTCG token JSONs):**
  - `src/presets/brand-acme.ts` + `tokens/dtcg/brands/acme.json`
  - `src/presets/brand-breakthrough.ts` + `tokens/dtcg/brands/breakthrough.json`
  - `src/presets/brand-team-tiderman.ts` + `tokens/dtcg/brands/team-tiderman.json`
  - `src/presets/brand-gamify.ts` + `tokens/dtcg/brands/gamify.json`
  - Re-exports of `acmeTheme/Colors`, `breakthroughTheme/Colors`, `teamTidermanTheme/Colors` from `src/index.ts`
  - The 4 corresponding `dist/themes/<brand>.css` outputs (only `genesis.css` ships now)

  **Removed (provider surface):**
  - `Brand` union narrowed from `"genesis" | "acme" | "breakthrough" | "team-tiderman" | "gamify"` → `"genesis"`. Consumer apps that need a non-genesis primary now pass an explicit `primary` prop to `<GenesisThemeProvider>` sourced from their own `@<consumer>/brand` package.

  **Added (canonical schema — A2.9):**
  - `src/schema/brand.ts` exports `ColorScale`, `CanonicalBrand`, `BrandExtensions` (open-ended interface for consumer declaration merging), `isColorScale`, and `validateBrand`.
  - `extensions?: BrandExtensions & Record<string, ColorScale>` slot on `CanonicalBrand` — consumer-domain color scales (rank, gameMode, flowTemplate) live here.
  - TypeScript declaration-merging pattern documented in the module doc-comment + standards/design-opinions.md.
  - Naming convention: camelCase keys, prefixed only on collision (`gamifyPriority` etc), brand-genesis declares zero extensions.

  **Added (validation tooling — A2.9):**
  - `schema/brand.schema.json` — JSON-Schema 2020-12 entry for `CanonicalBrand`.
  - `scripts/validate.mjs` — Ajv-backed validator usable in CI: `node packages/design-system/scripts/validate.mjs <brand.json>`.
  - `__fixtures__/brand-canonical.json` + `__fixtures__/brand-with-extensions.json` smoke-test fixtures.
  - New scripts: `pnpm typecheck`, `pnpm validate`.

  **Documented (A2.10):**
  - `standards/design-opinions.md` gained "Extensions slot — usage" section: declaration-merging snippet, naming convention, escalation threshold, validator pointer.
  - `research/simplification-audit.md` reflects `rank` moved to extensions.
  - `research/genesis-audit.md` "5 brand presets" finding flipped from CONFIRMED to RESOLVED.

  **A2.7 — `rank` from canonical schema:** No `rank` symbol existed in the v0.1.x runtime code (the policy was always to keep the schema lean). Codified in v0.2.0: documentation + audit notes explicitly call out that rank is an extension category, not a core one. Consumers ship rank colors under `extensions.rank: ColorScale`.

  **Migration path for consumers (see docs/MIGRATION.md):**

  ```ts
  // Before (v0.1.x):
  import { acmeTheme } from "@marktiderman/genesis-design-system";

  // After (v0.2.0):
  import { acmeBrand } from "@acme/brand";  // consumer's own package
  <GenesisThemeProvider primary={acmeBrand.accent.DEFAULT}>...</GenesisThemeProvider>
  ```

### Patch Changes

- 00b2743: First publish from the canonical `marktiderman/genesis` repo. Bumps the existing `@marktiderman/genesis-*` v0.1.0 packages (originally published 2026-04 from prior fork repos PRD-07 Phase A6 retires) to v0.1.1 with the canonical genesis-repo content. Consumers install with zero auth: `pnpm add @marktiderman/genesis-design-system`. Each publish emits a Sigstore provenance attestation linking the tarball back to this commit + the workflow run via OIDC. Publishing infrastructure: Changesets + `changesets/action` + `.github/workflows/release.yml` using **OIDC Trusted Publishing** (no NPM_TOKEN secret; short-lived token issued at publish time via GitHub Actions identity).
