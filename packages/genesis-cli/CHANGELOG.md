# @marktiderman/genesis-cli

## 1.16.2

### Patch Changes

- 845d802: The native starter template moves to `@sentry/react-native` ~8.32.0.

## 1.16.1

### Patch Changes

- 5f60fb4: `genesis init --template native` starts apps on newer dependencies: `@hookform/resolvers` ^6, `@sentry/react-native` ~8.31, `@tanstack/react-query` and its persisters 5.104.5, `@shopify/flash-list` 2.3.3 and `@react-native-community/datetimepicker` 9.2.2. `genesis studio init` now accepts `@hookform/resolvers` 5 or 6 (`>=5.1.0 <7`), so it no longer asks an app already on 6 to go back to 5.

## 1.16.0

### Minor Changes

- 09ac7e7: The `genesis` command now runs on commander 15, which needs Node.js 22.12 or newer (the package declares `engines.node: >=22.12.0`; Node 20 reached end of life in April 2026). Every command, option and default is unchanged. One behaviour from commander 13: a command given more positional arguments than it takes now stops with "too many arguments" instead of ignoring them.

## 1.15.1

### Patch Changes

- 5a0c1d2: A record's page is now a **record view**, so "workspace" can mean where the viewer is working (ADR 0004). `defineWorkspace` is `defineRecordView`, `ResourceWorkspace` is `RecordView`, `NativeResourceWorkspace` is `NativeRecordView` (with `NativeRecordViewMenu` and `getNativeRecordViewStackOptions`), and the `Workspace…` types are `RecordView…`. The components take `view` in place of `workspace`, as `ResourceView` does. The old names still work for one minor release, marked deprecated. The doctor rule `ui/record-pages-use-resource-workspace` is now `ui/records-use-record-view`: rename it in an app's config if the app sets its level. Message keys (`messages.workspace`) and default test ids (`resource-workspace`) are unchanged.

## 1.15.0

### Minor Changes

- 9a254df: Package rules, the primitives catalog and the ratchet.

  - **Package rules.** The doctor finds every installed `@marktiderman/genesis-*` package (and every local package) and runs the rules it declares in its package.json under `genesis.doctor`: declarative `prefer` rules ("use X instead of Y": forbidden JSX elements, imports or a pattern, with `unless` exemptions, `platform`, `{routes}` globs) and an optional `plugin` module. Ids are namespaced by package (`ui/lists-use-resource-view`) and work with `rules`, `allow`, `stale-exception` and the new `packageRules`: for a `prefer` rule it takes `level`, `files`, `exclude` and a required reason; for a package plugin's rules, `level` and the reason only (a plugin decides its own files). A forbidden element is also flagged where an app wrapper around it is rendered. Declarations are read forward-compatibly: an unknown key, or a rule this CLI can't read, is skipped with a warning, so a newer package never breaks an older app's build; a rule with an unknown key of its own or in `unless` (one that could narrow it) is skipped whole rather than run wider, while an unknown key in `forbid` is only dropped. A wrapper counts only where its own component renders the element (exported where it is declared, in an `export { … }` list, or by `export default Name;`), and its use only where it is imported from that file. New rules: `package-rules-invalid` (warn), `package-rule-override` (a package rule changed in `rules` without a reason); `stale-exception` also warns about a `packageRules` id no installed package declares.
  - **`package-doctor-declaration`** (packages pack): a published Genesis package must declare its rules, or `{ "enforce": false, "reason": "…" }`.
  - **Ratchet.** `newOnly` on package rules and app patterns, or `doctor.ratchet` (`true` or rule ids): with `--base`, findings in files unchanged since the merge base drop to `info`. `allow-grew` fails an `allow` entry the base ref's config didn't have, so the list only shrinks, and `rules-weakened` fails, comparing with the base's settings only, a rule they set that the branch lowers, a rule newly set to `off`, or a new `exclude` glob in `packageRules` (a new entry at another level, such as pinning a rule a package raised, is fine). Both compare with the doctor settings wherever they lived at the base, and neither runs when the base had none. `ratchet-skipped` says when git can't compare: a warning when only the ratchet was skipped, an error when the config's `allow`, `rules` or `packageRules` went uncompared (check out with `fetch-depth: 0`). These three guard the config, so `rules` and `allow` can't name them, and the ratchet never lowers them or the other rules about the config, packages and generated files (`stale-exception`, `agent-guide-stale`, `package-doctor-declaration`, `contracts-stale` and the like). Without `--base` nothing changes.
  - **`contracts-stale`** (supabase pack, with `doctor.contracts`): the generated contract matches what `genesis introspect` would write now; compared for the schemas `doctor.contracts.schemas` names, else those in the contract's own `// Source: Postgres (…)` line; skipped (info) without the database variable or for a contract generated from OpenAPI, and never run by the Vite plugin (build or dev). Line endings don't count, here and in `genesis introspect --check`.
  - **`genesis primitives [--json]`** prints the catalog (need, what to use, import, rule, docs) from every installed package's declarations plus a short static core; **`genesis agents`** writes it as `.claude/skills/genesis/SKILL.md` and a marked block in AGENTS.md, while **`genesis agents --check`** writes nothing and only reports a missing, stale or broken guide; both exit 1 without writing when a package's declaration doesn't validate (so does `genesis primitives`, which then lists the errors). **`agent-guide-stale`** warns when they drift or the AGENTS.md markers are broken (then `genesis agents` writes nothing). The report prints `Primitives: N rules from M packages; see genesis primitives`.

  Features: doctor-package-rules

