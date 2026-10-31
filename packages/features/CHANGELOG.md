# @marktiderman/genesis-features

## 0.8.0

### Minor Changes

- 6eb984b: `readOverlayMarker(name, raw, problems)` validates a package's `genesis.overlay` marker (an app's local copy of a Genesis package): `upstream` is `@marktiderman/genesis-*@<semver>` naming the package itself, `since` a real `YYYY-MM-DD` day, `owner` and `reason` text. `readPackageMeta` checks the marker when present, and `PackageMeta` gains `overlay`. New exports: `readOverlayMarker`, `overlayUpstream`, `OverlayMarker`.

  Features: app-overlays

- b11005b: `genesis features check` and `build` let an id that was last recorded as `idea` or `planned` be removed for good: it never shipped, so no code, flag or test refers to it, and a backlog can move to a planning repo of its own. Ids stay permanent from `building` on.
- b028861: A feature's `kind` replaces its `layer` field. `kind` takes the same values (token, element, pattern, layout, hook, provider, block, service, tool); `layer` is still read as a kind until the next major (`"primitive"` as `"element"`), `features check` warns on it, and a feature that sets both to different kinds fails. A feature's layer is now its owning package's (foundation, primitive, module, tooling), derived from its `entry` imports or its `links.code` paths: `featurePackageLayer(def, packages)`, and `findFeatures(…, { packageLayer, packages })`. New exports: `FEATURE_KINDS`, `FeatureKind`, `featureKind`, `featurePackageLayer`, `FeaturePackage`; `FEATURE_LAYERS` and `FeatureLayer` are deprecated aliases.

  `genesis features find` gains `--kind`; `--layer` now filters by the owning package's layer (foundation, module or tooling), and a kind passed to `--layer` still works with a warning until the next major (so `--layer primitive` still means the element kind until then); a kind passed to both that disagrees is refused. Records (`toRecords`, `features.json`) carry the resolved `kind` and no longer the deprecated `layer`. `genesis add` writes `kind:` into features.ts when the app's genesis-features reads it (0.8 and later; `layer:` before), and a block manifest's `feature.kind` (or its deprecated `feature.layer`) sets it.

- c0c573f: Package metadata gains `genesis.optional`: an upgrade apps opt into. The layering check fails a foundation package or primitive that uses an optional package, except as an optional peer dependency (`peerDependenciesMeta`), so optional capabilities plug in through ports the primitive owns (ADR 0013).
- 1ed0cba: Package layers. Every package's package.json now says where it sits: `genesis.layer`
  (`foundation`, `primitive`, `module` or `tooling`), `genesis.group` (`core`, `data`, `ai`,
  `forms`, `collaboration`, `shells` or `modules`) and, on the foundation packages, `essential`.
  Dependencies only point down, and the repo's CI fails when one doesn't (docs/PACKAGE-STRATEGY.md,
  "Layers").

  - genesis-features: `PackageMeta`, `ModuleMeta`, `PACKAGE_LAYERS`, `PACKAGE_GROUPS`,
    `readPackageMeta` and `packageLayerProblems` (also from `/blocks`). The feature `layer` that
    meant one component is now `"element"`; `"primitive"` is still accepted as its deprecated name,
    and `findFeatures(…, { layer: "element" })` finds both, until the next major.
  - genesis-sites, genesis-support and genesis-product are modules: each declares a
    `genesis.module` card (name, summary, blocks, schema, install line, docs) and ships a
    `SKILL.md`. genesis-product gains a `product-board` block (`genesis add product-board`), and
    marks `/node` and its `genesis-product` bin as tooling.
  - genesis-cli: `genesis features find --layer element` (`--layer primitive` still works).

- f9a11f2: `PackageMeta` gains `owner`, a GitHub handle or team (`@octocat`, `@acme/web`) who reviews changes to the package; `readPackageMeta` checks its shape. Genesis's packages each declare one, and the repo's `.github/CODEOWNERS` is generated from them (`pnpm gen:codeowners`, checked in CI), so ownership can split per package later without a process change.

### Patch Changes

- 37972e2: Layering fixes for optional packages: an optional peer is left out of the cycle search, so an upgrade's adapter that uses the primitive no longer reports a false cycle. `LayerPackage.valueImports` (filled by the repo's layering check) lets a foundation package or primitive import an optional peer only for types or with `import()`. `packageLayerProblems` refuses `genesis.overlay` on a Genesis package itself, and the overlay marker's `upstream` refuses build metadata and a `-local` tag. `optional` on a module is documented as adding no rule.

  Features: package-layering, app-overlays

## 0.7.0

### Minor Changes

