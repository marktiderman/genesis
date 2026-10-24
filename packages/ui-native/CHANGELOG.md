# @marktiderman/genesis-ui-native

## 2.2.0

### Minor Changes

- 47b13ff: The Account block, native first. `@marktiderman/genesis-supabase/native` adds `signInWithApple(client, AppleAuthentication, { digest })` (availability check, name and email scopes, a SHA-256 hashed nonce, `signInWithIdToken`; closing Apple's sheet is `{ canceled: true }`, and the full name Apple shares on the first sign-in comes back to save) and `completeOAuthRedirect(client, url)` (exchanges a PKCE `code`, or returns the redirect's `error` as a typed `GenesisAuthError`). `@marktiderman/genesis-supabase` adds `deleteMyAccount(client)` and ships `migrations/0001_genesis_account_deletion.sql` (`public.delete_my_account()`, security definer, `search_path = ''`, executable by `authenticated` only) with a pgTAP test. `@marktiderman/genesis-ui-native` adds `appleProvider()` and `AppleSignInButton`, which draw Apple's own button on iOS and nothing elsewhere; `AuthScreen` skips `null` providers and `SocialAuthProvider` takes a `render` for a provider's own button.

  Features: account

### Patch Changes

- e649267: From review of the Account block.

  `completeOAuthRedirect` passes `sb_flow_id` to `exchangeCodeForSession` and returns `redirectType` (`"recovery"` after a password reset). A redirect error's `message` is now fixed copy chosen by its code; the redirect's own `error_description` is only on the new, untrusted `GenesisAuthError.providerMessage`. `redirectParams` reads keys such as `constructor`.

  `signInWithApple` returns Apple's `authorizationCode`, which a server needs in order to revoke the Apple tokens on deletion; the README documents that step under "Not covered yet". It refuses a digest that isn't lowercase hex (`bad_digest`), and keeps `fullName` on the error result.

  `delete_my_account()` now:
  - refuses an aal1 session when the person has a verified MFA factor (`42501`);
  - runs `private.genesis_before_account_delete(uuid)` first when an app defines it, and maps a refusal from it to `GA001`;
  - comes with `private.genesis_require_recent_sign_in(interval)`, which an app can call from that hook to require a recent sign-in (`GA002`).

  The migration header is corrected: Supabase documents that a person who owns Storage objects can't be deleted (`23503`), and the comment about blanket grants is fixed.

  `AppleSignInButton` ignores a second tap while a sign-in is open, reports disabled and busy on the button itself, and its `label` and `height` docs are corrected.

  Features: account

- a38a00f: Fixes found by building the native starter (`apps/genesis-rn-starter`, Expo SDK 58 / React Native 0.88) on the packages.

  - `@marktiderman/genesis-ui-native`: `AppleButtonModuleLike`'s button now types `style` as a `ViewStyle`, so the real `expo-apple-authentication` module can be passed to `appleProvider` and `AppleSignInButton` under strict TypeScript (with `unknown` it was refused). `ScreenContainer` compiles against React Native 0.88, which dropped `translucent` and `backgroundColor` from `StatusBar`'s props (Android is always edge to edge there); they are still passed for earlier versions. `NativeTextarea`'s `rows` is documented (the generated docs showed React Native's Android-only `rows` description for it).
  - `@marktiderman/genesis-design-system`: `./presets/*` and `./providers/native` gain a `default` export condition, so a CommonJS loader (NativeWind's Tailwind v3 config loader, Metro) resolves them; before, `tailwind.config` importing `presets/tailwind` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  - `@marktiderman/genesis-cli`: the doctor's `store-readiness` rule counts export compliance and the privacy manifest as set when the Expo config lists this package's own config plugin, which sets them (unless its `exportCompliance` / `privacyManifest` option is `false`, and the manifest only when a dependency needs one). Apps on `withGenesis()` no longer get those two warnings. In a dynamic config, only `withGenesis(` or the package's name outside an `import` / `require` counts as listing the plugin.
  - `@marktiderman/genesis-supabase`: the README had merge-conflict markers between the Account section and "Choices, and why"; both sections are kept.

  Features: native-starter

## 2.1.0

### Minor Changes

- 7ae53e5: From review: `AuthForm`'s return key on the email field moves focus to the password field (React Native doesn't do it by itself) and keeps the keyboard open, and both fields carry AutoFill hints (`textContentType`, `autoComplete`). `AuthScreen` keeps the form above the keyboard and, in development on iOS, warns when a third-party provider is offered without Sign in with Apple (App Store Review Guideline 4.8). `SettingsPage` takes its colors from theme roles: on iOS, inset rounded cells on the grouped background, like the Settings app. `ScreenContainer` takes a `style`. `NotificationsPage` no longer builds a new separator component on every render.
- ddac1fc: `AuthScreen`: a whole sign-in screen from props, assembling `AuthBranding`, `SocialAuthRow`, `AuthForm` and `ForgotPasswordLink` (shown for password sign-in when `onForgotPassword` is set), plus a footer. Each part (`branding`, `social`, `form`, `footer`) is a slot. `NotificationsPage` takes `slots` and `slotProps` for `sectionHeader`, `row` and `empty`; the `emptyState` prop still works. Defaults render as before.

  Features: native-components