- 995644a: `genesis introspect` (Postgres) gives a view Postgres can update on its own its table's facts: each plain column's nullability, default, link, enum values and comment, the table's primary key when every key column is in the view, and the table's `noun`, `nounPlural` and `labelField`. Columns are traced by position, so a column renamed with `alter view … rename column` keeps the right facts and key. The view's own comments win; computed columns and other views stay as read. A source table in a schema that wasn't asked for is read, not emitted. Single-column `CHECK`s that list values (`status in ('a', 'b')`, alone or `or status is null`) become the field's `enumValues` (checks that share no value give none).

  Contracts now state nullability both ways: `nullable: false` for a NOT NULL column, `nullable: true` for a nullable one, and nothing when the catalog can't tell (a view's own column). A schema or table name holding a dot or a quote is quoted (`"my.s"."we.ird"`). **Regenerate your contracts** (`genesis introspect`): older contracts mark every view column `nullable: true`, which the form's empty-input handling would believe.

### Patch Changes

- 87a2c31: `genesis introspect` (Postgres) leaves a view that has rules of its own (beyond its `_RETURN` rule) as read: such a view may be updatable only through a `DO INSTEAD` rule over a query whose rows aren't its table's (an outer join), so it no longer takes that table's key or nullability. A view column of an enum type that its table's `CHECK` narrows keeps the narrowed list, as the table's own column does.
- Updated dependencies [9a254df]
- Updated dependencies [9a254df]
  - @marktiderman/genesis-features@0.7.0
  - @marktiderman/genesis-studio-server@0.5.1

## 1.14.0

### Minor Changes

