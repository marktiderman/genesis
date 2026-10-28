# @marktiderman/genesis-design-system

## 1.5.1

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

## 1.5.0

### Minor Changes

- a7db4d0: **`NativeSheet` no longer crashes on open when `@gorhom/bottom-sheet` is installed somewhere in the workspace.** It used the library whenever `require("@gorhom/bottom-sheet")` resolved, but the library throws on open without its `BottomSheetModalProvider` (and needs gesture-handler's `GestureHandlerRootView` and Reanimated), which nothing mounted.

  - By default the sheet is now React Native's own `Modal`, which needs no provider.
    - iOS: the system page sheet (`presentationStyle="pageSheet"`), which follows the finger when swiped down (`allowSwipeDismissal`).
    - Android: a bottom panel over a scrim, drawn under the system bars. A tap on the scrim or back closes it.
    - Content gets the sheet's own safe area, and the bottom inset is padded.
    - `disableBackdropDismiss` keeps it up against every way of dismissing it.
    - A sheet mounted open waits for the Reduce Motion setting before presenting.
  - The library is used only when the app opts in, in either of two ways:
    - `GenesisNativeApp`'s new `bottomSheet` prop (`import * as BottomSheet from "@gorhom/bottom-sheet"`, then `bottomSheet={BottomSheet}`). It mounts the provider inside the data, session and blocks providers, since sheet content renders in the library's portal.
    - The new `NativeSheetProvider`.
    - A module missing an export is reported with `console.error`, and sheets fall back to the modal.
  - On that path:
    - `enableDynamicSizing` is off, so `snapPoints` and `initialSnapIndex` mean what they say.
    - A dismiss that finishes after the app reopened the sheet isn't reported as the user closing it.
  - New `NativeSheetScrollView`: the library's `BottomSheetScrollView` under the provider, React Native's `ScrollView` otherwise. The what's-new notes scroll in it.
  - What may change for existing sheets:
    - The modal adds no padding of its own. The old fallback padded its content with `p-4`.
    - On iPhone the page sheet is nearly full height.
    - Sheets don't move above the keyboard.

  **Classes inside `@marktiderman/genesis-native` now style its screens.** Its exports only pointed at `dist/`, whose JSX tsup compiles to `react/jsx-runtime` calls, which NativeWind's JSX transform never sees, so the update screens' (force upgrade, maintenance, banner, what's new) and the push prompt's `className`s did nothing. Like ui-native, it now ships `src` and has `react-native` export conditions pointing at it, so Metro compiles it with the app's NativeWind transform.

  **`genesisNativewindContent()`** in `presets/nativewind` gives Tailwind the `src` and `dist` globs of every Genesis React Native package the app uses, found the way Node finds them (the app's node_modules, a hoisted workspace root or a workspace link), following their dependencies. `packages` adds starting points (your own wrapper package), and a listed package that isn't installed is warned about. `genesis init --native` and the starter use it in place of hand-written `node_modules` globs, which find nothing when a package is hoisted above the app.

- 0fd477c: Fixes from running the native starter on an iOS simulator.

  **PKCE uses S256 on React Native.** Hermes has no `crypto.subtle`, so supabase-js sent the PKCE challenge as `plain` (the verifier itself), and with no `crypto` at all made the verifier with `Math.random`. `createGenesisSupabase` takes `crypto` (`import * as ExpoCrypto from "expo-crypto"`), which installs `crypto.getRandomValues` and a SHA-256-only `crypto.subtle.digest` on `globalThis` from it, never replacing real WebCrypto. A PKCE client made with neither, on any platform, throws in development and logs an error in a release build. With the polyfill in place, `auth.getClaims()` always has the server check the token (`getUser`), because the polyfill can hash but can't verify a signature; supabase-js would otherwise try to verify asymmetric tokens locally and throw. `installWebCrypto`, `hasPkceCrypto`, `assertPkceCrypto` and `isDigestOnlyPolyfill` are on `/native`.

  **The keyboard moves the form.** `GenesisNativeApp` takes `keyboardProvider` (react-native-keyboard-controller's `KeyboardProvider`) and mounts it once around the app. `keyboardScroll`'s `KeyboardAwareScrollView` did nothing without it. It is read once, so an inline wrapper can't remount the app. In development, `keyboardScroll` without `keyboardProvider` logs an error. The ui-native `KeyboardScrollProvider` docs say it needs `KeyboardProvider` above it.

  **Genesis components are styled under NativeWind v4.** New `presets/nativewind` (`genesisNativewindPreset`): the Tailwind v3 preset plus the theme's role colors (`bg-primary`, `border-input`, `text-foreground`, `text-destructive`…, as `hsl(var(--…))`) and their variables, light on `:root` and dark under `prefers-color-scheme: dark`, with the same values as `themes/genesis.css`. With `presets/tailwind` alone, none of those classes were generated and `--radius` was never declared, so inputs had black square borders and primary buttons had no fill. The CLI's scaffolder writes the new preset into an Expo app's Tailwind config.

## 1.4.1

### Patch Changes

- 954fb55: Use made-up neutral names in doc comments, examples and the brand schema description instead of the names of private apps. No behaviour change; the CLI invalid-name error now gives `"arcade-mobile"` as its example slug.
- a38a00f: Fixes found by building the native starter (`apps/genesis-rn-starter`, Expo SDK 58 / React Native 0.88) on the packages.

  - `@marktiderman/genesis-ui-native`: `AppleButtonModuleLike`'s button now types `style` as a `ViewStyle`, so the real `expo-apple-authentication` module can be passed to `appleProvider` and `AppleSignInButton` under strict TypeScript (with `unknown` it was refused). `ScreenContainer` compiles against React Native 0.88, which dropped `translucent` and `backgroundColor` from `StatusBar`'s props (Android is always edge to edge there); they are still passed for earlier versions. `NativeTextarea`'s `rows` is documented (the generated docs showed React Native's Android-only `rows` description for it).
  - `@marktiderman/genesis-design-system`: `./presets/*` and `./providers/native` gain a `default` export condition, so a CommonJS loader (NativeWind's Tailwind v3 config loader, Metro) resolves them; before, `tailwind.config` importing `presets/tailwind` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  - `@marktiderman/genesis-cli`: the doctor's `store-readiness` rule counts export compliance and the privacy manifest as set when the Expo config lists this package's own config plugin, which sets them (unless its `exportCompliance` / `privacyManifest` option is `false`, and the manifest only when a dependency needs one). Apps on `withGenesis()` no longer get those two warnings. In a dynamic config, only `withGenesis(` or the package's name outside an `import` / `require` counts as listing the plugin.
  - `@marktiderman/genesis-supabase`: the README had merge-conflict markers between the Account section and "Choices, and why"; both sections are kept.

  Features: native-starter

## 1.4.0

### Minor Changes

- 27975e4: The default Genesis brand primary is indigo-600 (`#4f46e5`, `243 75% 59%`; 6.3:1 on white) instead of emerald, which was the same colour as `success`, so a primary button read as a success state. `--primary`, `--ring`, `--sidebar-primary`, the native `GENESIS_PRIMARY`, the brand preset's accent (dark: indigo-400) and the theme roles' default tint all follow. Apps with their own brand are unaffected; apps on the default brand change colour.

  Features: design-tokens, theme-roles

- d7b0389: The native `GenesisThemeProvider` takes `syncNativeAppearance`: on the root provider it passes an in-app light or dark choice to `Appearance.setColorScheme`, so iOS system colors and native controls follow it, not only Genesis tokens; "system" and unmounting hand it back to the OS ("unspecified", or "auto" on React Native 0.87+). The react-native-keyboard-controller peer range starts at 1.11 (KeyboardAwareScrollView). `KeyboardScrollProvider` lets an app supply react-native-keyboard-controller's `KeyboardAwareScrollView` once; `AuthScreen` and `SettingsSubPage` use it, and fall back to `KeyboardAvoidingView` without it. `NotificationsPage` memoizes its date grouping. The genesis-supabase README explains the Keychain storage choice, the URL polyfill and where to call `refreshWhileActive`.

  Features: design-tokens, native-layouts, supabase-kit

- bd07203: Theme roles: twelve colors named for what they are for (`background`, `groupedBackground`, `surface`, `label`, `secondaryLabel`, `tertiaryLabel`, `separator`, `fill`, `tint`, `destructive`, `success`, `warning`), resolved per platform. `resolveThemeRoles({ target, scheme, platformColor, tint })` in the design system gives the theme's CSS variables on web, iOS system colors through `PlatformColor` on iOS, and the Genesis token for the current scheme on Android, so Android dark mode follows the system. A brand sets `tint`. The design system has no React Native import; ui-native adds `useThemeRoles({ tint })`, which reads the platform and color scheme itself.

  Features: theme-roles

### Patch Changes

- a154019: Theme roles, from review: off iOS, `destructive` is a text-safe red in both schemes (the dark token was a background red at about 2:1); dark-mode `surface` is raised above `groupedBackground` the way iOS grouped lists are (they were inverted); the default `tint` comes from the Genesis brand preset instead of a literal. `resolveThemeRoles({ androidDynamic })` and `useThemeRoles({ materialYou })` use Material You dynamic colors on Android 12+.

  Features: theme-roles

## 1.3.1

### Patch Changes

- 1a9d899: Release-pipeline only, no code changes. This version is published by CI through npm Trusted Publishing, which now requires the `npm` GitHub environment (main only).

## 1.3.0

### Minor Changes

- b286a50: `themes/genesis.css` now declares `--font-sans` and `--font-mono` alongside `--font-display`, in both `:root` and `.dark`, generated from `tokens/dtcg/typography.json` (previously only `--font-display` shipped, from a hardcoded literal). `--font-sans` defaults to Inter.

  New `themes/genesis-tailwind4.css`: the Tailwind v4 `@theme inline` bridge that apps were hand-writing. It maps every Genesis color variable to `--color-*` (`--color-sidebar` → `--sidebar-background`), the radius scale, and `--font-sans` / `--font-display` / `--font-mono`, and declares `@custom-variant dark (&:is(.dark *))`. It is generated from the same variable list as `genesis.css`, so the two can't drift. Import it after `genesis.css`:

  ```css
  @import "tailwindcss";
  @import "@marktiderman/genesis-design-system/themes/genesis.css";
  @import "@marktiderman/genesis-design-system/themes/genesis-tailwind4.css";
  ```

  `presets/tailwind` is unchanged; its doc comment now says it is a Tailwind v3-shaped preset rather than "Tailwind v4 compatible".

  **Upgrade note — app fonts.** If your app sets its own `--font-sans` (or `--font-mono`) only inside `@theme` / `@theme inline`, it will silently switch to Inter after this upgrade. Tailwind 4 puts `@theme` values in `@layer theme`, and `genesis.css`'s unlayered `:root` beats any layered declaration. Move app font overrides to an unlayered `:root` after the imports:

  ```css
  :root {
    --font-sans: "Your Font", ui-sans-serif, system-ui, sans-serif;
  }
  ```

  The same applies to any other Genesis variable you override. If you hand-wrote the `@theme inline` bridge, you can delete it and import `genesis-tailwind4.css` instead.

## 1.2.1

### Patch Changes

- 7cfc703: First publish from the new public repo. No functional changes — every package's current version already matches what's published from the predecessor repo, so this bump is required before this repo's release workflow can publish anything at all (npm rejects republishing an existing version).

## 1.2.0

### Minor Changes

- 1766706: Add progress/health status tokens and a `StatusBadge` component.

  **`@marktiderman/genesis-design-system`** — extended the `status` color
  tokens (`tokens/dtcg/colors.json` source, mirrored in `src/tokens/colors.ts`
  and regenerated into `src/tokens/native.ts`) with five new OKR-style
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

  Motivating consumer: a consumer app's master-plan item 25 (U9)
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

- 5020d70: feat(design-system): A4.0 cross-platform factory spike — `tailwindFromBrand()`, `themeFromBrand()`, `debugBrandPreset()` ship in `@marktiderman/genesis-design-system` and the canonical schema gains optional cross-platform fields (typography, spacing, radius, shadow, gradient, platformOverrides). Color-only brands keep working — every new field is optional. Verdict: GO single-config WITH ESCAPE HATCH per `docs/prds/PRD-07-genesis-consumption-architecture/research/a4-0-cross-platform-factory-spike.md` Section 7. Unblocks A7.1 and A4.1 (each consumer app's own `@<consumer>/brand`).
- 210aa8f: BREAKING (allowed pre-1.0): brand presets removed from design-system; canonical schema gained `extensions` slot for consumer-specific scales; `rank` moved to extensions.

  PRD-07 Phase A2 / A2.7 / A2.9 / A2.10 — G-PR-2.

  **Removed (4 brand presets and their DTCG token JSONs):**
  - `src/presets/brand-acme.ts` + `tokens/dtcg/brands/acme.json`
  - two consumer-app presets: `src/presets/brand-<app>.ts` + `tokens/dtcg/brands/<app>.json`
  - `src/presets/brand-team-tiderman.ts` + `tokens/dtcg/brands/team-tiderman.json`
  - Re-exports of `acmeTheme/Colors`, `teamTidermanTheme/Colors` from `src/index.ts`
  - The 4 corresponding `dist/themes/<brand>.css` outputs (only `genesis.css` ships now)

  **Removed (provider surface):**
  - `Brand` union narrowed from five brand names → `"genesis"`. Consumer apps that need a non-genesis primary now pass an explicit `primary` prop to `<GenesisThemeProvider>` sourced from their own `@<consumer>/brand` package.

  **Added (canonical schema — A2.9):**
  - `src/schema/brand.ts` exports `ColorScale`, `CanonicalBrand`, `BrandExtensions` (open-ended interface for consumer declaration merging), `isColorScale`, and `validateBrand`.
  - `extensions?: BrandExtensions & Record<string, ColorScale>` slot on `CanonicalBrand` — consumer-domain color scales (rank, gameMode, flowTemplate) live here.
  - TypeScript declaration-merging pattern documented in the module doc-comment + standards/design-opinions.md.
  - Naming convention: camelCase keys, prefixed only on collision (`appPriority` etc), brand-genesis declares zero extensions.

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