- 9a254df: Content packs are generic. A pack's data goes in `sections`, keyed by the block that owns it (`sections: { meetings: [...] }`). Genesis checks what every pack shares (id, version, publisher, requires, labels, and a unique `key` on every item) and that each section's block is in `requires`; what an item holds is checked by the validator its block registers, the new `contributes.contentSection` on `defineBlock`. `contentPackProblems(pack, options)` takes `{ installed, blocks, validators }` (validators by block id win over a block's own), and still takes the installed blocks alone (a list, a set or a predicate; anything else throws a TypeError). A validator gets the section's items and returns messages relative to the section; one that throws is reported as a problem; `defineContentPack(pack, { blocks })` checks with them too. New types: `ContentPackSections`, `ContentPackSectionValidator`, `ContentPackCheckOptions`.

  Nothing breaks: the typed sections (`sessionTypes`, `metricTemplates`, `fieldDefinitions`, `forms`, `roadmapTemplates`), their types and `CONTENT_PACK_FIELD_TARGETS` still work and are checked as before, and are deprecated. Move that data into `sections` under the block that owns it, with that block's validator.

  Features: content-packs

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

## 0.6.1

### Patch Changes

- afae598: Per-person entitlements. Migration 0016 adds `private.genesis_viewer_person_ids()`, a fail-closed wrapper over the app's `private.genesis_viewer_people(viewer)` hook. It gives the person records a login is, so every block resolves a viewer's people the same way. It is in the owner-access and feature-mirror blocks. Migration 0017 adds `feature_person_entitlements` (grants to the app's person record, written with the service-role `grant_person_entitlement` and `revoke_person_entitlement`). `feature_on`, `feature_entitled_tenants` and `feature_gate_state(tenant)` now count the signed-in person's own grants, and server code can call `feature_gate_state(tenant, person)`. `featureGateState(client, tenant, { personId })` passes the person. In genesis-features, the gate's `entitlements` doc now says it holds the person's grants too.

  Features: feature-mirror, owner-access, feature-gate

## 0.6.0

### Minor Changes

- 7cdf0fe: Content packs: `defineContentPack` (in `/blocks`, zod-free) declares versioned data that fills installed blocks (session types and agendas, metric templates, custom field definitions, forms, roadmap templates, labels) and lists every shape problem at once; `contentPackProblems(pack, installedBlocks)` also refuses a pack whose blocks aren't installed; `contentPackBlocks` names the blocks a pack fills.

## 0.5.0

### Minor Changes

- bc5a348: The gate follows `requires`: a feature is off while a registry feature it requires is off (a module's parts go off with the module), and the answer's new `via` names the one that said no, so an upsell names the module's plan. `FeatureOff` carries `via` too.

## 0.4.1

### Patch Changes

- 773e809: The gate's plain types (`FeatureStatus`, `FeatureAccess`, `FlagKind`, `FlagValue`) move to a zod-free file, so `/gate`'s type declarations no longer reach zod. `isSnapshotStale` treats a future-dated snapshot as stale, and `fromSnapshot` reads a damaged or older stored snapshot as off instead of throwing.

## 0.4.0

### Minor Changes

- d67b516: The feature gate: `featureOn(registry, context, id)` checks status, platform, the tenant's switch, release flags (on only when exactly true) and last entitlement and returns `{ on, reason, unlock }`. `gateSnapshot` answers every shipped feature as plain JSON with `at` and `version` (no flag names), `isSnapshotStale` says when to refresh, `requireFeature` throws `FeatureOff` (402 for entitlement, 403 otherwise), and `/gate/react` adds `FeatureGateProvider`, `useFeature` and `FeatureGate`. `/gate` has no zod, for browsers, phones and edge functions.

## 0.3.0

### Minor Changes

- 73fb1f5: Blocks: `defineBlock` and `resolveBlocks` in `@marktiderman/genesis-features/blocks` (free of zod; also re-exported from the root) declare a block by its FeatureId with what it requires and contributes (nav, Settings rows, routes, slot fills, migrations, skills, privacy), and resolve the enabled ones with requirement, cycle and conflict checks. The registry's `requires` checks now live in `graph.ts`, shared by both, with the same messages.

  `GenesisNativeApp` takes `blocks` (and `appFeatures`, for requirements that aren't blocks): their boot steps, roots and slot fills (under the app's own slots; an unknown slot name is an error), with `useBlocks` and `useBlockSettings` for the nav tree and Settings. A setup error in the shell now hides the splash, so the fatal screen shows. `createUpdates` now returns a block (`app-updates`) that contributes the version signature row (`versionRow` sets or turns it off); `updates={…}` works as before.

  `genesis-supabase` adds migration `0004_genesis_tenant_features.sql`: per-tenant feature switches with a reason and a change history, `set_tenant_feature` for the tenant's admins through an app-supplied `private.genesis_tenant_admin` hook (fails closed without it), `tenant_features_off` for members, `tenant_feature_settings` and `tenant_feature_history` for admins, and `private.tenant_feature_on` for SQL gates; with the client helpers `tenantFeatures`, `setTenantFeature`, `tenantFeatureSettings` and `tenantFeatureHistory`, and `accountBlock` and `tenantFeaturesBlock` declarations.

## 0.2.0

### Minor Changes

- ffa443c: The feature registry becomes a reuse catalog. A new first status, `idea`, captures work that is not agreed yet so `find` turns it up before anyone builds the same thing twice. Optional fields describe what a feature is and how to reuse it: `layer`, `platforms` (status per platform), `entry` (what to import), `keywords`, `slots`, `extends` (a variant of another feature), `requires` and `contributes`. `defineFeatures` checks that `extends` and `requires` name real features, finds cycles, and refuses a beta or live feature that requires an idea, a planned or a retired one. `findFeatures` matches keywords, imports, slots and contributions and takes `platform`, `layer` and `status` filters; `genesis features find` gains `--platform`, `--layer` and `--status`, and the generated skill teaches reuse, then extend, then invent.

  Features: feature-registry

### Patch Changes

- e91765c: From review: `keychainStorage` queues reads with writes (a read could see the old generation disappear mid-read), lets every chunk write settle before reporting a failure (so a late write can't outlive the sweep), and removes chunks before the manifest. `refreshWhileActive`'s unsubscribe also stops auto-refresh. `wipeSessionOnReinstall` removes every indexed PKCE flow verifier and the index. `defineFeatures` skips schema-invalid entries in its relation checks instead of throwing, and `statusOn` treats `node` in `apps` as the `server` platform. `SettingsPage` rows are transparent so the theme-role cell color shows.

  Features: supabase-kit, feature-registry, native-components

- 58aadde: One Genesis config per app. `genesis features` reads its settings from the `features` block of `genesis.config.json`, beside `doctor`, so an app keeps its Genesis settings in one file. package.json's `"genesisFeatures"` still works; when both exist, `genesis.config.json` wins, and the command line wins over both.

  Features: feature-registry, cli-doctor

## 0.1.2

### Patch Changes

- 5b1f464: The flag scan in `checkFeatureOutputs` ignores comments (a flag named in a comment isn't a read) and test files, and takes `scanIgnore` for the flags runtime that defines the accessors. Found running the check against a consumer app's flags runtime.

  Features: feature-registry

- 5b1f464: The flag scan no longer mistakes a regex literal (`/[/*]/`), a closing JSX tag, or an apostrophe in JSX text for the start of a comment or string. Comments inside a template's `${…}` are blanked like any other code.
- 5b1f464: The generated skill names only what `build` writes in this repo (for example, no `flags.json` when `openfeature` is off), instead of a fixed list. The flag scan also ignores text inside strings ("…behind the release flag (off)" isn't a call), and an apostrophe after a letter (JSX "Don't") no longer starts a string.

  Features: feature-registry

## 0.1.1

### Patch Changes

- ed8083f: `checkFeatureOutputs` warns, without failing, when a feature still marked `planned` already has shipped work tagged with it: a changeset with a `Features: <id>` line, or a merged PR passed in as `evidence: { prs: { <id>: [{ number, title }] } }`. The warning names each item ("billing is still planned, but .changeset/x.md and PR #123 shipped work for it"), the result lists them as `plannedButShipped`, and `summarizeCheck` counts them.

  Features: feature-evidence

- ed8083f: New package: a typed feature registry. `defineFeatures` and `defineFlags` in one `features.ts` that running code imports, with statuses through `deprecated` and `retired`, a dateless roadmap (`horizon`), `visibility` and `access`, `acceptance` sentences, permanent ids with `aliases`, `reviewedAt` and `claimedBy`, and optional marketing fields (`tagline`, `category`, `media`, `highlight`). Flags carry `kind`, `default`, `scopes`, `expires` and `runbook`. Generators: a short AGENTS.md pointer, `features.json`, an OpenFeature `flags.json`, the agent skill and a marketing block. `/node` builds and checks them with errors and warnings in tiers, scans code for flag reads and tests for `@feat:<id>` tags. `/react` has `FeatureList` (admin and marketing variants). The first version (0.1.0) is published by hand, so this patch is its first CI publish.

  Features: feature-registry