- 7bfbff2: - The first registered codemod, `genesis-core-2-scope-names` (genesis-core 2.0.0's scope-neutral names), and `genesis codemod [id] [--dir] [--dry-run]` to list codemods or run one by hand.
  - Doctor rules for the scope rename: `removed-scope-name` (error) lists every removed "practice" name left in a file that imports Genesis (`timeZone: "practice"`, `practiceTimeZone`, `resolveZone("practice")`, DisplayTimeZones' `practice`), so `doctor --strict` fails until the codemod has run; `scope-practice-id` (info, never failing) notes a `scope.practiceId` read with no `ResourceScope` augmentation.
  - Two more doctor rules: `resource-view-tree` (error) flags a `<ResourceView>` or `<ResourcePage>` with `tree` and `pagination="server"` or `"cursor"`, which throws when it renders; `studio-server-auth-import` (warn) flags deep imports of studio-server files and a CommonJS `require` of its ESM-only root, pointing at `@marktiderman/genesis-studio-server/auth`. A correct project passes `genesis doctor --strict`.

### Patch Changes

- Updated dependencies [5f44692]
- Updated dependencies [7d27855]
  - @marktiderman/genesis-studio-server@0.5.0

## 1.13.2

### Patch Changes

- 68c89fb: `genesis doctor` compares features.ts from the repository root, so a nested app whose registry is the root's src/features.ts no longer warns when a package's exports change alongside it.
- Updated dependencies [afae598]
  - @marktiderman/genesis-features@0.6.1

## 1.13.1

### Patch Changes

- Updated dependencies [0d8925a]
- Updated dependencies [319d36d]
  - @marktiderman/genesis-studio-server@0.4.0

## 1.13.0

### Minor Changes

- 2bf5afd: Resource facts from `@genesis` comments: tables take `noun` and `nounPlural`, columns `readonly` and `sensitive` (booleans). `genesis introspect` emits each resource as `as const satisfies ResourceContract<Row>` with a field-name union, so a bad setting fails to compile; row types are now type aliases. Core's `ResourceContract` gains `label`, `labelField`, `noun` and `nounPlural`, and `FieldSchema` gains `readOnly` and `sensitive`.

### Patch Changes

- dda639d: `genesis doctor`: `page-layout` accepts `ResourceView` as a page layout, and `native-screen-layout` accepts `NativeResourceView`, so list screens built from a view pass.

## 1.12.1

### Patch Changes

- d53bdab: The packages pack's follow-ups: a nested app's change gate sees a local package at the repository root; an `export type` without a semicolon no longer hides the import after it; `.js` export targets are left alone (they may be unbuilt output); a `localPackages` entry that leaves the repository is refused, not skipped; a version bump without a changeset asks for one with a `Features:` line; and `links.code` paths count from the repository root.
- Updated dependencies [7cdf0fe]
  - @marktiderman/genesis-features@0.6.0

## 1.12.0

### Minor Changes

- 693856d: Local packages: list an app's own workspace packages in genesis.config.json `localPackages` (`["packages/*"]`) and Genesis treats them like its own. They declare blocks and migrations that `genesis add` and `genesis migrate` copy (nothing is installed), every doctor rule scans their source, and the new `packages` doctor pack (change rules with `genesis doctor --base <ref>`) holds each one to a package's standard: `package-app-import`, `package-undeclared-dependency`, `package-migration-test`, `package-migration-number`, `package-migration-edited`, `package-unregistered`, and `package-unversioned-change`, the gate that fails a change with neither a version bump nor a changeset naming the package.

## 1.11.3

### Patch Changes

- 6543b28: Say "reuse, then extend, then invent" everywhere, and point to The Genesis Way (`docs/FRAMEWORK.md`, Part 1). The CLAUDE.md that `genesis init` writes and genesis-ui's agent skill now use the same words.
- Updated dependencies [bc5a348]
  - @marktiderman/genesis-features@0.5.0

## 1.11.2

### Patch Changes

- 6f725f8: `genesis doctor` native pack: `native-raw-primitive` points a raw `ActivityIndicator` to `NativeLoadingState` first (then `NativeSkeleton`, `NativeProgress`), and `native-screen-layout` counts a route that renders `NativeLoadingState` as a screen.
- e1de4c1: - `native-screen-layout` counts a route as a screen through `NativeLoadingState` only when a full-screen loading state is all it renders (header options and fragments aside). A route that also renders other content, imports it, or uses `fullScreen={false}` still needs a Genesis layout.
  - Docs: `ScreenContainer`'s `loading` is for first loads (the body is unmounted while it's on); `loadingLabel` is visible and read aloud, so pass translated text; spread `notificationsPushPreferences` after your own keys.

## 1.11.1

### Patch Changes

- 67a06cd: `genesis doctor`, from the third #314 review:

  - `duplicate-genesis-package` / `peer-range-mismatch`: devDependencies count as runtime (a bundler ships what the app imports from them) unless they are tooling: test runners, `@types/*`, linters and formatters, compilers and bundlers, Storybook, release tools, the Genesis CLI. A duplicate under a UI package listed in devDependencies warns again.
  - The route trail's tokenizer reads regex literals and JSX text (`Rock 'n roll`, backticks, `{done}/{total}`) without losing its place, and treats a file it can't read for sure as unknown instead of guessing.
  - Answers cut short by an import cycle are cached by the modules they skipped, so cyclic import graphs no longer run several times slower.

- 2eae42f: `genesis doctor`: in an app with its own install inside another app's folder (a consumer app's `apps/mobile`), `duplicate-genesis-package` and `peer-range-mismatch` count only copies the app's own dependency graph resolves to. An undeclared, uninstalled peer dependency is unmet rather than met by the parent's `node_modules`, and the Genesis CLI's tree is followed only when the app declares the CLI. A regular dependency that resolves up to the parent still counts. Workspace members (no lockfile of their own) are unchanged.
- Updated dependencies [773e809]
  - @marktiderman/genesis-features@0.4.1

## 1.11.0

### Minor Changes

- b196c02: Doctor's supabase pack flags a view in an exposed schema that runs as its owner (no `security_invoker = true` once every migration has run): such a view reads past row level security. New rule `migration-view-rls`.

## 1.10.0

### Minor Changes

- 57b3e5a: `genesis doctor` route and install rules, from the #303 and #314 reviews. Minor: some routes and copies are newly checked, so `--strict` can newly fail.

  - A route whose component is imported (`component: CoursesPage`, a re-exported default) renders; it is no longer read as redirect-only and skipped.
  - TanStack `posts.lazy.tsx` is paired with `posts.tsx` as one route (segments `posts`, not `posts/lazy`).
  - A route rendering its own content around an `<Outlet>` is a page as well as a layout: `page-layout` and `hand-rolled-sub-nav` check it. Only pure layouts are skipped.
  - Next.js: private `_folders`, `(groups)`, `@slots` and the special files (error, loading, not-found, template, default, route handlers) aren't routes.
  - `duplicate-genesis-package`: copies reached only through dev tooling (devDependencies, the Genesis CLI's own tree) are dev-only; when exactly one copy is left at runtime the finding is `info`, and every other copy is reached only through declared devDependencies (an undeclared hoisted path makes it warn), otherwise it warns. An app with no runtime dependencies (everything in devDependencies) has them taken as runtime. `peer-range-mismatch` inside a dev-only copy is `info` too.
  - The route rules follow what a route renders through imports of rendered components, lazy imports, re-exports and barrels (relative, tsconfig `paths`, package.json `imports`, `@/` `~/` `#/`), and tsconfig `baseUrl` and `extends`, up to six modules deep; an unresolvable import makes only that route unsure (never a layout), `import()` in strings and comments is ignored, and past six modules the route is reported as before.
  - A wrapper around an `<Outlet>` is a layout, not a page; an `<Outlet>` in an imported layout component makes the route a layout; a folder `route.tsx` with its own content is checked; `export default R` of a local redirect is redirect-only.
  - Next.js: only `page` and `layout` files under `app/` are routes, and a `(group)` layout wraps only its group.

### Patch Changes

- Updated dependencies [d67b516]
  - @marktiderman/genesis-features@0.4.0

## 1.9.0

### Minor Changes

- d54328d: The doctor's supabase pack adds `migration-testing-kit`: an error when a migration uses `genesis_testing`, the pgTAP kit that belongs in `supabase/tests` only.
- 89ea12c: `genesis doctor` catches structural copies of Genesis. They are warnings (failures under `--strict`), except `resource-workspace`, which is `info`.

  A new `info` level is reported (in the text report, with `--json` `infos` and each finding's `level`) but never fails a run, `--strict` included. `rules` accepts it for any rule.

  The new rules:

  - `hand-rolled-sub-nav`: a route inside the AppShell layout that switches its sections with its own page-level `TabsList` / `SubNavTabs` instead of `useAppShellSubNav` and `AppShellPageHeader`.
  - `local-genesis-copy`: an app component definition (it renders JSX, and it is exported or outside the routes folder) named like a genesis-ui or forms-studio component (`ResourceHeader`, `SettingsSection`, `StatusBadge`, …). A route's own `errorComponent` and similar are not copies.
  - `duplicate-genesis-package`: more than one loadable copy of a Genesis package, found by following resolution through npm/yarn/bun trees, pnpm's store (workspace sub-apps included) and bun's isolated store, with the paths and the ranges that caused it.
  - `peer-range-mismatch`: an installed Genesis package whose peer range on another Genesis package isn't met by the installed peer, with the package, range and installed version.
  - `resource-workspace` (info): detail pages beside one that uses `AppShellPageHeader` but don't.
  - `page-layout`: a route inside the AppShell with no Genesis page layout, itself, through one local import, or from a layout route around it.

  New settings: `routesDir` and `componentPackages`; `--print-genesis` lists the companion packages' components.

- a4dd4aa: `genesis doctor` adds the `iso-date-slice` rule, a warning. It flags a day cut from an ISO timestamp (`toISOString().slice(0, 10)`, `.substring(0, 10)`, `.split("T")[0]` and the like). That is the day in UTC, not the person's. Use `personDay` or `dayIn` from `@marktiderman/genesis-core/dates` instead. Test files are skipped. Where UTC is what you mean, allow it with a reason.

### Patch Changes

- Updated dependencies [6c180f6]
  - @marktiderman/genesis-studio-server@0.3.1

## 1.8.0

### Minor Changes

- d132fe1: The native starter runs on `@marktiderman/genesis-notifications`: the Notifications tab is the notifier's feed (`NotificationsFeed`, live over the person's realtime channel), Settings → Notifications has a switch per category and channel (`NotificationPreferences`), and the push block registers through `notificationsPushBackend` with this install's id and takes its categories and action buttons from the app's registry (`src/lib/notifications.ts`). It carries the notifications migration and its pgTAP test; 0005's pgTAP test is gone (the notifications migration supersedes the register and forget it describes), and `genesis init --template native` records the `notifications` block.

  Features: native-starter, notifications

### Patch Changes

- f852f04: The block catalog carries genesis-support's new `support-chat` block (report threads on genesis-chat, after `support-feedback` and `chat`).

  Features: support-chat

## 1.7.0

### Minor Changes

- 4f1869d: `genesis add`, `genesis migrate`, `genesis upgrade` and `genesis init --template native`.

  - `genesis add <block>` adds a block from what its Genesis package declares (`package.json` `genesis.blocks`, or `defineBlock` declarations at a Node-safe `./blocks` export): installs its packages at the pinned release, copies its migrations in as new timestamped files with a checksum header, and its pgTAP tests, Edge Functions, skills and AGENTS.md fragment; writes Expo Router stubs for missing routes, adds its feature registry entry (or prints it), runs `features build` and prints what is left by hand. It never overwrites a file the app has. `--dry-run`, `--yes`, `--no-install`, `--list`.
  - `genesis migrate` copies new package migrations in after every existing one, and reports (never rewrites) a copy edited in the app or a package migration changed upstream; `--forward` writes a forward migration stub instead.
  - `genesis upgrade` moves every Genesis dependency to one release with the genesis-upgrade workflow's own bump (now shared: the workflow embeds `src/upgrade/bump-core.mjs`), runs codemods only for a declared breaking version (the registry is empty), refreshes the files Genesis owns in the app (`genesis.lock.json`) with a three-way decision and `git merge-file`, runs the doctor, and opens a pull request with `--pr`.
  - `genesis init <app> --template native` makes a new Expo app from the RN starter outside the monorepo: app-owned files only, renamed, `workspace:` deps pinned to the release, plain Metro config, the pnpm settings Metro needs, the eas, maestro and ci templates, and a `genesis.lock.json`. The CLI now ships the starter, the templates and a catalog of every package's block manifests in `dist/`. `init --native` is unchanged.

  `genesis-supabase` declares its `account` and `tenant-features` blocks in `package.json` (`genesis.blocks`: migrations, the `genesis-apple-revoke` function and its secrets, setup steps) and exports the declarations at `@marktiderman/genesis-supabase/blocks`. `genesis-native` declares `push` (migration 0005, the `genesis-push-send` function, the notification settings route), `app-updates` (migration 0002), `observability` and `devtools-overlay` the same way, with a test that each manifest says what its block declares.

- e930dda: `withGenesis` writes a fuller iOS privacy manifest. Required-reason APIs now cover React Native (FileTimestamp C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1), Expo (expo-file-system's FileTimestamp 0A2A.1 and 3B52.1 and DiskSpace E174.1 and 85F4.1, expo-constants' UserDefaults CA92.1), expo-updates, expo-application, expo-notifications and @sentry/react-native, each from the package's own PrivacyInfo.xcprivacy (Sentry's from its privacy-manifest guide), beside async-storage. It sets `NSPrivacyTracking: false` and `NSPrivacyCollectedDataTypes` from the Genesis blocks the app uses (`PRIVACY_BLOCKS`: `account` from genesis-supabase, `observability` from genesis-native with Sentry, `push` from genesis-native with expo-notifications, `support` from genesis-support), unioned per Apple type (block type names are matched whatever their case). An app picks the blocks, or lists everything it collects (any of Apple's 35 types), in genesis.config.json `privacy` (`blocks`, `collects`, `tracking`) or the plugin's `privacy` option; a misspelt data type, purpose or block fails the config, as does a tracking setting that contradicts the app's own `NSPrivacyTracking`. Without either, the plugin warns that only Genesis blocks are declared. The app's own manifest entries always win.

  genesis-native's observability block now also declares "other diagnostic data" (Sentry's device and OS details, breadcrumbs and sessions) and, with `events`, analytics as a purpose of the user id, matching what the privacy manifest declares.

  Features: expo-config-plugin, observability

