# @marktiderman/genesis-cli

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
