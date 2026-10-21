# @marktiderman/genesis-cli

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
