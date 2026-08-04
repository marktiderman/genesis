# @marktiderman/genesis-ui-native

## 2.0.2

### Patch Changes

- 7cfc703: First publish from the new public repo. No functional changes — every package's current version already matches what's published from the predecessor repo, so this bump is required before this repo's release workflow can publish anything at all (npm rejects republishing an existing version).

## 2.0.1

### Patch Changes

- 88ad204: Fix Badge `success`/`warning`/`info` status text failing WCAG AA contrast. The variants rendered same-hue text on a tinted chip (e.g. `text-success` on `bg-success/15`), measuring ~1.9–3.1:1 against the 4.5:1 AA floor. Native now uses the AA-safe darker status token (`text-success-dark` etc. → ~6.3–7.4:1); web uses the matching 700-weight ramp (`text-emerald-700`/`text-amber-700`/`text-blue-700`, with `dark:` 300 stops for the darkened chip). Chip backgrounds and all other variants are unchanged.
- 38d08d3: Design-system self-consumption (dogfooding) cleanups.
  - **design-system:** the React Native theme (`nativeThemeLight` / `nativeThemeDark`) is now generated from the canonical DTCG themes (`tokens/dtcg/themes/{light,dark}.json`) via a Style-Dictionary target, instead of a hand-rolled palette hardcoded in `providers/native.ts`. Behavior-preserving — the resolved light/dark surface colors are byte-identical to the previous literals. The `brand-genesis` neutral ramp drift (stops `300` and `900`) is corrected to match the canonical DTCG source, so there is one palette.
  - **ui-native:** `Input`, `Textarea`, and the nav-bar search field now default `placeholderTextColor` to the design-system `nativeColors.neutral[400]` token instead of a hardcoded hex (input/textarea unchanged visually; the nav-bar moves off an off-palette gray onto the zinc scale).

- e37afdd: Declare `className` on `NativeTextProps`. `NativeText` already applies `className` internally, but its public type inherited the prop from react-native's `TextProps` via NativeWind's global augmentation, which does not resolve across the RN 0.85 / nativewind 4.2 / react-native-css-interop 0.2 type matrix — so consumers type-checking against the real react-native types saw `Property 'className' does not exist on NativeTextProps`. The prop is now declared explicitly, matching the implementation and every other ui-native primitive (Button, Tooltip, ChipGroup).
- Updated dependencies [38d08d3]
- Updated dependencies [1e56f68]
  - @marktiderman/genesis-design-system@1.1.0

## 2.0.0

### Major Changes

- e972635: Rename the npm scope from the old pre-public scope to `@marktiderman` across all Genesis packages: `genesis-*` → `@marktiderman/genesis-*`.

  The data-layer package additionally shortens its name to `@marktiderman/genesis-switchboard` (dropping the redundant `data-` prefix while keeping the `genesis-` family prefix consistent with the other packages).

  **Breaking change.** Consumers must update every import specifier and dependency entry (e.g. `genesis-ui` → `@marktiderman/genesis-ui`, and `genesis-data-switchboard` → `@marktiderman/genesis-switchboard`). Per npm best practice the previous pre-public-scope names will be `npm deprecate`d with a pointer to the new names once the `@marktiderman/*` packages are published. The legacy `genesis@2.0.0` umbrella package under the old scope is unaffected (separate lineage).

### Minor Changes

- 54a8afb: Add tokens-only layout primitives (`Stack`, `Inline`, `Box`, `Grid`) plus the `spaceScale` token and `spacingClass()` resolver. Promoted from the Acme incubator (PRD-46 WC-A4); primitives own all gap/padding/margin via the spacing token so spacing stays consistent and never hard-codes a px value.

### Patch Changes

- 41cd84d: Mark `react-native` as an optional peer dependency (`peerDependenciesMeta`), matching the other React Native peers (nativewind, gesture-handler, reanimated, …) that are already optional here. This makes the `@marktiderman/genesis` umbrella's promise true: a pure-web consumer that pulls `genesis-ui-native` transitively no longer gets an unmet `react-native` peer warning at install. Native apps are unaffected — they depend on `react-native` directly at their app root. A new web-install smoke test (`packages/genesis/scripts/smoke-web-install.mjs`) packs the umbrella + granular deps and asserts the web-only install is react-native-clean.
- Updated dependencies [e972635]
  - @marktiderman/genesis-core@1.0.0
  - @marktiderman/genesis-design-system@1.0.0

## 1.1.0

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

  Ships in v1.1.0.

### Patch Changes

