# @marktiderman/genesis-features

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

- 5b1f464: The flag scan in `checkFeatureOutputs` ignores comments (a flag named in a comment isn't a read) and test files, and takes `scanIgnore` for the flags runtime that defines the accessors. Found running the check against Breakthrough's flags runtime.

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