- 67d7dbd: `withGenesis()` gives each `APP_VARIANT` its own URL scheme: `development` appends `-dev` and `preview` appends `-preview` to every `scheme` (production keeps the base), so builds installed side by side no longer register the same scheme and a `scheme://` link opens the build it names. `VariantSuffix` gains `scheme`; change it with `variants: { development: { scheme: "-debug" } }`. An app that matches incoming links against its scheme should accept each variant's, as the starter's `src/lib/links.ts` now does.

  **Migrating:** a development or preview build no longer answers to the base scheme. Add `myapp-dev://…` and `myapp-preview://…` wherever the base scheme's redirect URLs are allowed (Supabase Auth's redirect URLs, OAuth clients, a Google sign-in callback), or keep the old behaviour with `variants: { development: { scheme: "" }, preview: { scheme: "" } }`.

  Features: expo-config-plugin

### Patch Changes

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

- 0b8987b: Fixes from an end-to-end run of the native starter on an iOS 26 simulator.

  - `NotificationsPage`: the empty state sat under the large-title header, behind the Dynamic Island. It is now in a scroll view with `contentInsetAdjustmentBehavior="automatic"`, as the list is, so iOS insets it below the header and above the tab bar; pull to refresh works on it too.
  - `SettingsSubPage`: with `KeyboardToolbar`, the toolbar floated about a tab bar's height above the keyboard, and with the keyboard closed it showed above the tab bar. The keyboard-scroll layout no longer pads its bottom edge (the toolbar sticks to the keyboard from that edge); the scroll view's automatic inset keeps the last field clear instead.
  - Starter: `genesis-starter://check-in?gym=hilltop`, the link the check-in screen documents, opened Home. The link map now has `/check-in` (with `features.checkIn` on).