- 0f73e78: fix: critical bug fixes for Accordion / Slider / Drawer / Combobox / Toast primitives + surface gaps from Acme migration.
  - `accordion`: replace NativeWind-incompatible `last:` Tailwind variant with an `isLast` prop, AND auto-detect the trailing item via `Children.toArray()` so consumers don't have to thread the prop manually. Manual `isLast` always wins over auto-detection.
  - `slider` / `range-slider`: wrap `PanResponder` in `useMemo` keyed on `value` / `width` / `min` / `max` / `step` / `onChange` so closures never read stale mount-time values; fix `snap()` math so non-zero `min` produces the correct discrete grid.
  - `drawer`: same `useMemo` pattern keyed on `side` / `drawerWidth` / `onOpenChange` so swipe-to-dismiss threshold + direction track the latest props.
  - `combobox`: wrap option list in `<ScrollView keyboardShouldPersistTaps="handled">` so long lists scroll; close the dropdown on input blur (with a 120ms delay so option-press still registers) so users can dismiss without selecting.
  - `toast`: hold the latest `onDismiss` in a ref so the auto-dismiss `setTimeout` doesn't re-arm on every parent render.
  - `exports`: add `./utils` subpath so consumers can `import { cn } from "@marktiderman/genesis-ui-native/utils"` without pulling the components barrel.
  - `types`: re-export `TextPreset` as a named type alongside `NativeText` / `NativeTextProps`.

- Updated dependencies [0f73e78]
- Updated dependencies [a4d4872]
  - @marktiderman/genesis-design-system@0.2.2

## 1.0.1

### Patch Changes

- Critical bug fixes for Accordion / Slider / Drawer / Combobox / Toast
  primitives, surface gaps surfaced by the Acme migration, and a new
  `./utils` subpath export, and a `TextPreset` named type re-export.
  No breaking API changes; the new `./utils` and `TextPreset` exports
  are additive, and all bug fixes are drop-in compatible with 1.0.0
  call sites.

  **Component fixes:**
  - `accordion`: replace NativeWind-incompatible `last:` Tailwind variant
    with an `isLast` prop, AND auto-detect the trailing item via
    `Children.toArray()` so consumers don't need to thread the prop
    manually. Manual `isLast` always wins over auto-detection.
  - `slider` / `range-slider`: wrap `PanResponder` in `useMemo` keyed on
    `value` / `width` / `min` / `max` / `step` / `onChange` so the
    gesture handler closures never read stale mount-time values; fix
    `snap()` math so non-zero `min` produces the correct discrete
    grid (`Math.round((clamped - min) / step) * step + min`).
  - `drawer`: same `useMemo` pattern keyed on
    `side` / `drawerWidth` / `onOpenChange` so swipe-to-dismiss
    threshold + direction track the latest props.
  - `combobox`: wrap option list in
    `<ScrollView keyboardShouldPersistTaps="handled">` so long lists
    scroll instead of clipping; close the dropdown on input blur (with
    a 120ms delay so option-press still registers) so users can dismiss
    without selecting.
  - `toast`: hold the latest `onDismiss` in a ref so the auto-dismiss
    `setTimeout` doesn't re-arm on every parent render — the timer now
    runs to completion based on the toast's `duration` alone.

  **Surface gaps (Acme migration follow-ups):**
  - Re-export `TextPreset` as a named type alongside `NativeText` /
    `NativeTextProps`. Defined as `NonNullable<NativeTextProps["preset"]>`
    so it stays single-source-of-truth on the cva variants.
  - Add `./utils` subpath export so consumers can
    `import { cn } from "@marktiderman/genesis-ui-native/utils"` without
    pulling the entire components barrel (and react-native) into
    util-only consumer trees (e.g. brand packages).

  **Install:**

  ```sh
  pnpm add @marktiderman/genesis-ui-native@1.0.1
  ```

## 1.0.0

### Major Changes

- 00b2743: First publish from the canonical `marktiderman/genesis` repo. Bumps the existing `@marktiderman/genesis-*` v0.1.0 packages (originally published 2026-04 from prior fork repos PRD-07 Phase A6 retires) to v0.1.1 with the canonical genesis-repo content. Consumers install with zero auth: `pnpm add @marktiderman/genesis-ui-native`. Each publish emits a Sigstore provenance attestation linking the tarball back to this commit + the workflow run via OIDC. Publishing infrastructure: Changesets + `changesets/action` + `.github/workflows/release.yml` using **OIDC Trusted Publishing** (no NPM_TOKEN secret; short-lived token issued at publish time via GitHub Actions identity).
- Updated dependencies [5020d70]
- Updated dependencies [210aa8f]
- Updated dependencies [00b2743]
  - @marktiderman/genesis-design-system@0.2.0
  - @marktiderman/genesis-core@0.1.1