- 2657c06: `SettingsPage` takes `slots` and `slotProps`, the same contract as web patterns (from `@marktiderman/genesis-core/slots`). Replace or drop (`null`) any of `sectionHeader`, `row`, `footnote` and `dangerousActions`; your component receives exactly the props the default would (`SettingsPageSlotMap`), and `slotProps` feeds a default part more props. The rendered output and test ids are unchanged.

  Features: native-components

- d7b0389: The native `GenesisThemeProvider` takes `syncNativeAppearance`: on the root provider it passes an in-app light or dark choice to `Appearance.setColorScheme`, so iOS system colors and native controls follow it, not only Genesis tokens; "system" and unmounting hand it back to the OS ("unspecified", or "auto" on React Native 0.87+). The react-native-keyboard-controller peer range starts at 1.11 (KeyboardAwareScrollView). `KeyboardScrollProvider` lets an app supply react-native-keyboard-controller's `KeyboardAwareScrollView` once; `AuthScreen` and `SettingsSubPage` use it, and fall back to `KeyboardAvoidingView` without it. `NotificationsPage` memoizes its date grouping. The genesis-supabase README explains the Keychain storage choice, the URL polyfill and where to call `refreshWhileActive`.

  Features: design-tokens, native-layouts, supabase-kit

- a154019: Theme roles, from review: off iOS, `destructive` is a text-safe red in both schemes (the dark token was a background red at about 2:1); dark-mode `surface` is raised above `groupedBackground` the way iOS grouped lists are (they were inverted); the default `tint` comes from the Genesis brand preset instead of a literal. `resolveThemeRoles({ androidDynamic })` and `useThemeRoles({ materialYou })` use Material You dynamic colors on Android 12+.

  Features: theme-roles

- bd07203: Theme roles: twelve colors named for what they are for (`background`, `groupedBackground`, `surface`, `label`, `secondaryLabel`, `tertiaryLabel`, `separator`, `fill`, `tint`, `destructive`, `success`, `warning`), resolved per platform. `resolveThemeRoles({ target, scheme, platformColor, tint })` in the design system gives the theme's CSS variables on web, iOS system colors through `PlatformColor` on iOS, and the Genesis token for the current scheme on Android, so Android dark mode follows the system. A brand sets `tint`. The design system has no React Native import; ui-native adds `useThemeRoles({ tint })`, which reads the platform and color scheme itself.

  Features: theme-roles

### Patch Changes

- e91765c: From review: `keychainStorage` queues reads with writes (a read could see the old generation disappear mid-read), lets every chunk write settle before reporting a failure (so a late write can't outlive the sweep), and removes chunks before the manifest. `refreshWhileActive`'s unsubscribe also stops auto-refresh. `wipeSessionOnReinstall` removes every indexed PKCE flow verifier and the index. `defineFeatures` skips schema-invalid entries in its relation checks instead of throwing, and `statusOn` treats `node` in `apps` as the `server` platform. `SettingsPage` rows are transparent so the theme-role cell color shows.

  Features: supabase-kit, feature-registry, native-components

## 2.0.3

### Patch Changes

- 1a9d899: Release-pipeline only, no code changes. This version is published by CI through npm Trusted Publishing, which now requires the `npm` GitHub environment (main only).

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