- 0fd477c: Fixes from running the native starter on an iOS simulator.

  **PKCE uses S256 on React Native.** Hermes has no `crypto.subtle`, so supabase-js sent the PKCE challenge as `plain` (the verifier itself), and with no `crypto` at all made the verifier with `Math.random`. `createGenesisSupabase` takes `crypto` (`import * as ExpoCrypto from "expo-crypto"`), which installs `crypto.getRandomValues` and a SHA-256-only `crypto.subtle.digest` on `globalThis` from it, never replacing real WebCrypto. A PKCE client made with neither, on any platform, throws in development and logs an error in a release build. With the polyfill in place, `auth.getClaims()` always has the server check the token (`getUser`), because the polyfill can hash but can't verify a signature; supabase-js would otherwise try to verify asymmetric tokens locally and throw. `installWebCrypto`, `hasPkceCrypto`, `assertPkceCrypto` and `isDigestOnlyPolyfill` are on `/native`.

  **The keyboard moves the form.** `GenesisNativeApp` takes `keyboardProvider` (react-native-keyboard-controller's `KeyboardProvider`) and mounts it once around the app. `keyboardScroll`'s `KeyboardAwareScrollView` did nothing without it. It is read once, so an inline wrapper can't remount the app. In development, `keyboardScroll` without `keyboardProvider` logs an error. The ui-native `KeyboardScrollProvider` docs say it needs `KeyboardProvider` above it.

  **Genesis components are styled under NativeWind v4.** New `presets/nativewind` (`genesisNativewindPreset`): the Tailwind v3 preset plus the theme's role colors (`bg-primary`, `border-input`, `text-foreground`, `text-destructive`…, as `hsl(var(--…))`) and their variables, light on `:root` and dark under `prefers-color-scheme: dark`, with the same values as `themes/genesis.css`. With `presets/tailwind` alone, none of those classes were generated and `--radius` was never declared, so inputs had black square borders and primary buttons had no fill. The CLI's scaffolder writes the new preset into an Expo app's Tailwind config.

- 661e2a2: Built with TypeScript 6 (Expo SDK 58 expects `typescript ~6.0.3`).

  - `genesis-forms-builder`: the only change in any package's published declarations. `FlowMap` is now typed `MemoExoticComponent<(props) => JSX.Element>` (TypeScript 5.9 wrote `NamedExoticComponent<props>`); it is the same component and takes the same props.
  - `genesis-cli`: `genesis init --template native` makes an app on TypeScript 6, with the starter's component tests (jest-expo and React Native Testing Library: sign-in, Settings, account deletion, the tabs and the root layout's boot) run by its `test` script beside the vitest file checks. The app's `pnpm-workspace.yaml` leaves out the monorepo's `patchedDependencies`, whose patch files an app doesn't have.

- Updated dependencies [73fb1f5]
  - @marktiderman/genesis-features@0.3.0

## 1.6.0

### Minor Changes

- 8b467c1: `genesis doctor` gains two opt-in rule packs, turned on with `doctor.packs` in genesis.config.json; apps without `packs` see no change. `native` (Expo apps on genesis-ui-native): `native-raw-primitive` (React Native primitives Genesis wraps, from the list the repo's forbidden-imports gate uses), `native-literal-color` (hex and rgb literals in native code, in place of `raw-color`), `native-custom-header` (a hidden navigator header with a hand-drawn one, or a hand-built tab bar), `native-screen-layout` (a route screen that renders none of the screen layouts the installed package exports) and `store-readiness` (warnings: generic usage strings, Sign in with Apple beside third-party sign-in, export-compliance flag, privacy manifest). With the pack on, the core rules read `@marktiderman/genesis-ui-native` and scan `app`, `src` and `components` by default. `supabase` (`supabase/migrations`): `migration-grants` (new migrations only; skipped with a warning when git can't tell which are new, unless `supabase.since` is set), `migration-rls`, `migration-definer-search-path` and `migration-edited` (a migration that exists on `origin/main` was changed). New exports: `readPackageExports`, `nativeLayouts`, `sqlStatements`.

  Features: doctor-native

### Patch Changes

- 954fb55: Use made-up neutral names in doc comments, examples and the brand schema description instead of the names of private apps. No behaviour change; the CLI invalid-name error now gives `"arcade-mobile"` as its example slug.
- a38a00f: Fixes found by building the native starter (`apps/genesis-rn-starter`, Expo SDK 58 / React Native 0.88) on the packages.

  - `@marktiderman/genesis-ui-native`: `AppleButtonModuleLike`'s button now types `style` as a `ViewStyle`, so the real `expo-apple-authentication` module can be passed to `appleProvider` and `AppleSignInButton` under strict TypeScript (with `unknown` it was refused). `ScreenContainer` compiles against React Native 0.88, which dropped `translucent` and `backgroundColor` from `StatusBar`'s props (Android is always edge to edge there); they are still passed for earlier versions. `NativeTextarea`'s `rows` is documented (the generated docs showed React Native's Android-only `rows` description for it).
  - `@marktiderman/genesis-design-system`: `./presets/*` and `./providers/native` gain a `default` export condition, so a CommonJS loader (NativeWind's Tailwind v3 config loader, Metro) resolves them; before, `tailwind.config` importing `presets/tailwind` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  - `@marktiderman/genesis-cli`: the doctor's `store-readiness` rule counts export compliance and the privacy manifest as set when the Expo config lists this package's own config plugin, which sets them (unless its `exportCompliance` / `privacyManifest` option is `false`, and the manifest only when a dependency needs one). Apps on `withGenesis()` no longer get those two warnings. In a dynamic config, only `withGenesis(` or the package's name outside an `import` / `require` counts as listing the plugin.
  - `@marktiderman/genesis-supabase`: the README had merge-conflict markers between the Account section and "Choices, and why"; both sections are kept.

  Features: native-starter

## 1.5.0

### Minor Changes

- 36e114c: `@marktiderman/genesis-core` is now a peer dependency at `^1.6.0` (studio-server had it as a
  dependency at `^1.3.0`), as it is for `genesis-studio`: an app's lockfile can no longer keep an
  older core nested under studio-server while the app runs a newer one. `genesis-cli` loads
  studio-server, so it declares the same peer. Apps already depend on genesis-core; any `^1.6.0`
  release satisfies both.

### Patch Changes

- Updated dependencies [36e114c]
  - @marktiderman/genesis-studio-server@0.3.0

## 1.4.0

### Minor Changes

- f83ba49: From review: the umbrella's `versions.json` lists only the Genesis packages the umbrella depends on (and so releases with), so a patch to a package it doesn't depend on, such as the CLI or supabase, no longer looks like version skew. `genesis init --native` writes a Tailwind config with NativeWind's preset and the genesis-ui-native glob (without it, neither is written). `genesis features find` reports bad options as a clean CLI error instead of a stack trace.
- 406ece8: `withGenesis()`, an Expo config plugin: `plugins: ["@marktiderman/genesis-cli"]` (through the package's new `app.plugin.js`) or `import { withGenesis } from "@marktiderman/genesis-cli/expo"`. It suffixes ids and name per `APP_VARIANT` (development, preview, production) so the variants install side by side; sets `ios.associatedDomains` (`applinks:`, and `webcredentials:` unless `links.webcredentials` is `false`) and an `autoVerify` Android intent filter from a new, validated `links` block in genesis.config.json; declares the FileTimestamp reason `C617.1` in the iOS privacy manifest when `@react-native-async-storage/async-storage` is installed, as that package's own manifest does; and sets `usesNonExemptEncryption: false` and the fingerprint runtime policy unless the app already does. Running it twice changes nothing. It reads only genesis.config.json, package.json and `APP_VARIANT`; set `APP_VARIANT` as an EAS environment variable so `eas update` and fingerprint checks see the same value as builds (the README explains, and lists the per-variant web association entries).

  `readGenesisConfig`, `validateLinks` and `GenesisConfigError` are exported, and `DoctorConfigError` now extends `GenesisConfigError`. `genesis doctor` reads genesis.config.json through the same loader, so it now exits 2 with a message on a malformed `links` block, and on a genesis.config.json that is valid JSON but not an object (an array, a string): that used to fall back to the default settings in silence, and now fails on purpose, because a config the doctor can't read should not pass as "no config".

  Features: expo-config-plugin

- ffa443c: The feature registry becomes a reuse catalog. A new first status, `idea`, captures work that is not agreed yet so `find` turns it up before anyone builds the same thing twice. Optional fields describe what a feature is and how to reuse it: `layer`, `platforms` (status per platform), `entry` (what to import), `keywords`, `slots`, `extends` (a variant of another feature), `requires` and `contributes`. `defineFeatures` checks that `extends` and `requires` name real features, finds cycles, and refuses a beta or live feature that requires an idea, a planned or a retired one. `findFeatures` matches keywords, imports, slots and contributions and takes `platform`, `layer` and `status` filters; `genesis features find` gains `--platform`, `--layer` and `--status`, and the generated skill teaches reuse, then extend, then invent.

  Features: feature-registry

- 58aadde: One Genesis config per app. `genesis features` reads its settings from the `features` block of `genesis.config.json`, beside `doctor`, so an app keeps its Genesis settings in one file. package.json's `"genesisFeatures"` still works; when both exist, `genesis.config.json` wins, and the command line wins over both.

  Features: feature-registry, cli-doctor

- 5078d3f: One Genesis version per app. `@marktiderman/genesis` writes `dist/versions.json` with the exact version of every public Genesis package in its release, exported as `@marktiderman/genesis/versions.json`, and re-exports the features registry as `@marktiderman/genesis/features`. `genesis doctor` gains `version-skew`: in an app with the umbrella installed, it warns for each installed Genesis package on a different version than the release lists (raise it to an error with `rules`).

  Features: umbrella, cli-doctor

### Patch Changes

- 76d7ab7: `genesis init` writes files that work: the Tailwind config imports `genesisPreset` from `@marktiderman/genesis-design-system/presets/tailwind` (the old `/tailwind-preset` path was never exported), and `app/global.css` imports `themes/genesis.css` (the old `tokens.css` didn't exist). It no longer writes `.genesis/cli.yml`, which nothing read. The generated CLAUDE.md and the next steps point at `genesis features find`, `genesis doctor` and the framework docs instead of a document that isn't in the repo, and no longer assume pnpm. `genesis --version` reports the installed version instead of `0.1.0`. The package stops listing a `templates` folder it doesn't have.

  Features: cli-init

- Updated dependencies [e91765c]
- Updated dependencies [ffa443c]
- Updated dependencies [58aadde]
  - @marktiderman/genesis-features@0.2.0

## 1.3.0

### Minor Changes

- ed8083f: `genesis features build|check|find`. `build` writes everything generated from the repo's `features.ts`: the AGENTS.md pointer, `features.json`, the OpenFeature `flags.json`, the agent skill and an optional marketing block, and adds `@AGENTS.md` to CLAUDE.md. `check` fails CI on stale output, missing code paths, the flag rules, removed ids and unknown feature tags (`--labels` checks a PR's `feature:<id>` labels), and warns on the rest; `--summary` is for a SessionStart hook. `find <term>` searches the registry. Settings live in package.json under `genesisFeatures`.

  Features: feature-registry

### Patch Changes

- ed8083f: `genesis features check --prs` also reads merged PRs labelled `feature:<id>` for the planned features (one `gh pr list --search` per ten labels, with a 15-second timeout), and warns when one already shipped. When `gh` is missing, times out or fails, one warning gives the reason from `gh`'s stderr, `--summary` repeats it, and only changesets are checked. `--summary` counts planned features with shipped work.

  Features: feature-evidence

- Updated dependencies [ed8083f]
- Updated dependencies [ed8083f]
  - @marktiderman/genesis-features@0.1.1

## 1.2.0

### Minor Changes

- 9453f10: Add `genesis doctor`: checks an app against the installed Genesis. Components, exports and
  tokens are read from the installed `genesis-ui` declarations and theme CSS (both
  `genesis.css` and the Tailwind v4 bridge `genesis-tailwind4.css` by default; `themeCss`
  takes one path or a list). It flags local primitive folders, direct Radix and starter-utils
  imports, raw tags Genesis has components for, palette, arbitrary and raw colors, undefined
  tokens and exports that shadow Genesis, and lists components the app never uses. Apps
  configure exceptions and add their own rules in `genesis.config.json` (or package.json
  `genesis.doctor`): declarative patterns, a markdown rules document, or plugin modules. Also
  ships `@marktiderman/genesis-cli/vite` (fails production builds, shows the dev overlay) and
  `@marktiderman/genesis-cli/doctor` (programmatic API and plugin types).

## 1.1.1

### Patch Changes

- bcf1248: The studio server runs on Cloudflare Workers, where Lovable deploys TanStack Start apps. A
  database connection there belongs to the request that opened it, so the server now opens one
  per transaction and closes it after (`createPostgresDatabase(url, { perRequest })`, on by
  default on Workers), and one handler serves every request. `genesis studio init` writes
  `process.env["X"]` (for `noPropertyAccessFromIndexSignature`) and says `bun add` for a text
  `bun.lock`.
- Updated dependencies [bcf1248]
  - @marktiderman/genesis-studio-server@0.2.1

## 1.1.0

### Minor Changes

- 69d7f90: **Data Studio P3 — workflow** (docs/DATA-STUDIO.md P3).

  - **studio-server:**
    - **Row actions:** `resources[name].actions` maps a named action to the app's function `fn(record_key jsonb)`. It runs as the user, at the version they saw, and its effect on the row is audited as `run:<name>`. `authorize` is asked `{ action: "run", rowAction }`, and `byResource` takes `actions: true | string[]`. The studio never undoes an action.
    - **Comments:** `authorize` allows `{ action: "comment" }` (`byResource`: `comment: true`). Comments are stored by security definer functions, only for rows the user can see, and the author is always the token's `sub`.
    - **`contracts`:** a checked-in contract from `genesis introspect` wins over discovery for labels, the label field, descriptions and type-compatible widgets. Types, keys and permissions still come from the live database.
    - `@genesis {…}` settings are left out of the comments the studio shows as descriptions.
    - **Hardening:** with `loginRole`, the read functions (`record_history`, `audit_entry`, `record_comments`) now refuse any other login, as the write functions already did. They stay the handler's, even if a Data API is pointed at `genesis_studio`.
    - **Migration:** re-run `npx genesis-studio-server sql` as a new migration. It adds `genesis_studio.comments`, `add_comment` and `record_comments`, and widens the audit log's `action` check to allow `run:<name>`.
  - **studio:**
    - **Board view** (`?view=kanban&by=…`): one column per value of an enum or yes/no field, 50 cards per column with **Load more**. Moving a card is a version-checked update, by drag or by the keyboard **Move to** menu.
    - **Calendar view** (`?view=calendar&by=…&month=YYYY-MM`): one request per month, up to 200 rows. Timestamps are placed on the viewer's day.
    - The record pop-up runs row actions, asking first when the action has a `confirm` question, and has a **Comments** tab.
    - Contract labels are used wherever a field is named.
    - **Fix:** signing in again as the same user (a new token, the same `sessionKey`) now brings the studio back. Before, it stayed on the sign-in screen until a reload.
  - **genesis-cli:** **`genesis introspect`** writes `resources.genesis.ts` from the Postgres catalog or a PostgREST/Supabase OpenAPI document. Labels and widgets come from `@genesis {…}` in table and column comments. The output is deterministic, and `--check` fails CI on drift.

- 69d7f90: **The Data Studio turns on in any app, for every table.**

  - **genesis-cli:** `genesis studio init` writes one migration to review (the studio's `NOINHERIT` login and the audit trail), the server and a page, then prints the remaining steps. The server is a Next.js route, or a Supabase Edge Function for Vite and Lovable apps.
  - **studio-server:**
    - **`supabaseStudio({ url, database })`:** the handler for a Supabase project in one call.
    - **`databaseDecides()`:** every table, every action, bounded by the user's grants and row-level security. `who` defaults to any signed-in, non-anonymous user.
    - **No version trigger needed.** A table without a trusted version column is checked against a fingerprint of the row's readable values (`VersionField.kind: "row"`), so it's editable and stale edits are still refused. A configured `versionField` that can't be trusted still makes the table read-only.
    - **Policies are read too.** A granted table that no row-level security policy lets you update, insert or delete shows that action as off, with the reason, instead of failing on every try.
    - **CORS:** the handler answers preflights for `allowedOrigins`, so it can run on another origin.
    - **`supabaseAuth` inside the local Supabase stack** (`http://kong:8000`) also accepts the browser's localhost issuer. Hosted projects keep the exact issuer check.
    - **`createSupabaseStudioProvider(supabase)`** in `/client`: it sends the session's token and reports user changes.
  - **studio:**
    - `router` is optional (the page's query string), and no `sessionKey` is needed with a provider that reports its session.
    - **`standalone.css`:** every class the studio uses, prebuilt, for apps without Tailwind v4. Its small reset applies only inside the studio and its pop-ups, and the app's own theme variables win.
  - **core:** `VersionField.kind` may be `"row"`.

### Patch Changes

- Updated dependencies [9667f9a]
- Updated dependencies [a642bc0]
- Updated dependencies [69d7f90]
- Updated dependencies [69d7f90]
  - @marktiderman/genesis-studio-server@0.2.0

## 1.0.3

### Patch Changes

- 1a9d899: Release-pipeline only, no code changes. This version is published by CI through npm Trusted Publishing, which now requires the `npm` GitHub environment (main only).

## 1.0.2

### Patch Changes

- 7cfc703: First publish from the new public repo. No functional changes — every package's current version already matches what's published from the predecessor repo, so this bump is required before this repo's release workflow can publish anything at all (npm rejects republishing an existing version).

## 1.0.1

### Patch Changes

- 0dfba25: Scaffolder: the consumer pin file moves from `.genesis/config.yml` to `.genesis/cli.yml`
  to avoid colliding with the schema-validated harness root config (`genesis.config.yml`).
  The pin file's shape is unchanged (version/consumer/rules/paths); only its path and header
  comment changed. The scaffolder is write-only — nothing in genesis-cli reads the pin at
  runtime — so repos scaffolded before this change keep their existing `.genesis/config.yml`
  untouched (it is simply no longer the name new scaffolds emit); re-running `init` in such a
  repo writes the new path and leaves the old file for the consumer to delete.

## 1.0.0

### Major Changes

- e972635: Rename the npm scope from the old pre-public scope to `@marktiderman` across all Genesis packages: `genesis-*` → `@marktiderman/genesis-*`.

  The data-layer package additionally shortens its name to `@marktiderman/genesis-switchboard` (dropping the redundant `data-` prefix while keeping the `genesis-` family prefix consistent with the other packages).

  **Breaking change.** Consumers must update every import specifier and dependency entry (e.g. `genesis-ui` → `@marktiderman/genesis-ui`, and `genesis-data-switchboard` → `@marktiderman/genesis-switchboard`). Per npm best practice the previous pre-public-scope names will be `npm deprecate`d with a pointer to the new names once the `@marktiderman/*` packages are published. The legacy `genesis@2.0.0` umbrella package under the old scope is unaffected (separate lineage).
