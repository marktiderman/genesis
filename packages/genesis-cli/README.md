# @marktiderman/genesis-cli

```bash
npx @marktiderman/genesis-cli init <consumer>
```

Scaffolds a Genesis consumer: a brand package, Tailwind and tokens.

```bash
npx @marktiderman/genesis-cli init <app> --template native [--bundle-id com.acme.app] [--scheme acme] [--display-name "Acme"]
```

Makes a new Expo app from the Genesis RN starter, in `./<app>` (or `--target`), which must be new
or empty. See [A new native app](#a-new-native-app).

```bash
npx @marktiderman/genesis-cli add <block> [--dry-run] [--yes] [--no-install]
npx @marktiderman/genesis-cli migrate [--dry-run] [--forward]
npx @marktiderman/genesis-cli upgrade [--version <v>] [--dry-run] [--keep-mine] [--pr]
```

Add a block to an app, copy new package migrations in, and move every Genesis package to one
release. See [Blocks: add, migrate, upgrade](#blocks-add-migrate-upgrade).

```bash
npx @marktiderman/genesis-cli doctor [--strict] [--json] [--build] [--config <path>] [--dir <dir>]
```

Checks an app against the Genesis it has installed. See [genesis doctor](#genesis-doctor).

```bash
npx @marktiderman/genesis-cli studio init
```

Turns the Data Studio on in an existing Supabase app. It writes three things:

- **One migration to review:** the studio's `NOINHERIT` login and the audit trail. It holds no
  password.
- **The server:** a Next.js route when the app has an `app/` router; otherwise a Supabase Edge
  Function, `supabase/functions/genesis-studio`, with `verify_jwt = false` added to
  `supabase/config.toml` because the function checks tokens itself.
- **A page:** for Lovable apps, it imports `@/integrations/supabase/client`.

It then prints the steps left: install, route the page, set the login's password, set the
function's secrets, apply the migration. Options: `--host next|supabase-function`, `--route`
(default `/admin/data`), `--login-role`, `--force`.

```bash
DATABASE_URL=postgres://… npx @marktiderman/genesis-cli introspect
```

With no flags it follows the app's `doctor.contracts` settings (`out`, `schemas`,
`databaseEnv`), so it rewrites the file the doctor's `contracts-stale` check reads, from the same
schemas: without `contracts.schemas`, the ones the existing contract's `// Source:` line names.
`-o`, `-s` and `--database-env` override them; paths are relative to the app's root, where you run
the command. With `--openapi`, only a single configured schema carries over (else `public`).

Writes `resources.genesis.ts` (or `contracts.out`), a checked-in contract for the Data Studio: every table in the
schemas, with its key, fields (type, database type, nullability, defaults, enum values, links)
and a row type per table. Enum values come from enum types and from single-column `CHECK`s that
list values (`status in ('open', 'done')`). A view Postgres can update on its own takes its
table's key and column facts, and its table's `noun` (see `docs/RESOURCE-VIEW.md`). A read-only view
that joins tables has no key the catalog can see: name it in the view's comment,
`@genesis {"key": "id"}` (or a list of columns, no repeats; one that differs from a primary key
is used, with a warning). A foreign key is a link when it's one column, or a composite key whose
other columns reference their namesakes and whose own column references a column unique on its own
(the primary key or a unique index): the tenant-safe `(gallery_id, org_id) references galleries
(id, org_id)` makes `gallery_id` a link to galleries, while `(doc_id, version) references
doc_versions (id, version)` is not a link.
PostgREST's OpenAPI notes single-column keys only, so `--openapi` links those alone. Review it like code, and pass `contracts` to `createStudioHandler`. It
wins over discovery for labels, widgets and descriptions; types, keys and permissions still come
from the live database.

| Option | Default | |
| --- | --- | --- |
| `--database-env <name>` | `DATABASE_URL` | The variable holding the Postgres URL. It's never read from the command line, so it stays out of shell history. Any role that can read `pg_catalog` works; no table data is read. |
| `--openapi <file-or-url>` | | Read a PostgREST OpenAPI document instead, e.g. a Supabase project's `https://<ref>.supabase.co/rest/v1/`. |
| `--apikey-env <name>` | | The variable holding the API key for an `--openapi` URL, sent as `apikey` and as a Bearer token. Like the database URL, it stays off the command line. |
| `--header "<Name>: <value>"` | | Other headers for an `--openapi` URL, for values that aren't secret. Repeatable. |
| `-s, --schema <list>` | `public` | Comma-separated schemas. `--openapi` reads one. |
| `-o, --out <file>` | `resources.genesis.ts` | Where to write. |
| `--check` | | Write nothing; exit 1 when the file is out of date. Run it in CI to catch drift. |

The output is deterministic: a re-run with no schema change writes the same bytes.

```bash
npx @marktiderman/genesis-cli features build   # or: features check (for CI)
```

Writes the marked feature block in `AGENTS.md` (and a JSON copy with `--json <file>`) from the
repo's `src/features.ts`; `check` exits 1 when that output is stale or a feature's `links.code`
path doesn't exist. See [genesis-features](../features/README.md) for the registry and the options.

## A new native app

`genesis init <app> --template native` copies the starter (`apps/genesis-rn-starter`) that ships
inside the CLI, at the version the CLI was released with:

- only the files an app owns: no `node_modules`, build output, or the starter's monorepo-only test
  (`__tests__/release.test.ts`, which reads the monorepo's `templates/`);
- renamed: package name, display name, slug, URL scheme and bundle id, everywhere the starter's
  values appear (Apple client ids in `supabase/config.toml`, the Maestro flows' `appId`);
- every `workspace:` dependency set to `^<version>` from the same release (the installed
  umbrella's `versions.json` when there is one), the plain Metro config, and a
  `pnpm-workspace.yaml` with the pnpm settings Metro and pnpm 11 need (hoisted layout, allowed
  build scripts, one React);
- the templates: `templates/eas` to `eas.json` and `.eas/`, `templates/maestro` to `.maestro/`,
  `templates/ci` to `.github/workflows/` (replace `GENESIS_SHA` in them);
- `genesis.lock.json`, recording the blocks the starter carries that are on (`account`,
  `app-updates`, `push`, `notifications`, `support-feedback`, `chat`), every file Genesis owns in
  the app with its checksum, and the renames, so `upgrade` can refresh them and `migrate` knows the
  blocks. Every file the lock names is written.

`--without <switches>` (comma-separated, e.g. `--without chat,support,updates`) turns those
`starter.config.ts` switches off. A block an off switch carries (the starter's genesis.config.json
`starter.blocks`: `updates` → `app-updates`, `push`, `notifications`, `support` →
`support-feedback`, `chat`) is left out whole, unless a block that's on requires it: its
migrations, pgTAP tests and Edge Functions, the starter's own `supabase/` files tagged only with it
(`chat_people` goes with chat), their `supabase/config.toml` sections and the API schemas its
migrations create. Turning a switch off later works the same way for the commands: `upgrade`,
`migrate` and the doctor's `lock-files` leave a locked block out while its switch is off, so delete
its files or keep them, as you like. To have a left-out block back, turn its switch on and run
`genesis add <block>` (the starter's own files that went with it, such as `chat_people`, are in
the starter).

The summary ends with what is left by hand: `GENESIS_SHA`, the EAS project id, the links domain,
and each store id still a `REPLACE_WITH_…` placeholder in `eas.json` with what replaces it (the
doctor's `eas-placeholder` warnings say the same). Init can't fill those: only you have them.

The starter's migrations are copied byte for byte (its own tests check that); `migrate` knows them
by name and text. They are the app's applied baseline: its genesis.config.json gets
`doctor.supabase.since` just after the newest, so the supabase pack checks only later migrations as
new, even before the app has a git history to compare with. `init --native` (the brand-package scaffold for an Expo app) is unchanged.

### A phone app beside a web app

A phone app often has no Supabase project of its own: it signs in to, and reads from, the web app's
database, and the web app's `supabase/` is the only migrations folder. Make it with
`--beside <web-app>`:

```sh
genesis init sample-app --template native --target mobile --beside app
```

When the web app has a `supabase/` folder, init writes none of the starter's `supabase/` files (or
the database CI workflow), sets `"supabase": { "app": "../app" }` in the new app's
`genesis.config.json` (the web app's folder, relative to the phone app) and drops the doctor's
supabase pack there. The lock still records the blocks that are on, with no Supabase files, and the
summary's first line says what to run in the web app for the ones whose database files it lacks
(a migration it has no copy of, newer ones of a block it has included, or an Edge Function with no
folder there), in the order to run them (a block's requirements first, `notifications` before
`push`). Each is `genesis add <block> --database-only`: only the block's migrations, pgTAP tests,
Edge Functions and `config.toml` sections, and the packages they're read from. A phone block's
install, routes, skills, steps and feature entry stay the phone app's, and the web app's lock
doesn't list the block (its copies are tracked by their headers and lock entries):

```text
In ../app (it holds this app's database), run: genesis add account --database-only && genesis add chat --database-only
```

A web app with no `supabase/` folder gets a note instead, and the phone app keeps its own, as
without `--beside`.

The setting, on any app: `"supabase": { "app": "<folder>" }` says this app's database files live in
that app's `supabase/`; `"supabase": false` says this app has none. With either, `genesis add`,
`migrate` and `upgrade` never write or plan Supabase files here (migrations, pgTAP tests, Edge
Functions, `config.toml` sections); they say where to run them instead (`genesis add <block> --database-only`), and which of this
app's blocks' database files the other app lacks; `upgrade` still lists new package migrations,
to apply there. They don't write into the other app: its lock, its
installed package versions and its doctor are its own, so the commands run there. `upgrade` leaves
lock entries under `supabase/` alone, so an app that moves to the setting can delete its
`supabase/` folder and those entries. The doctor's supabase pack doesn't run, and
`database-elsewhere` warns when the named app has no `supabase/`, or when a `supabase/` folder is
still here (a second, unused copy).

## Blocks: add, migrate, upgrade

A block is a feature an app adds whole (see `defineBlock` in `@marktiderman/genesis-features`).
The commands read blocks from the Genesis packages, never from a list in the CLI, so a package
that declares a block is found:

- `package.json` → `"genesis": { "blocks": { "<id>": { … } } }`, plain JSON the CLI reads without
  running package code. The CLI carries a catalog of every Genesis package's manifests, so a block
  is found before its package is installed.
- A `./blocks` export of `defineBlock` declarations that loads in Node (no React Native), such as
  `@marktiderman/genesis-supabase/blocks`. What a declaration says (requires, platforms,
  migrations, routes, skills, privacy) wins over package.json; package.json adds what a
  declaration can't.

A manifest entry:

```json
{
  "feature": { "name": "Push", "summary": "…", "keywords": ["notifications"], "audience": ["person"] },
  "platforms": ["native"],
  "requires": ["account"],
  "packages": ["@marktiderman/genesis-native", "@marktiderman/genesis-supabase"],
  "install": ["@supabase/supabase-js@^2.118.0"],
  "migrations": [{ "package": "@marktiderman/genesis-supabase", "file": "migrations/0005_genesis_push.sql", "test": "migrations/tests/0005_genesis_push.test.sql" }],
  "functions": [{ "package": "@marktiderman/genesis-supabase", "dir": "functions/genesis-push-send", "verifyJwt": false, "secrets": ["GENESIS_PUSH_SECRET"] }],
  "routes": [{ "path": "/settings/notifications", "signedIn": true }],
  "skills": ["skills/push/SKILL.md"],
  "agents": "agents/push.md",
  "steps": ["npx expo install expo-notifications, and add it to the plugins in app.config."]
}
```

Every path is package-relative and checked before anything reads it: no absolute paths, no `..`,
no backslashes, and a file that resolves (through a symlink) outside its package is refused.
`package` must be a Genesis package. Migrations are named `NNNN_name.sql`. A package whose
runtime block is made by a function (`createPush`) keeps a test that its manifest says what the
block declares.

### Local packages

An app's own workspace packages can be Genesis-style packages too. List them in
`genesis.config.json`, as app-relative folders or folders ending in `/*`:

```json
{ "localPackages": ["packages/*"] }
```

A local package declares blocks the way a Genesis package does:
- a `genesis.blocks` manifest in its package.json and a `./blocks` export;
- its own `migrations/NNNN_name.sql`, each with a pgTAP test.

Then:
- `genesis add <block>` and `genesis migrate` copy its migrations and tests like any package's,
  with a `genesis-migration` header naming the local package. Nothing is installed: it lives in
  the app's repo.
- `genesis doctor` scans its source with every rule, and the [`packages` pack](#rule-packs)
  holds it to a package's standard: no app imports, declared dependencies, tested and never-edited
  migrations, registered in `features.ts`, and a changeset or version bump with every change.
- A local package keeps package shape, so publishing it later (GitHub Packages or npm) needs no
  restructuring.

### Overlays

An **overlay** is a local package that shadows a published `@marktiderman/genesis-*` package by
name: the package's source, copied into the app at a release, so the app can change it and ship
the change the same day. Put it in a package folder of its own (`packages/genesis-support`), list it
in `localPackages` like any local package, and mark it in its package.json, keeping the package's
own `genesis` key:

```json
{
  "name": "@marktiderman/genesis-support",
  "version": "0.2.6+local.1",
  "private": true,
  "genesis": {
    "doctor": { "…": "the package's own declaration" },
    "overlay": {
      "upstream": "@marktiderman/genesis-support@0.2.6",
      "since": "2026-10-30",
      "owner": "web team",
      "reason": "inbox filters; to promote upstream"
    }
  }
}
```

- `upstream`: the package and the exact release it was copied from (`@marktiderman/genesis-*@<semver>`,
  a prerelease allowed; no build metadata and no `-local.N`, which are an overlay's own versions).
- `since`: the day the overlay was made, `YYYY-MM-DD`, not later than tomorrow.
- `private: true`: an overlay never publishes.
- `owner`, `reason`: who answers for it and why it exists.
- `version`: `<upstream version>+local.N` by convention (`N` without leading zeros). Build metadata (`+`) keeps it inside other Genesis packages' peer ranges (`^0.2.6`), which a prerelease (`-local.N`) would fall outside; the upstream version itself, or `-local.N`, are also accepted.

**Wiring it in.** Point the app's dependency at the overlay, and add a root override with the same
specifier so other Genesis packages that depend on it get the copy too, not a second published copy:

- **pnpm, Bun, Yarn**: `"@marktiderman/genesis-support": "workspace:*"`, with the same value in
  `pnpm.overrides` (pnpm), `overrides` (Bun) or `resolutions` (Yarn).
- **npm** has no `workspace:` protocol: use `"@marktiderman/genesis-support": "file:./packages/genesis-support"`
  in `dependencies`, and the same `file:` specifier in `overrides` (npm requires an override for a
  direct dependency to match it).

**Fix the copied manifest.** A source copy keeps Genesis's own `workspace:` ranges for its
dependencies (`"@marktiderman/genesis-features": "workspace:^"`), which the app can't resolve. Replace
each with the published range the upstream release declares (read it from the package.json on npm
for that version), so the overlay installs against the same Genesis it was copied from.

An overlay can keep its build step, or point its exports straight at TypeScript source
(`"exports": { ".": "./src/index.ts" }`). For TypeScript source, the server bundle must inline
every Genesis package: otherwise a published Genesis package that the server leaves external
imports the overlay through Node, which can't load `.tsx` (a 500 in dev). In Vite, set
`ssr: { noExternal: [/^@marktiderman\/genesis-/] }` (Vite matches `noExternal` against package
names). Vitest's `server.deps.inline` matches resolved file paths instead, so use a path pattern
there: `test: { server: { deps: { inline: [/[\\/]@marktiderman[\\/]genesis-/] } } }`. The doctor reads a source overlay's
component exports from the source its exports point at when there's no `types` condition.

**What the doctor does with it.** A local package wins over an installed one of the same name, so
the overlay's own `genesis.doctor` rules run, and the [`packages` pack](#rule-packs) checks it like
any local package. Then:

| Rule | Level | What it flags |
| --- | --- | --- |
| `overlay-unmarked` | error | A local package with a `@marktiderman/genesis-*` name and no `genesis.overlay`. Mark it, or rename it. |
| `overlay-invalid` | error | A marker that doesn't validate (each problem with `upstream`, `since`, `owner`, `reason`, or an unknown key), a `since` later than tomorrow, an overlay that isn't `private: true`, or an overlay folder that holds the app's scanned source (`src`, or the app root). Such an overlay doesn't count as the package below. |
| `overlay-age` | info / warn | A marker older than 14 days is reported as info, which never fails a run; older than 30 days it warns, which fails `--strict`. An overlay never blocks a release in its first month, and must be promoted or dropped within it. |
| `overlay-version` | warn | The version isn't the upstream version, `<upstream>+local.N` or `<upstream>-local.N`. |
| `overlay-behind` | warn | The marker's `upstream` is older than the version the app now pins: the installed release's (`@marktiderman/genesis`'s `versions.json`), else the app's own dependency on the package. Fails `--strict`. `genesis upgrade` rebases the overlay and clears it. (`version-skew` then says nothing about that overlay; it still flags one copied from a release newer than the installed one.) |

A marked overlay (valid marker, private, in a package folder of its own) **is** the package it
shadows, so for files inside it `shadowed-export`, `raw-tag`, `local-genesis-copy` and
`native-raw-primitive` don't flag that package's own names (an overlay of another package still may
not shadow genesis-ui). `version-skew` compares the release with the marker's `upstream` version
instead of the overlay's own (only for an overlay the app lists; a marked package that is merely
installed is compared as usual), and the packages pack's change gate (`package-unversioned-change`)
asks for no changeset or version bump. A block migration that names another package
(`{ "package": "@marktiderman/genesis-supabase", "file": "…", "test": "…" }`) has its test looked up
in that package, not in the overlay; a name that isn't valid, or a package that isn't installed or
local, is reported by `package-migration-test`.

**On every upgrade.** `genesis upgrade` cleans out each overlay whose `upstream` is older than
the release it moves to, before it writes anything:

1. It reads the package's source at the upstream tag and at the new version from the Genesis
   repository's `<package>@<version>` git tags, diffs the overlay against the upstream tag, and
   sorts each hunk: **shipped** (the new version already has it: dropped), **promoted** (a
   `promoted` entry in `docs/genesis-upstream.md` for the package lists the file: link its Genesis
   PR there) or **kept** (the app's own change: say why in the pull request).
2. It rebases what's left onto the new version: a three-way merge per file (the upstream tag the
   base, the overlay and the new version the two sides; package.json merged as JSON). A file new
   upstream comes in, one gone upstream goes (unless the app changed it), and one the overlay never
   carried stays out. The marker's `upstream` becomes `<package>@<new version>` and the version
   `<new version>+local.N`.
3. An overlay with nothing of the app's own left, in its source or its package.json (past its
   version, `private` and marker), is deleted, and each `workspace:`/`file:`/`link:` dependency on
   it (resolved from that package.json's own folder) pins the release, its override dropped. If
   pnpm-workspace.yaml, a tsconfig or a vite, vitest, metro or babel config still names its folder
   (or pnpm-workspace.yaml overrides the package to a local copy), it stays, on the checklist.
4. When a merge conflicts, it writes nothing at all: it stops and lists the files to rebase by hand
   (`--dry-run` lists them without stopping). A file that isn't text is never merged: it takes the
   new version's copy when the app's is the old one's, and is a conflict otherwise. An overlay whose
   tags can't be read (the fetch never prompts and gives up after two minutes) is left as it is, and
   the checklist says why. `--genesis-repo <url>` reads the tags from another clone or mirror.

The checklist goes into the summary and the pull request: **an upgrade PR isn't done until that
checklist is.**

**Promotion: manual for now.**

1. Diff the overlay against the source of its upstream tag (`upstream` in the marker), so only the
   app's own changes travel.
2. Apply that diff onto a Genesis branch cut from the current staging batch.
3. Add a changeset for the package.
4. Open the Genesis PR into the batch.
5. Before adopting, reconcile migrations: if promotion renamed a migration the overlay's app already
   applied, or changed its SQL, `genesis migrate` can't match it and would copy it again. Map the
   app's applied migration to the package's by hand (until the lock mapping below ships), then run
   `genesis migrate --dry-run` with the release installed and check it copies nothing already applied.
6. After the release, delete the overlay, drop the override, and pin the released version.

Planned: `genesis upstream promote <package>` (steps 1 to 4) and `genesis upstream adopt
<package>@<version>` (steps 5 and 6, checking the release matches the overlay), and a `genesis.lock.json`
mapping so a migration an overlay's app already applied is never copied a second time.

### genesis add

`genesis add <block>` plans, prints the plan, asks (or `--yes`), then:

1. installs the block's `packages` (at the installed umbrella's pinned version, else this CLI's
   release) and `install` entries the app doesn't have, with the app's package manager
   (`--no-install` prints the command instead);
2. copies each migration into `supabase/migrations/` as a **new** file,
   `<timestamp>_<name>.sql`, timestamped after every migration already there, with a header naming
   the package, the file and the checksum of the package's text; and its pgTAP test into
   `supabase/tests/database/`;
3. copies its Edge Functions into `supabase/functions/<name>/` (and adds `verify_jwt = false` to
   `supabase/config.toml` when the manifest says so), its skills into `.claude/skills/<name>/`,
   and its AGENTS.md fragment between `<!-- genesis-block:<id>:start/end -->` markers;
4. writes a stub screen for each route an Expo Router app doesn't have yet (inside the app's one
   group for a signed-in route); other routers get a step;
5. adds the block's entry to the feature registry (`features.ts`) when the edit is unambiguous and
   still loads, or prints the snippet; then runs `features build`;
6. records the block and the files it owns in `genesis.lock.json`, and prints what is left by hand
   (secrets, plugin config, the privacy label).

It never overwrites a file the app has: one with other text is reported and left alone. A second
run creates and changes nothing. `--dry-run` prints the plan and writes nothing. `genesis add
--list` lists the blocks the app can add. `genesis studio init` is unchanged.

In an app whose database files live elsewhere ([A phone app beside a web app](#a-phone-app-beside-a-web-app)),
`add` copies none of the block's migrations, pgTAP tests, Edge Functions or `config.toml`
sections; a step says to run `genesis add <block>` in that app, unless its lock already lists it.

### genesis migrate

Compares the migrations of the app's blocks (`genesis.lock.json`, less any whose
`starter.config.ts` switch is off, plus `--block <id>`) in the
installed packages with the app's copies, and every copy that carries a header:

| State | Meaning | What happens |
| --- | --- | --- |
| `current` | the copy matches its package text | nothing |
| `new` | the package ships a migration the app hasn't copied | copied as a new file, after every existing one |
| `edited` | the copy no longer matches the text it was copied with | reported; never rewritten |
| `changed-upstream` | the package now ships different text than the copy was made from | reported; never rewritten |
| `differs` | a file with the migration's name, other text and no header | treated as the app's own; never rewritten |
| `deleted` | the app deleted a copy `genesis.lock.json` records (its `migrations` map: where each package migration was copied) | reported; never copied again |
| `provided` | not in the app, but a migration that is (or comes in the same run) provides its objects | never copied |

Every file already in `supabase/migrations` counts as applied: none is ever written again, and a
new file is created only if its name is free (otherwise it fails). A package migration is copied
only when nothing in the folder holds it yet, by header, by name or by text, so one a package
renumbered or moved is never copied twice. Line endings (CRLF or LF) don't count as a change. A
symlink in the folder stops the command. A pgTAP test is copied only with its migration, so one you
deleted stays deleted. `--forward` writes one forward migration stub
(`<timestamp>_<name>_forward.sql`, with a `genesis-forward` header) for each edited or changed
copy, holding the package's current text commented out, for you to turn into the change; later
runs count that copy as handled. It exits 1 when something still needs you (a deleted copy was your
choice, so it doesn't). `genesis add`, `genesis migrate` and `init --template native` record each
copy in the lock; a run on an older lock records the copies it finds.

A migration that creates or adopts another package migration's objects says so in its block
manifest, `provides` on the migration entry (package.json `genesis.blocks`):

```json
{
  "file": "migrations/0001_genesis_notifications.sql",
  "provides": [{ "package": "@marktiderman/genesis-supabase", "file": "migrations/0005_genesis_push.sql", "functions": ["functions/genesis-push-send"] }]
}
```

Once the providing migration is in the app (a copy, by its header or, made before headers, by
name; or the file the lock says it was copied to, while it's there), or is copied in the same run,
the provided one is `provided`, never `new`: notifications 0001 adopts the push tables of supabase
0005, and copying 0005 after it would fail on tables that already exist.

`provides` doesn't mean the provider creates everything: 0001 creates 0005's tables and its
register and forget functions, not the sender's (`genesis_push_targets`, `_status`,
`_tickets_record`, `_receipts_claim`/`_settle`, `_devices_forget`). `functions` names the Edge
Functions of the provided migration's package that call what only it creates: where it's provided
they're superseded, so `genesis add push` neither copies nor deploys `genesis-push-send`, and its
steps point at the notifications runner (`genesis-notifications`), which sends instead. Applying
0001 after 0005 works too (it adopts the tables); then stop calling `genesis-push-send`, as
notifications' steps say.

A migration that calls a hook the app defines (a function Genesis never ships) names it in
`needs`, with what to add:

```json
{
  "file": "migrations/0004_genesis_chat_tenants.sql",
  "needs": [{ "function": "private.genesis_viewer_people", "how": "add the tenancy hook before it (genesis-supabase 0016's header)" }]
}
```

When `genesis add`, `migrate` or `upgrade` would copy it into an app where no migration defines that
function (by `create [or replace] function`, in the app's migrations or one copied before it in
the same run, outside SQL comments), its row says `needs <function> first: <how>` and the
command warns, before `supabase db push` fails on it.

A migration another block's migration reads names that one in `runsBefore`:

```json
{
  "file": "migrations/0006_genesis_support_chat_tenants.sql",
  "runsBefore": [{ "package": "@marktiderman/genesis-chat", "file": "migrations/0004_genesis_chat_tenants.sql" }]
}
```

When both are new in the same `genesis add`, `migrate` or `upgrade` run, it is copied first (with
its own package's earlier migrations, which keep their order), so it gets the earlier timestamp.
When the other is already in the app, nothing moves: the migration has to handle that case itself.

In an app whose database files live elsewhere ([A phone app beside a web app](#a-phone-app-beside-a-web-app)),
migrate plans nothing and says where to run it.

With the notifications block and a named registry (`--notifications <file>`, or
`"notifications": { "registry": "src/notifications.ts" }` in `genesis.config.json`; a relative
path is resolved against the app's root, `--dir`), it also mirrors the app's `defineNotifications`
types: when they differ from the newest `*_genesis_notification_types.sql` (the JSON only, not its
header), it writes a new one after this run's other migrations. That migration adds and updates
types and never retires one: each is one branch's snapshot, and two branches merged would
otherwise retire each other's types. Retiring stays with `syncNotificationTypes` on deploy. The
types are in place once every migration has run, so a trigger that fires after the migrations
meets no unknown type before the deploy; a migration that queues a notification while it runs
needs its type added earlier in that migration.

Loading the registry runs the app's code, so it happens only when the registry is named, never on
`--dry-run` (reported as not checked), and the registry module must have no side effects on
import (no network, database or writes). A registry it can't find or load, or a timestamp that
doesn't fit, is a warning.

### genesis upgrade

1. Reads the release: `@marktiderman/genesis@<version>` (default `latest`) and its
   `versions.json`, as the [genesis-upgrade workflow](../../docs/APP-CI.md#genesis-upgrade) does,
   or `--manifest <file>`. The bump is the workflow's own code (`src/upgrade/bump-core.mjs`, which
   the workflow embeds): every Genesis dependency in every tracked package.json moves together,
   keeping its range prefix; `workspace:`, `file:` and other ranges are left alone, nothing is
   downgraded.
2. Runs a codemod only when a release declares a breaking change it fixes: the registry in
   `src/upgrade/codemods.ts` names the package and the first version that breaks, and a codemod
   runs when a package moves across it. A major move (or a 0.x minor) without one is listed with
   a link to its changelog (read from the Genesis repository) and the major changes in it, or a
   note that it lists none of its own and moved with its dependencies (a peer's break can still
   reach you). When the changelog can't be read, or doesn't reach that version, the link alone. A
   codemod covers a major only when it was declared for that major. `genesis codemod` lists them and `genesis codemod <id> [--dry-run]` runs
   one by hand, for an app that moved its versions some other way:

   | Codemod | Runs when | Changes |
   | --- | --- | --- |
   | `genesis-core-2-scope-names` | genesis-core crosses 2.0.0 | Genesis API usage only, never an app's own names that match (a view field means one inside `defineView(…)` or an object typed `ViewDefinition`/`ViewField`; the prop means an attribute of `<NativeResourceView>` or a key of an object typed `NativeResourceViewProps`; each with the name imported from Genesis): a view field's `timeZone: "practice"` → `"scope"`, NativeResourceView's `practiceTimeZone` (attribute or object key) → `scopeTimeZone`, `resolveZone("practice", …)` → `"scope"`, and DisplayTimeZones' `practice` (a `{ viewer, practice }` object's key, `.practice` on a value from `useDisplayTimeZones()` or typed `DisplayTimeZones`) → `scope`. `scope={{ practiceId }}` needs nothing (it is the app's own key in ResourceScope's open slot); when a file reads `scope.practiceId` and nothing declares it, the codemod prints the one-line `ResourceScope` augmentation that types it. The doctor's `removed-scope-name` rule finds what it would rewrite. |
   | `genesis-cli-eslint-config` | genesis-cli crosses 1.20.0 | An ESLint flat config (`eslint.config.{js,mjs,cjs,ts,mts,cts}`) that doesn't load [`@marktiderman/genesis-cli/eslint`](#lint-rules) yet: adds the import (`require` or `import`, as the file is written) and spreads `genesis("native")` (an app with `expo` or `react-native`) or `genesis("web")` last into the array it exports, or into the array or arguments of the `defineConfig(…)` / `tseslint.config(…)` call it exports. A native app gets `eslint-plugin-testing-library` in its devDependencies when it's missing. A config that already loads the export is left alone; one it can't edit safely (built in a variable or a function, or exported twice) is left as it is, and it prints the two lines to add. A config that still inlines the starter's RNTL rules gets the spread and a note to delete the old block. Started from an older CLI, the upgrade doesn't have this codemod (see "Upgrading the CLI itself" below); the doctor's `genesis-eslint-config` then reports the app, and `genesis codemod genesis-cli-eslint-config` runs it. |
   | `genesis-ui-native-3-8-composer-has-content` | genesis-ui-native crosses 3.8.0 | Inside each `<NativeComposerBar …>` tag: `empty={false}` → `hasContent`, `empty` and `empty={true}` → `hasContent={false}`, and `empty={expr}` → `hasContent={!(expr)}`. A spread can't be read, so its `empty` is left to the type error. |
   | `genesis-ui-overlays-fit-the-phone` | genesis-ui crosses 2.31.0 | The doctor's `ui/overlays-fit-the-phone`: in files that import genesis-ui, drops a `max-h-[…vh]` of 80 or more from `DialogContent`, `AlertDialogContent` and `SheetContent` when the tag has no other cap, no height of its own and isn't a bottom sheet, and moves anything else in `vh` to `dvh`. See [the migration guide](https://github.com/marktiderman/genesis/blob/main/docs/MIGRATION.md). |
   | `genesis-ui-native-haptics` | genesis-ui-native crosses 3.7.0 | The doctor's `haptics-use-genesis`: turns calls on `import * as Haptics from "expo-haptics"` into `playHaptic(Haptics, "light")`, and prints the files with calls it can't name. See [the migration guide](https://github.com/marktiderman/genesis/blob/main/docs/MIGRATION.md). |
3. Reinstalls. With pnpm, a release younger than the app's `minimumReleaseAge` is installed in
   loose mode and pnpm pins it in `minimumReleaseAgeExclude`, in the pnpm-workspace.yaml pnpm reads
   (the nearest one at or above the app, but never above the repository's top level, else beside
   the lockfile), one entry per version (`'@marktiderman/genesis-ui@2.26.0'`). pnpm 11.1.3's frozen
   install honours only the first entry for a package, so a second one (this upgrade's next to an
   earlier one's) fails `pnpm install --frozen-lockfile` in CI with
   `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`. The upgrade merges them into one entry per Genesis
   package that lists its exact versions (`'@marktiderman/genesis-features@0.8.0 || 0.8.1'`), which
   both a resolving and a frozen install honour on pnpm 11, and drops versions the lockfile beside
   it no longer holds, so the list doesn't grow (with `sharedWorkspaceLockfile: false`, or
   `shared-workspace-lockfile=false` in the `.npmrc`, it drops nothing). It never writes a pattern
   such as `'@marktiderman/genesis-*'`: that would let every future Genesis release, a compromised
   one included, skip the wait. The two that genesis-cli 1.17.3 wrote, `'@marktiderman/genesis-*'`
   and the bare `'@marktiderman/genesis'`, are replaced with the lockfile's exact versions. Any
   other pattern or bare name, and every other entry, comment and line, is left as it is, since the
   list is the app's supply-chain guard. A range the app wrote for a Genesis package
   (`'…genesis-ui@~2.25.0'`) takes the new pins into its entry with `||`, with a warning: pnpm 11
   rejects ranges there (`ERR_PNPM_INVALID_MINIMUM_RELEASE_AGE_EXCLUDE`). Exact versions and `||`
   need **pnpm 10.19 or later**; an older pnpm reads them as matching nothing, and the upgrade
   warns. Then it runs `pnpm dedupe` (`npm dedupe` with npm; bun
   and yarn are skipped), so a Genesis package isn't left installed at two versions
   (`duplicate-genesis-package`), and commits pnpm-workspace.yaml with `--pr`.

   With Bun, which has no dedupe, it edits `bun.lock` before the install instead: a nested copy
   of a Genesis package (`<parent>/@marktiderman/genesis-…` in `packages`) at another version
   than the root's goes when the root's version satisfies the parent's range, since Bun keeps it
   across installs otherwise; and an overlay the upgrade deleted leaves `workspaces` (in
   `bun.lock` and the root `package.json`), or `bun install` stops with "Workspace dependency not
   found". If the install leaves a nested copy behind, it's dropped and the install runs once
   more. The summary lists what went, and says to run `bun install` when the upgrade didn't. The
   binary `bun.lockb` isn't edited.

   With `minimumReleaseAge` set in the app, pnpm runs in strict mode instead: the install fails
   with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` before any tidy, and the upgrade stops and names the
   versions pnpm refused. It never loosens that setting for you: add those versions to
   `minimumReleaseAgeExclude` (exact versions, one entry per package), or wait until they are old
   enough, and run `genesis upgrade` again.

   Then it refreshes every file in `genesis.lock.json` from the newly installed package:
   unchanged in the app, it takes the new version; changed by both, it is merged with `git
   merge-file` against the old version (the base); a conflict goes to `<file>.genesis-next` and
   your file is kept. `--keep-mine` never merges: the new text goes to `.genesis-next`. A file you
   deleted stays deleted (mark its entry `"deleted": true` so the doctor's `lock-files` knows it's
   meant). A block whose `starter.config.ts` switch is off is left out: no migrations listed, no
   files refreshed or added. AGENTS.md fragments are replaced, skills a block gained are copied, and
   new package migrations are listed (run `genesis migrate`). In an app whose database files live
   elsewhere, nothing under `supabase/` is refreshed or added and no migrations are listed: the
   summary says to run `genesis upgrade` in that app.
4. Regenerates what comes from the installed packages, and the pull request carries it: the agent
   guide (`genesis agents`), when the app has it, and `features build`, when it has a registry.
   `--no-agents` and `--no-features-build` turn them off; a failure is a warning in the summary.
   And names each export the release added that the app builds by hand, with the swap to make,
   before the doctor's `shadowed-export` reports it. That swap isn't mechanical, so it's named and
   not made.
5. Runs `genesis doctor` and prints a summary (a changed file the repository ignores stays out of
   the `--pr` commit, and the summary names it); `--pr` commits to `genesis-upgrade/<version>`,
   pushes and opens a pull request with `gh`. It checks first, before writing anything, that the
   tree is clean, a branch is checked out and the branch name is free; it commits the lockfile
   (found up to the repository's root), never `.genesis-next` files. `--dry-run` changes nothing,
   and shows the refresh against the packages installed now.

It starts only with the app's dependencies installed, when it needs them: an app with owned files
merges your edits against the installed versions, so without them it stops, changes nothing and
gives the install command. (With no owned files, the upgrade's own install is enough, unless you
pass `--no-install` or `--dry-run` and the doctor is on.)

**An app in a sub-folder of its repository.** Set `"appFolder"` at the top of
`genesis.config.json` to the app's folder from the repository root:

```json
{ "appFolder": "mobile" }
```

- `.eas/workflows/*.yml` are written with their `paths` from the repository root (`mobile/src/**`,
  `mobile/app.json`), which is how EAS reads them. Otherwise that's an edit on every line of the
  list, which conflicts with each template change and leaves a `.genesis-next` each release. A
  lock with no `REPLACE_WITH_APP_FOLDER` substitution gets `src` as the code folder. Turning the
  setting on keeps the edits you have, but can't move them: a file with other edits and paths
  still from the app's folder merges with those paths as they were, and the summary warns and
  names them, to prefix by hand. A lockfile above the app stays an edit of yours, and an
  unprefixed line for it is right, so it's never named.
- `.github/workflows` is left to the repository: GitHub reads only the root's, a file that holds
  the rest of its CI too, so nothing is written, merged or left beside it. A template's change is
  named once in the summary (your copy passes `working-directory: mobile`; see docs/APP-CI.md),
  and the doctor's `lock-files` doesn't ask for the file here.

A conflict in a workflow in an app below its repository's root says to set it.

`--version <v>` is upgrade's own option: `genesis upgrade --version 2.30.0` upgrades to 2.30.0
(the CLI's own version is `genesis --version`, before any command). Since genesis-cli 1.18.0;
1.17.3 printed its own version instead.

**Upgrading the CLI itself.** The upgrade runs in the CLI that started it. It moves the app's
`@marktiderman/genesis-cli` dependency with the rest, but it doesn't restart in the new CLI: the
codemods, the owned-file refresh, the agent guide and the doctor of this run are the installed
CLI's, so a codemod the new release added doesn't run, and the new CLI's doctor can report
`agent-guide-stale` until you run `genesis agents`. To upgrade with the release's own CLI, start it
through npx:

```bash
npx @marktiderman/genesis-cli@latest upgrade --version <v>
```

The next `genesis upgrade` (and `genesis doctor`) in the app then runs the new CLI from its
dependencies.

`genesis.lock.json` is checked like a manifest, since anyone with commit access can edit it: each
entry may only write where its kind of source goes (a template to `eas.json`, `.eas/`, `.maestro/`
or `.github/workflows/`, a function file to `supabase/functions/<name>/`, a pgTAP test to
`supabase/tests/database/`, a skill to `.claude/skills/`), never a migration and never `.git`;
substitutions may only replace the starter's own names, each with a plain name, and
`REPLACE_WITH_APP_FOLDER`, with a plain relative folder (`src`, `apps/web`). A pgTAP test waits while its block has
new migrations to copy.

## Lint rules

Genesis's lint rules for apps ship with the CLI, as ESLint flat-config pieces from
`@marktiderman/genesis-cli/eslint` (for `require` and `import`). An app spreads them into its
`eslint.config.js` once, and every CLI release it installs brings new and changed rules, with no
edit to the config. They ship from the CLI rather than a package of their own because every
Genesis app, web or native, already has `@marktiderman/genesis-cli` in its devDependencies (the
[genesis-upgrade workflow](../../docs/APP-CI.md) needs it), so nothing new is installed.

```js
// eslint.config.js (CommonJS, as Expo writes it)
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const { genesis } = require("@marktiderman/genesis-cli/eslint");

module.exports = defineConfig([expoConfig, ...genesis("native")]);
```

In an ES module config: `import { genesis } from "@marktiderman/genesis-cli/eslint"`.

| Export | What it is |
| --- | --- |
| `genesis(platform, options?)` | Every Genesis piece for `"native"` or `"web"`. Spread this one, so pieces a release adds arrive too. `"native"` is `testing`; `"web"` is empty for now (Testing Library for React keeps `render` and `fireEvent` synchronous, so the RNTL await rules don't apply), and is there so web rules arrive when Genesis has some. |
| `testing(options?)` | React Native Testing Library 14's await rules, for test files (`TEST_FILES`: `**/__tests__/**` and `*.test.*`). RNTL 14 made `render`, `renderHook`, `fireEvent`, `act`, `rerender` and `unmount` async; left unawaited, a test reads the screen before React updated it. It turns on testing-library's `await-async-events` with `eventModule: ["fireEvent", "userEvent"]`, and a `no-restricted-syntax` rule for what the plugin has no rule for: `render`, `renderHook`, expo-router's `renderRouter`, the starter's `renderApp` and `act`; `rerender` and `unmount` as methods and destructured; and a chained `userEvent.setup().press(…)`. Each is flagged as a statement, a declaration or an assignment whose promise is dropped. |
| `rntlAwaitSelectors(options?)` | Those `no-restricted-syntax` entries, for an app that sets its own `no-restricted-syntax` on test files: a later setting of a rule replaces an earlier one, so spread these into yours. |

Options: `renders` (the app's own helpers that wrap `render`, checked like it:
`genesis("native", { renders: ["renderWithStore"] })`), `testFiles` (other test globs) and
`testingLibrary` (the plugin, when the config loads it itself).

`testing` needs `eslint-plugin-testing-library` (7 or later) in the app's devDependencies, an
optional peer dependency of the CLI. A flat config's plugins are objects, not names ESLint looks
up, so the piece loads the plugin itself when it's built (never on import): from the app (the
working directory, so it's the copy the app's own config would load), then from the CLI. When
it's missing, the config fails to load with a message saying to install it.

`genesis upgrade` adds the pieces to an app made before they shipped: the
`genesis-cli-eslint-config` codemod (see [genesis upgrade](#genesis-upgrade)) runs when the app's
CLI moves to 1.20.0. The doctor's `genesis-eslint-config` rule reports a native app still without
them, with the fix.

## Expo config plugin

`withGenesis()` keeps an Expo app's `app.config.ts` to a name, ids and plugins:

```ts
// app.config.ts
import type { ExpoConfig } from "expo/config";

export default (): ExpoConfig => ({
  name: "My App",
  slug: "my-app",
  scheme: "myapp",
  ios: { bundleIdentifier: "com.example.myapp" },
  android: { package: "com.example.myapp" },
  plugins: ["expo-router", "@marktiderman/genesis-cli"],
});
```

Install the CLI in the app (`pnpm add -D @marktiderman/genesis-cli`); Expo finds the plugin
through the package's `app.plugin.js`. To pass options, use `["@marktiderman/genesis-cli", { … }]`,
or call it yourself: `import { withGenesis } from "@marktiderman/genesis-cli/expo"`.

| Step | What it sets | Option to turn it off |
| --- | --- | --- |
| App variants | `APP_VARIANT` = `development` / `preview` / `production` (default) suffixes `ios.bundleIdentifier` and `android.package` with `.dev` / `.preview`, `name` with ` (Dev)` / ` (Preview)` and each `scheme` with `-dev` / `-preview`, so the three install side by side and a `scheme://` link opens the build it names (production keeps the base scheme). Any other value fails. A value that already ends in the suffix is left alone. Change the suffixes with `variants: { development: { id: ".debug", name: " (Debug)", scheme: "-debug" } }`. | pass `variant: "production"` |
| Links | `ios.associatedDomains` (`applinks:` and, unless `links.webcredentials` is `false`, `webcredentials:` per host) and one Android `intentFilters` entry with `autoVerify`, from the `links` block of `genesis.config.json`. | `links: false` |
| Privacy manifest | `ios.privacyManifests.NSPrivacyAccessedAPITypes` for the packages in `dependencies`: `@react-native-async-storage/async-storage` needs FileTimestamp, reason `C617.1` (what its own `PrivacyInfo.xcprivacy` declares). | `privacyManifest: false` |
| Export compliance | `ios.config.usesNonExemptEncryption = false`. | `exportCompliance: false` |
| Runtime version | `runtimeVersion: { policy: "fingerprint" }`. | `fingerprint: false` |

The app's own values always win: the plugin fills gaps and appends to lists, merges privacy
reasons into an entry the app already declares, never overwrites or removes anything, and
running it twice changes nothing.

### Setting APP_VARIANT

`APP_VARIANT` has to be the same wherever the config is evaluated for a build, not only in
`eas build`. `eas update` and EAS fingerprint checks evaluate the config too, and they don't read
the `env` of a build profile in `eas.json`. If an update is published without the variant, it is
built for the production ids and runtime, and preview and development builds never receive it.

Set it per EAS environment instead, so builds, updates and fingerprints all see it:

```bash
eas env:create --environment preview --name APP_VARIANT --value preview --visibility plaintext
eas env:create --environment development --name APP_VARIANT --value development --visibility plaintext
```

Point each build profile at its environment (`"preview": { "environment": "preview" }`), and
publish with `eas update --environment preview` (SDK 55 requires `--environment`). On SDK 54 or
earlier without EAS environments, set it on the command line every time:
`APP_VARIANT=preview eas update --branch preview`.

### Links

The `links` block in `genesis.config.json` is validated by the same loader the doctor uses, so a
bad block fails `genesis doctor` too:

```json
{
  "links": { "hosts": ["example.com", "app.example.com"], "paths": ["/invite", "/c"], "webcredentials": true }
}
```

`hosts` are bare lower-case host names (`*.example.com` allowed; no scheme, path or port);
`paths` are optional prefixes, each starting with `/`; `webcredentials` (default `true`) adds the
`webcredentials:` domains for password autofill. Set it to `false` if the site doesn't share
credentials with the app.

The web side has to list every variant you want links to open, because each variant is a
different app to Apple and Google:

- `/.well-known/apple-app-site-association`: one app id per variant, `TEAMID.com.example.myapp`,
  `TEAMID.com.example.myapp.dev` and `TEAMID.com.example.myapp.preview`, under `applinks` (in
  `details[].appIDs`) and, when `webcredentials` is on, under `webcredentials.apps`.
- `/.well-known/assetlinks.json`: one entry per package (`com.example.myapp`,
  `com.example.myapp.dev`, `com.example.myapp.preview`), each with that build's own signing
  certificate SHA-256 fingerprint (`eas credentials` shows it).

A variant the web files leave out installs fine, but its links open in the browser.

### Determinism

The plugin reads exactly two committed files in the project root, `genesis.config.json` and
`package.json`, and one environment variable, `APP_VARIANT`. It makes no network calls and reads
no clock or other environment, so for a given commit and `APP_VARIANT` it always gives the same
config. That makes the EAS fingerprint (`runtimeVersion` policy `fingerprint`) stable only when
`APP_VARIANT` is set the same way in every place the config is evaluated: builds, `eas update` and
fingerprint checks (see [Setting APP_VARIANT](#setting-app_variant)). Keep the rest of the config
in committed files too.

`@expo/config-plugins` and `@expo/config-types` are optional peer dependencies used for types
only; the plugin bundles neither and has no runtime dependency on them. Node 20.19 or 22.12+ is
needed (Expo `require()`s `app.plugin.js`, which is an ES module).

## Settings in comments

Put labels and widgets next to the schema, in table and column comments:

```sql
comment on table public.customers is
  'Customers of the business. @genesis {"label": "Customers", "labelField": "name"}';
comment on column public.customers.notes is
  'Private to staff. @genesis {"label": "Internal notes", "widget": "textarea"}';
```

The text before `@genesis` stays the description. Tables take `label`, `labelField`, `noun`,
`nounPlural` and `description` (strings). Columns take `label`, `description` and `widget`
(strings), plus `readonly` (true for a column only the server writes: a UI shows it read-only) and
`sensitive` (true to keep it out of lists, exports and previews unless a screen asks). Anything
else is an error that names the table or column. These settings are generator input only: the
checked-in file is what ships.

Each resource is emitted as its own `as const satisfies ResourceContract<Row>` constant (so a bad
setting, like an unknown `widget`, fails to compile), with a row type and a field-name union
(`PublicBrandsField`), and `contracts` collects them by `schema.table`.

## genesis doctor

`genesis doctor` checks that an app uses Genesis instead of working around it. Every built-in
rule is derived from what is installed, never from a list in the CLI: the components and
exports come from `@marktiderman/genesis-ui`'s type declarations (every subpath), the tokens
from the design system's theme stylesheets (`dist/themes/*.css`: `genesis.css` and the
Tailwind v4 bridge `genesis-tailwind4.css`), and the palette from the app's `tailwindcss/colors`.
Upgrading Genesis upgrades the checks.

| Option | |
| --- | --- |
| `--strict` | Fail on warnings too. `info` findings never fail. |
| `--verbose` | List the Genesis components no file imports, not only their count. |
| `--json` | Print `{ ok, genesis, errors, warnings, infos, findings, unused }`; each finding has its `level` (`error`, `warn` or `info`). Build output is captured, not streamed. |
| `--build` | After the checks, run `doctor.build` commands, or the app's `typecheck` then `build` scripts. A build that itself runs the doctor doesn't recurse. |
| `-c, --config <path>` | Config file. Default: `genesis.config.json`, then the `genesis` key of package.json. |
| `-d, --dir <dir>` | The app's folder (default: cwd). |
| `--print-genesis` | Print the components, tokens, raw tags, palette and companion packages' components read from Genesis, and exit. |
| `--base <ref>` | The git ref change checks compare against: the packages pack's change gate and the [ratchet](#the-ratchet) (`newOnly` rules report files unchanged since the merge base as `info`). |

Exit codes: `0` pass, `1` findings, `2` the doctor couldn't run (bad config, Genesis not installed or not built). With the app's dependencies not installed, the message gives the install command.

### Rules

| Rule | Level | What it flags |
| --- | --- | --- |
| `local-primitives` | error | A local primitive folder (`src/components/ui` by default; `localPrimitiveDirs`). |
| `starter-leftover` | warn | `components.json` or `src/lib/utils.ts` from a shadcn starter. |
| `forbidden-import` | error | `@radix-ui/*`, local `components/ui/*` (alias or relative), `@/lib/utils`, plus your `forbiddenImports`. |
| `raw-tag` | error | A raw JSX tag Genesis has a component for: any of `button input textarea select label table dialog progress details summary` with a same-named Genesis export, plus `hr` → `Separator`. JSX files only; `rawTags` adds or removes mappings. |
| `palette-color` | error | Tailwind palette utilities (`bg-red-500`, `hover:text-slate-700/50`, `text-white`). Use semantic tokens. |
| `arbitrary-color` | error | Arbitrary color values (`bg-[#f00]`, `text-[rgb(1,2,3)]`). |
| `raw-color` | error | Hex and `rgb()/hsl()` literals in code and CSS, via the same lexer as the repo's `check:token-usage` (comments, issue refs and `hsl(var(--x))` are fine). A brand file that defines token values needs an `allow` entry. |
| `undefined-token` | error | `var(--x)` where the theme doesn't define `--x`. Tokens declared in the app's CSS (or only `tokenFiles`) and inline style custom properties count as defined; `--tw-*` and `--radix-*` are ignored. |
| `shadowed-export` | error | An exported value named like a Genesis export (`export function Button`). Reuse or extend it. |
| `duplicate-genesis-package` | warn | More than one copy of a `@marktiderman/genesis-*` package that the app can load, with each copy's path, version and the ranges that asked for it. Found by resolving the app's dependency graph the way Node does, from each package's real folder (starting from the app's own `package.json`), so npm/yarn/bun hoisted and nested trees, pnpm's `.pnpm` store (in the app, or at the workspace root above a sub-app) and bun's isolated `.bun` store all count; a store entry nothing resolves to is ignored. Two copies are two module instances: a `DataProvider` from one is invisible to hooks from the other. A copy reached only through dev tooling (the app's `devDependencies`, or anything under `@marktiderman/genesis-cli`, wherever it's listed) is `[dev only]`: every path to it from the app runs through declared tooling (test runners, `@types/*`, linters and formatters, compilers and bundlers, Storybook, release tools, or the CLI). Other devDependencies count as runtime: a bundler ships what the app imports from them. When exactly one copy is reached from a declared runtime dependency and every other copy is dev-only, the finding is `info` (it can't split the app's contexts). Anything else warns, a copy reached through an undeclared hoisted package included. An app with no runtime dependencies at all (a bundled SPA listing everything in `devDependencies`) has its devDependencies taken as runtime. A copy that only walking up the folders finds is left out: in an app with its own install inside another app's folder (a lockfile of its own, like `apps/mobile`), a peer dependency the app doesn't declare or install is unmet rather than met by the parent's copy, and the parent's CLI isn't followed unless the app declares it. A regular dependency that resolves up to the parent still counts. |
| `peer-range-mismatch` | warn | An installed Genesis package's `peerDependencies` range on another Genesis package that the copy it resolves (looked up from its own folder, as Node does) doesn't satisfy: the package, the range and the installed version. Missing peers and non-semver ranges (`workspace:*`) are skipped. Ranges are read with npm's grammar (`^ ~ x - ||`, prereleases only when the range names one). A mismatch inside a dev-only copy (the CLI's own tree) is `info`. |
| `hand-rolled-sub-nav` | warn | A route under the layout that renders `AppShell` that switches its sections with its own page-level `<TabsList>` or `<SubNavTabs>`, when the installed Genesis has `useAppShellSubNav`. Tabs inside a card, dialog, sheet, popover, accordion, panel, table or another tab's content are fine, as are pages that call the hook. Use `useAppShellSubNav(items, { mode: "tabs" })`, `AppShellPageHeader` and `AppShellSubNavEnd` from `@marktiderman/genesis-ui/layout` ([sub-navigation](../ui/SKILL.md)). |
| `local-genesis-copy` | warn | An app component definition named like a component of `uiPackage` or of `componentPackages` (forms-studio's `ResourceHeader`, `SettingsSection`, `ResourceSettingsPage`, `HeadlineNumbers`, `SummaryCard`, `ShareDialog`, …): "Genesis already has X". A definition renders JSX, isn't in a file that imports the Genesis one, and is exported or lives outside the routes folder; a route's own non-exported functions and anything passed as `component` / `errorComponent` / `pendingComponent` / `notFoundComponent` (TanStack's `FormError`) are not copies. An exported genesis-ui value is `shadowed-export` instead; `const X = lazy(() => import("@marktiderman/genesis-…"))` is fine. |
| `resource-workspace` | info | In a routes folder where a detail page (`courses.$courseId.tsx`, `[id]/page.tsx`) renders `AppShellPageHeader`, directly or through one local import, the other detail pages there that don't: one workspace header and tab row for every resource. Reported, never failing (`--strict` included); `rules` can raise it to `warn`. |
| `page-layout` | warn | A route inside the AppShell (under the layout route that renders it) that renders no Genesis page layout (the `…Page` / `…PageShell` components `uiPackage` and `componentPackages` export, not `BreadcrumbPage`) itself, through one local import, or from a layout route around it (`my/route.tsx` supplying `DetailPage` covers `my/index.tsx`). A `…Page`, `…Screen` or `…Workspace` imported from any Genesis package counts. Routes outside the shell (sign-in, landing, public forms) aren't checked until Genesis ships layouts for them. Layout-only (`route.tsx`, `__root`, `<Outlet>`) and redirect-only routes are skipped; off with the `native` pack (see `native-screen-layout`). |
| `core/views-stay-platform-neutral` | warn | Declared by genesis-core (see [Package rules](#package-rules)). A `*.view.ts` file (a view description web and native share) that imports a platform module: a router (`react-router*`, `@tanstack/react-router`, `@tanstack/react-start`, `next`, `expo-router`), `react-dom`, `react-native` or `react-native-*`, `expo*`, icon sets (`lucide-react`, `lucide-react-native`), or Genesis UI (`genesis-ui`, `genesis-ui-native`, `genesis-native`). Direct imports only: keep what the view imports platform-neutral too. |
| `iso-date-slice` | warn | A day cut from an ISO timestamp: `.toISOString().slice(0, 10)`, `.substring(0, 10)`, `.substr(0, 10)`, `.split("T")[0]` or `.split("T").at(0)`. That's the day in UTC, which for an evening in the Americas is already tomorrow. Use `personDay(person)` or `dayIn(zone)` from `@marktiderman/genesis-core/dates`. Test files are skipped; where UTC is what you mean (a log name, a UTC report), allow it with a reason. |
| `resource-view-tree` | error | A `<ResourceView>` or `<ResourcePage>` with `tree` and `pagination="server"` or `"cursor"` (bare or in braces). A tree is built from every row on the client, so the screen throws when it renders. Leave `pagination` unset. Only the tag's own attributes count, not a `tree` inside an expression. ([Tree mode](../../docs/RESOURCE-VIEW.md#tree-mode)) |
| `studio-server-auth-import` | warn | An import of a studio-server file the package doesn't export (`@marktiderman/genesis-studio-server/dist/…`, `/src/…`, `/lib/…`), or a CommonJS `require("@marktiderman/genesis-studio-server")` of the ESM-only root. Besides the doctor's scan it reads the app's `.cjs` and `.mjs` files (tests skipped), where a `require` usually is. Both fail at run time with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Use `@marktiderman/genesis-studio-server/auth`: the token checks and `switchToUser`, for `import` and `require`. An ESM import of the root is fine. |
| `removed-scope-name` | error | A "practice" name genesis-core 2 removed, in a file that imports a Genesis package: a view field's `timeZone: "practice"` (a string value in a view definition), NativeResourceView's `practiceTimeZone`, `resolveZone("practice", …)`, or DisplayTimeZones' `practice`. `defineView` refuses the first when the view loads and the rest are type errors; this lists them in CI. `genesis codemod genesis-core-2-scope-names` rewrites every one. It reads only Genesis API usage, the same shapes the codemod rewrites (see its row above); comments and an app's own `practice` settings, props and `resolveZone` are skipped. |
| `deprecated-import` | warn | A named import of a Genesis export tagged `@deprecated` (or `@stability Deprecated`) in its published declarations. It goes at the next major; the message carries the tag's advice. Ratcheted by default: under `--base`, files that didn't change report it as `info`, so an upgrade never fails strict CI on untouched files. |
| `beta-import` | info | A named import of an export tagged `@stability Beta` or `Experimental`, which may still change in a minor. Info by default since most of Genesis is beta; set it to `warn` in `rules` to see it in CI. |
| `figma-routes` | info | Runs only when genesis.config.json has a `figma` block: [genesis figma:routes](#genesis-figmaroutes) as findings. A configured page the file doesn't have, a route with no frame, navigation with no hotspot and a `// figma:` id that isn't the route's frame are `info`, `warn` under `--strict`; frames with no route, hotspots to them and navigation that isn't a string literal are always `info`, by design. Never `error`. Invalid JSON or a bad `figma` block in genesis.config.json is one `warn` naming the file. Without `FIGMA_ACCESS_TOKEN`, or when the API can't be read or doesn't answer within 30 seconds, one `info` notice. The Vite plugin and `genesis upgrade` skip it (it reads the network). |
| `scope-practice-id` | info | `scope.practiceId` read with no `ResourceScope` augmentation in the app (declaration files included). It still works, as the app's own key in the open slot, but reads as `unknown`; the message gives the one-line augmentation. Never fails, `--strict` included. |
| `stale-exception` | warn | An `allow` entry that no longer matches anything, or a `packageRules` entry that names no rule an installed package declares (a typo there would change nothing). An id in the namespace of a package with a `plugin` isn't checked, since a plugin's ids aren't known until it reports. |
| `package-rules-invalid` | warn | An installed or local package's `genesis.doctor` declaration (or its plugin) that doesn't validate: its rules don't run; the rest of the doctor does. Read forward-compatibly, since a package can be newer than the CLI: an unknown key is ignored, and a `prefer` rule or primitive that doesn't validate is skipped on its own, each with this warning. An unknown key on a `prefer` rule itself or in its `unless` could narrow where it applies, so that rule is skipped whole rather than run wider; an unknown key in `forbid` is only dropped. It is never an error, so a package upgrade can't break an app's build. See [Package rules](#package-rules). |
| `package-rule-override` | warn | `rules` changes a package rule's level without a reason; move it to `packageRules` with one. |
| `agent-guide-stale` | warn | The agent guide `genesis agents` wrote (`.claude/skills/genesis/SKILL.md` and the `genesis-primitives` block in AGENTS.md) doesn't match the installed packages, one of the two is missing, or the block's markers are broken (one missing, repeated or out of order; `genesis agents` then writes nothing). An app with neither isn't checked. Line endings don't count. |
| `database-elsewhere` | warn | An app whose `genesis.config.json` `supabase` setting puts its database files in another app (`{ "app": "../app" }`) or nowhere (`false`): **warn** when the named app has no `supabase/` folder, and when this app still has one (`add`, `migrate` and `upgrade` never plan it, so it's a second, unused copy). The supabase pack doesn't run in such an app. |
| `genesis-eslint-config` | warn | A native app (with `expo` or `react-native`, or the `native` pack) whose ESLint flat config doesn't load [`@marktiderman/genesis-cli/eslint`](#lint-rules), so `genesis upgrade` can't bring Genesis's lint rules; or loads it without `eslint-plugin-testing-library` in package.json, so the config can't load. The message gives the fix: `genesis codemod genesis-cli-eslint-config`, or the two lines to add. Web apps (Genesis has no web lint rules yet) and apps without a flat config aren't checked. Ratcheted by default: under `--base`, an unchanged config reports it as `info`. |
| `lock-files` | warn / info | `genesis.lock.json` against the files on disk. **warn**: a file the lock owns is missing; `genesis upgrade` never brings a deleted owned file back, so a lock naming files that aren't there passes every upgrade silently. A file you deleted on purpose gets `"deleted": true` in its lock entry: the warning stops and upgrade still leaves it deleted. **info**: a locked file whose checksum differs from the lock's (an app edit, which upgrade three-way merges the next version into, or one waiting on its `.genesis-next`); a file marked deleted that is back; a locked block whose `starter.config.ts` switch is off (upgrade and migrate leave it out, and its files aren't checked); files under `supabase/` the lock still lists in an app whose database lives elsewhere (upgrade leaves them alone, so delete the entries). Also `bun.lock` (at or above the app, with or without `genesis.lock.json`), **warn**: a nested copy of a Genesis package at another version than the root's, when the root's version satisfies the range of the package it's nested under. Bun keeps it across installs, so the app runs two copies; the finding names the entry to delete, then reinstall (`genesis upgrade` does both). |
| `ratchet-skipped` | warn / error | `--base` was given, but git couldn't compare (not a repository, or the ref isn't fetched). A warning when only the ratchet was skipped (every rule ran at its full level); an error when the config file holds `allow`, `rules` or `packageRules`, which then went uncompared. In CI, check out with `fetch-depth: 0`. |
| `allow-grew` | error | Under `--base`: an `allow` entry (its rule, file and match) that the doctor settings at the merge base didn't have. The list only shrinks. Rewording a `reason` is fine. The base's settings are found as the doctor finds them (genesis.config.json's `doctor`, else package.json's `genesis.doctor`), so moving them between the two compares as usual; when the base had none (adopting the doctor), nothing is compared. |
| `rules-weakened` | error | Under `--base`, comparing the app's settings with the base's only (never with a rule's own level, which a package upgrade may change): a rule the base's `rules` or `packageRules` set that this branch sets lower, a rule newly set to `off`, or an `exclude` glob a `packageRules` entry gained. A new entry at any other level isn't compared, so pinning a rule its package raised is fine; an entry renamed with its rule counts as new. `files` isn't compared. Not compared when the base had no doctor settings. |

It also prints **Available but unused**: how many Genesis components no file imports (`--verbose`
lists them, `--json` always does), and a **Primitives** line: how many rules the installed packages declare (`genesis catalog` lists
them). Check both before building something.

The route rules (`hand-rolled-sub-nav`, `resource-workspace`, `page-layout`) read the routes
folder (`routesDir`, default the first of `src/routes`, `src/app`, `app`, `src/pages`, `pages`).
**TanStack Router**: flat `a.$id.tsx` or folders, `route.tsx` layouts, `__root.tsx`, `-private`
files skipped, a trailing `_` un-nesting a segment, and `posts.lazy.tsx` paired with `posts.tsx`
as one route (findings point at the lazy file, which holds the component). **Next.js `app/`**
(chosen when the folder has `page` / `layout` files and no `__root`): `layout.tsx` around
`page.tsx`, `[id]` params, `(group)` and `@slot` folders dropped from the path; private
`_folders` and the special files (`error`, `global-error`, `loading`, `not-found`, `template`,
`default`, `route` handlers, metadata files) aren't routes. **Next.js `pages/`**: `_app` is the
layout; `_document`, `_error`, `404`, `500` and `api/` aren't pages.

A route whose component is imported (`component: CoursesPage`, `export { default } from …`)
renders; only a route that renders nothing but `<Navigate>` / `<Redirect>` / `<Outlet>` (or no
component) is redirect-only. A route is a layout when it is a layout file, a pathless `_layout`
route, or renders an `<Outlet>` itself or in the component it imports. `__root` and Next's
`layout` files are pure layouts, as is a pathless route or one whose only markup around the
`<Outlet>` is a wrapper (`<div className="space-y-4"><Outlet /></div>`); a route with content of
its own beside the outlet (text, a heading, a list or table), `posts/route.tsx` included, is a page
too, and `page-layout` and `hand-rolled-sub-nav` check it. Next's `(group)` and `@slot` folders
aren't URL segments, but a group's layout wraps only the routes in that group.

What a route renders is followed through the app's modules up to six deep: the imports of the
components it renders (or names as `component:`), `lazy(() => import(…))` /
`lazyRouteComponent(…)`, re-exports and barrels, through relative paths, tsconfig/jsconfig
`paths` and `baseUrl` (following `extends`, to a file or a package's config), package.json
`imports` and the `@/`, `~/`, `#/` defaults. Imports it only calls (data helpers, hooks) aren't
followed, and an `import(…)` inside a string, comment, template or regex literal isn't one (the
tokenizer reads regex literals and JSX text such as `Rock 'n roll`; a file it can't read for sure
is treated as unknown). An import that is neither an
app file nor an installed or declared package makes that route unsure, and the route rules don't
report it; it never makes a route a layout. Past six modules the trail stops as a one-hop check
would: the route is reported.

`hand-rolled-sub-nav` and `page-layout` are warnings (failures under `--strict`) and
`resource-workspace` is `info`. Opt out with `rules`
(`{ "page-layout": "off" }`) or a justified `allow` entry for one file:

```json
{ "rule": "hand-rolled-sub-nav", "file": "src/routes/_shell/onboarding.tsx", "reason": "A wizard's steps, not sections." }
```

Scanned by default: `src/**/*.{ts,tsx,js,jsx,mts,cts,css}`, skipping tests, `__fixtures__`,
`__mocks__`, `*.d.ts` and `*.gen.*`. Comments are ignored by every rule.

### Rule packs

Three packs are opt-in, so a web app is unaffected until it lists them. Turn them on explicitly
(they are not auto-detected, so adding `expo` or a `supabase/` folder never changes a build's
result on its own):

```json
{
  "doctor": {
    "packs": ["native", "supabase"],
    "native": { "routerRoot": "app" },
    "supabase": { "migrations": "supabase/migrations", "base": "origin/main", "exposedSchemas": ["public"], "since": "20260101000000" }
  }
}
```

Pack rule ids are built-in ids, so `rules` and `allow` work on them as on any other rule.
Folder settings (`routerRoot`, `migrations`) are app-relative: `./app/` is read as `app`, and
an absolute path or one leaving the app is a config error. `exposedSchemas` compares lowercased.

**`native`**, for Expo apps on `@marktiderman/genesis-ui-native`. With the pack on, the core
rules read the native package (unless `uiPackage` says otherwise) and the default scan is
`app`, `src` and `components`. The screen layouts are every component the installed native
package exports whose name ends in `Page`, `Screen` or `ScreenContainer` (`ScreenContainer`,
`SettingsPage`, `SettingsSubPage`, `NotificationsPage`, `AuthScreen`, `NativeResourcePage`, …),
so a new layout is recognized when Genesis ships it.

With the native pack on, every hex or `rgb()` literal in a script file is reported as
`native-literal-color` instead of `raw-color`, web files in a mixed repo included. Existing
`rules` and `allow` entries for `raw-color` that cover script files need the new id (CSS files
keep `raw-color`).

| Rule | Level | What it flags |
| --- | --- | --- |
| `native-raw-primitive` | error | A React Native primitive Genesis wraps, used from `react-native` (`Modal`, `ActivityIndicator`, which points to `NativeLoadingState`; the list in the repo's `scripts/lib/native-primitives.mjs`, shared with `check:forbidden-imports`): named and aliased imports (multi-line too), `import * as RN` then `RN.Modal`, `require("react-native").Modal`, destructured `require`, and `export { Modal } from "react-native"`. Type-only imports are fine. The message names the replacements the installed package exports. |
| `native-literal-color` | error | Hex and `rgb()/hsl()` literals in native code (the same lexer as `raw-color`, which it replaces for script files). Use a theme role (`useThemeRoles()`), a token className or `PlatformColor(...)`. |
| `native-custom-header` | warn | A file that sets `headerShown: false` and draws its own header (a `<…Header>` of the app's own, or `style={styles.header}`); a screen that draws one when the `_layout` beside it hides the navigator's; a hand-built tab bar (`tabBar={…}` in a file with `<Tabs>`, or a `<…TabBar>` of the app's own). Section headers (`SectionHeader`, `ListHeader`, `CardHeader`, …) and Genesis components don't count. Only the `_layout` in the screen's own folder is followed, not ancestors. |
| `native-screen-layout` | warn | A route screen under the router root (`native.routerRoot`, default `src/app`, else `app`) that renders no Genesis screen layout, directly or through one local import (`./`, `../`, `@/`, `~/`). `_layout`, `+html`, `+native-intent`, `+middleware`, `+api` files, re-export-only routes and `<Redirect>` routes are skipped. Also a warning when the router root is missing, or when `src` leaves it unscanned. |
| `store-readiness` | warn | Static checks of `app.json`, `app.config.json` and (as text, best-effort) `app.config.{ts,js,mjs,cjs}`. **Usage strings**: Expo applies an installed module's config plugin even when it isn't listed, with a generic default string (`Allow $(PRODUCT_NAME) to access your camera`), and App Review rejects generic purpose strings; so a module without its own sentence (`ios.infoPlist.<Key>` or the plugin option) is flagged, and `false` (Expo's opt-out) counts as set. Covered: `expo-camera`, `expo-image-picker` (photos; camera only "if the app takes photos"), `expo-media-library`, `expo-location`, `expo-av` / `expo-audio` (microphone "if the app records audio"), `expo-contacts`, `expo-local-authentication` (Face ID). **Sign in with Apple**: third-party sign-in (`@react-native-google-signin/google-signin`, `react-native-fbsdk-next`, or a Supabase `signInWithOAuth` / `signInWithIdToken` with a non-Apple provider) without Apple sign-in (`expo-apple-authentication`, or Supabase's `apple` provider). Guideline 4.8 accepts any equivalent privacy-focused login, so this is a warning to `allow` with the reason when another option qualifies; `expo-auth-session` alone doesn't trigger it (it serves non-login OAuth too). Also the export-compliance flag (`ios.config.usesNonExemptEncryption` or `ITSAppUsesNonExemptEncryption`), `ios.privacyManifests`, and a missing Expo config. Those two count as set when the [Expo config plugin](#expo-config-plugin) (`@marktiderman/genesis-cli` in `plugins`) will set them: export compliance unless `exportCompliance: false`, the privacy manifest unless `privacyManifest: false` and only when a dependency needs one. |
| `eas-placeholder` | warn | A `REPLACE_WITH_…` placeholder from the EAS templates still in `eas.json` or `.eas/workflows/*.yml` (YAML comment lines aren't read), each with what replaces it: the store ids in `eas.json` `submit.production` (the App Store Connect Apple ID, the Apple Team ID, the Google Play service account key's path), or `REPLACE_WITH_APP_FOLDER` in `pr-preview.yml`'s `paths`, which otherwise matches nothing, so code changes never start a preview. `genesis init --template native` fills the app folder in (`src`). |

**`supabase`**, for `supabase/migrations/*.sql` (`supabase.migrations`). The SQL is read
statement by statement with comments removed and string (`'…'`, `E'…'`) and dollar-quoted
bodies blanked, so text inside a function body never matches; the one exception is below.

| Rule | Level | What it flags |
| --- | --- | --- |
| `migration-grants` | error / warn | In new migrations: `grant … on all functions in schema …` and `alter default privileges … grant … on functions` to `anon` or `public` (error) or `authenticated` (warn: it re-grants functions revoked from signed-in users); other roles (`service_role`, `postgres`) are fine. A function outside `exposedSchemas` granted to `anon` or `public` by name, and `grant usage on schema <unexposed> to anon/public` (error). A grant built as a string for `execute` in a body (`execute format('grant … to anon', f)` in a loop) to `anon`, `public` or a computed role (warn: what it grants can't be read). Revokes, `revoke grant option for`, argument types and `granted by` are read correctly. Grant by name so an earlier revoke survives. |
| `migration-rls` | error | A table in an exposed schema whose row level security is off once every migration has run: never enabled, or disabled later. Renames (`alter table … rename to`, `set schema`) and drops are followed. RLS enabled by dynamic SQL (a `do $$ … execute format('alter table %I enable row level security', t) … $$` loop) can't be traced, so such a block counts as enabling it for every table created before it. |
| `migration-definer-search-path` | error | A `security definer` function or procedure without `set search_path`. Functions are keyed by name and argument types, so overloads are separate; `alter function … security definer` makes one definer, `alter function … set search_path` fixes it, and renames, replaces and drops are followed. |
| `migration-edited` | error | A `.sql` migration that already exists at the merge base with `supabase.base` (default `origin/main`) was modified, deleted or renamed. Applied migrations are never edited; add a new one. Skipped outside a git repo; a **warn** when the base ref isn't available. |
| `migration-testing-kit` | error | A migration that uses `genesis_testing`, genesis-supabase's pgTAP kit for test databases only (it signs in as anyone and resets roles). Keep it in `supabase/tests/database/000_genesis_testing.test.sql`. |
| `contracts-stale` | error | With `doctor.contracts` (`{ out, schemas, databaseEnv }`, defaults `resources.genesis.ts`, the schemas the contract's own `// Source: Postgres (…)` line names (else `["public"]`), `DATABASE_URL`): the contract on disk isn't what `genesis introspect` would write from the database now (the same comparison as `introspect --check`). Without the environment variable it reports one `info` ("not checked") and never fails; a database it can't read is a warning, and a contract it can't generate (an invalid `labelField`, two tables with one name) is an error. The advice names the schemas and, when it isn't `DATABASE_URL`, `--database-env`. A contract whose `// Source:` line isn't Postgres (one written with `--openapi`) is reported as `info` ("not checked"); check it with `genesis introspect --openapi … --check`. Line endings don't count. The Vite plugin skips it in builds and the dev server, so a build never reads a live database: run it with `genesis doctor` in CI. |
| `migration-view-rls` | error | A view in an exposed schema that runs as its owner once every migration has run: created without `with (security_invoker = true)`, replaced without it, or reset by `alter view … reset (security_invoker)`. A plain view reads past row level security on every table it selects from. `alter view … set (security_invoker = true)`, renames and drops are followed. A view that runs as its owner on purpose (it filters rows itself) takes an `allow` entry: `{ "rule": "migration-view-rls", "match": "public.profile_cards", "reason": "…" }`. |

**Which migrations are new.** In a git repo with the base ref, a migration is new when it was
added, modified or is untracked since the merge base. `since` (a file name or timestamp prefix)
also trusts every file that sorts before it. Without git or the base ref (a shallow CI clone, a
Vercel build), `migration-grants` is skipped with a warning unless `since` is set, so applied
migrations never fail a build. In CI, check out with full history and fetch the base:

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }
- run: git fetch origin main
```

**`packages`**, for the app's [local packages](#local-packages). Each one is held to a
Genesis package's standard. The change rules compare against a base ref, given as
`genesis doctor --base origin/main` (or `doctor.packages.base`). Without one, or when git
can't compare, they report a single info finding ("change gate skipped") and never fail:

```json
{ "localPackages": ["packages/*"], "doctor": { "packs": ["packages"] } }
```

```bash
genesis doctor --strict --base origin/main
```

A file whose literals can't be parsed for sure is skipped, and type-only imports never count
as dependencies.

| Rule | Level | What it flags |
| --- | --- | --- |
| `package-app-import` | error | A package importing the app's own code: `@/…`, `~/…`, a relative path that leaves the package, or an alias (the package's own tsconfig `paths`) that points outside it. package.json `#imports` and aliases that stay inside the package are its own files. |
| `package-undeclared-dependency` | error | A bare import whose package isn't in the package's `dependencies`, `peerDependencies`, `devDependencies` or `optionalDependencies` (`workspace:` ranges count). Node built-ins and type-only imports (multi-line too) are fine. |
| `package-export-missing` | error | An `exports` target that doesn't exist. Build output (`./dist/…`, `./build/…`) and patterns are left alone. |
| `package-block-invalid` | error | A `genesis.blocks` declaration that isn't a valid block manifest. |
| `package-migration-test` | error | A migration without a pgTAP test: a block migration with no `test` (or a missing one), or any `migrations/NNNN_name.sql` without `migrations/tests/NNNN_name.test.sql`. |
| `package-migration-number` | error | Two migrations in one package with the same `NNNN_` number. |
| `package-untagged-tests` | warn | A package whose tests name no feature (`@feat:<id>`). |
| `package-doctor-declaration` | error | A published (not `private`) `@marktiderman/genesis-*` package with no `genesis.doctor` declaration, or one that doesn't validate. Declare the rules it enforces, or `{ "enforce": false, "reason": "…" }`. |
| `package-unregistered` | warn | No feature in `features.json` lists the package's folder in `links.code`. |
| `package-migration-edited` | warn | With a base ref: a package migration that existed at the merge base and was changed, deleted or renamed. |
| `package-unversioned-change` | warn | With a base ref: files in the package changed but neither a higher `version` nor a new changeset naming it in its front matter did; a changeset without a `Features:` line; or blocks or exports changed without a change to `features.ts`. Run CI with `--strict` so these fail. |

Symlinks inside a package aren't followed, and a `packages/*` folder without a usable package.json (or a name) is skipped. `localPackages` entries may climb out of the app (`../../packages/*`) as long as they stay in its repository.

Every other rule also scans local packages' source, as it does the app's.

### Package rules

Every Genesis package declares what it enforces in its own package.json, under
`genesis.doctor`, and the doctor finds every installed `@marktiderman/genesis-*` package (and
every [local package](#local-packages)) and runs their rules. An app needs no config for them:
installing or upgrading a package brings its rules. Rule ids are namespaced by package
(`ui/lists-use-resource-view` for genesis-ui, `@acme/kit/<id>` for a local package), and `rules`,
`allow`, `ratchet` and `stale-exception` treat them like built-ins.

A declaration has **`prefer` rules** ("use X instead of Y") and optional **`primitives`**
(catalog rows with no rule), and may name a **`plugin`** module for checks that need code:

```json
{
  "name": "@marktiderman/genesis-widgets",
  "genesis": {
    "doctor": {
      "prefer": [
        {
          "id": "lists-use-widget-view",
          "need": "a list screen",
          "level": "warn",
          "platform": "web",
          "files": ["**/*.tsx"],
          "exclude": ["**/*.server.*"],
          "forbid": { "jsx": ["DataTable"], "imports": ["legacy-grid", "@legacy/*"], "pattern": "\\bfetchRows\\(" },
          "unless": { "renders": ["WidgetView"] },
          "use": "<WidgetView>",
          "import": "@marktiderman/genesis-widgets",
          "docs": "https://…/WIDGETS.md",
          "why": "One description per list.",
          "newOnly": false
        }
      ],
      "catalog": [{ "need": "dates", "use": "dayIn(zone)", "import": "@marktiderman/genesis-widgets/dates" }],
      "plugin": "./dist/doctor-rules.js"
    }
  }
}
```

`catalog` was called `primitives`; the old key is still read until the next major (not both at
once). A package that must stay readable by a genesis-cli before this release keeps `primitives`.

| Key | |
| --- | --- |
| `id` | Lower-case words and dashes; namespaced by the doctor. |
| `need` | The need it answers, for `genesis catalog` and the agent guide. |
| `level` | `error`, `warn` (default) or `info`. |
| `platform` | `web` (off with the `native` pack) or `native` (only with it). Default both. |
| `files`, `exclude` | App-relative globs. `{routes}` is the routes folder (`routesDir`). Default: every scanned script file. |
| `forbid` | `jsx` element names (type arguments too: `<ResourcePage<T>`), `imports` (exact, or `prefix*`), and/or a `pattern` regular expression (every match is reported; `(?i)` for case-insensitive). Comments never count. |
| `unless` | A file is left alone when it `renders` one of these elements (it builds on the primitive) or matches `pattern`. |
| `use`, `import`, `docs`, `why` | The message: what to use, where from, why, and the link. `use` and `why` are required. |
| `newOnly` | Ratchet: under `--base`, findings in unchanged files drop to `info`. |

A forbidden element counts one level up too: an app component that renders it (`RecordTable`
around `DataTable`) is flagged in its own file, and so is every screen that renders the
wrapper. A package's rules never run on the package's own files.

A package with nothing to enforce says so, with a reason, and may still list primitives:
`"doctor": { "enforce": false, "reason": "Development tooling, not app screens." }`. In the
`packages` pack, `package-doctor-declaration` fails a published Genesis package that declares
neither, so a new package can't skip this step. `"doctor": "./doctor.json"` points at a file in
the package (list it in `files`) holding the same object. A `plugin` module is loaded like an
app plugin; its findings are namespaced like the package's other rules.

**Adding rules to a new package:** add `genesis.doctor` to its package.json, run its tests (the
genesis-cli suite validates every package's declaration), and add a changeset. Apps get the
rules when they install the release.

**In the app**, switch a package rule off, change its level or its files with a reason, never
silently. `rules` works too, but warns (`package-rule-override`) until the reason is recorded:

```json
{
  "doctor": {
    "packageRules": {
      "core/direct-data-access": { "files": ["src/**/*.tsx", "src/lib/**/*.ts"], "exclude": ["src/lib/server/**"], "reason": "Our data functions live in src/lib; check them too." },
      "ui/records-use-record-view": { "level": "off", "reason": "Every record screen is a builder." }
    },
    "allow": [{ "rule": "ui/lists-use-resource-view", "file": "src/components/data/RecordTable.tsx", "reason": "The legacy wrapper; it goes when the last screen moves." }]
  }
}
```

**The catalog.** `genesis catalog` (`--json` for data; `genesis primitives` is its deprecated name) prints, for each need, what to use,
its import, the rule that enforces it and the docs: a short static core plus every installed
package's declarations. `genesis agents` writes the same catalog as
`.claude/skills/genesis/SKILL.md` and a `<!-- genesis-primitives:start -->` block in the app's
AGENTS.md (the rest of the file is the app's), telling agents to use the primitives first, never
copy an older screen, and write a gap up for Genesis before inventing. `genesis agents --check`
writes nothing and fails when either is out of date, and the doctor's `agent-guide-stale` warns.
Both commands, and `genesis catalog`, exit 1 when a package's declaration doesn't validate,
since the catalog would leave it out. Run `genesis agents` after each Genesis upgrade.

### The ratchet

`newOnly` rules (package rules and app patterns can declare it), and any rule the app lists in
`doctor.ratchet` (`true` for all), apply in full only to new and changed code: with
`--base <ref>`, a finding in a file unchanged since the merge base is reported as `info`, with
"ratcheted" in its message. Changed means committed on the branch, staged, edited or
untracked. Without `--base` every rule runs at its level, as before; when git can't compare,
`ratchet-skipped` says so and nothing is lowered. `allow` entries still remove findings,
ratcheted or not: they are the recorded ratchet, file by file, and under `--base` the list only
shrinks: `allow-grew` fails an entry the doctor settings at the merge base didn't have, and
`rules-weakened` fails a rule the base's settings set that this branch lowers, turns off or
excludes files from (compared with the base's settings only). Neither runs when the base had no
doctor settings. These two and
`ratchet-skipped` guard the config itself, so `rules` and `allow` can't name them (the config is
refused), and the ratchet never lowers them, nor the other rules about the config, packages or
generated files (`stale-exception`, `package-rule-override`, `package-rules-invalid`,
`package-doctor-declaration`, `plugin-error`, `build`, `agent-guide-stale`, `contracts-stale`). A
shallow CI clone has no merge base, so `ratchet-skipped` fails a config with `allow`, `rules` or
`packageRules`: check out with `fetch-depth: 0` and fetch the base ref (see
[Which migrations are new](#rule-packs)).

```json
{ "doctor": { "ratchet": ["ui/lists-use-resource-view", "core/direct-data-access"] } }
```

```bash
genesis doctor --strict --base origin/main
```

### Config

`genesis.config.json` (or `"genesis": { "doctor": { … } }` in package.json):

```json
{
  "doctor": {
    "src": ["src"],
    "ignore": ["src/routeTree.gen.ts", "src/integrations/"],
    "tokenFiles": ["src/styles.css"],
    "rules": { "starter-leftover": "off", "palette-color": "warn" },
    "allow": [
      { "rule": "raw-color", "file": "src/lib/error-page.ts", "reason": "Static fallback page rendered before Genesis mounts." }
    ],
    "rulesDoc": "DESIGN_RULES.md",
    "patterns": [
      { "id": "no-page-chrome", "files": ["src/routes/**"], "forbid": "<AppShell\\b", "message": "The shell owns the chrome." }
    ],
    "plugins": ["./scripts/genesis-rules.mjs"],
    "build": ["tsc --noEmit", "vite build"]
  }
}
```

| Key | Default | |
| --- | --- | --- |
| `packs` | | Opt-in rule packs: `"native"`, `"supabase"`. See [Rule packs](#rule-packs). |
| `native` | | `{ routerRoot }` for the native pack. |
| `supabase` | | `{ migrations, base, exposedSchemas, since }` for the supabase pack. |
| `src` | `["src"]` (`["app", "src", "components"]` with the native pack) | Folders (or files) to scan. |
| `extensions` | `.ts .tsx .js .jsx .mts .cts .css` | |
| `ignore` | | Globs to skip, added to the defaults. `*` stays in a folder, `**` crosses folders, a trailing `/` means the whole folder. |
| `uiPackage` | `@marktiderman/genesis-ui` (`@marktiderman/genesis-ui-native` with the native pack) | |
| `themeCss` | the design system's `dist/themes/*.css` + genesis-ui's styles | One stylesheet or a list: package paths (`@marktiderman/genesis-design-system/dist/themes/genesis.css`) or app paths. |
| `tokenFiles` | every scanned `.css` | Globs of app files whose `--x:` declarations count as defined tokens. Files outside `src` work too. |
| `ignoreTokenPrefixes` | `["--tw-", "--radix-"]` | |
| `rawTags` | | `{ "img": "Avatar" }` adds a mapping; `{ "select": false }` stops checking a tag. |
| `forbiddenImports` | | `{ "<regexp>": "message" }`, added to the defaults. |
| `localPrimitiveDirs` | `["src/components/ui"]` | |
| `routesDir` | first of `src/routes`, `src/app`, `app`, `src/pages`, `pages` | The web routes folder the route rules read. |
| `componentPackages` | `["@marktiderman/genesis-forms-studio"]` | Genesis packages besides `uiPackage` whose components `local-genesis-copy` and `page-layout` read (skipped when not installed). `--print-genesis` lists them under `companions`. |
| `rules` | | `{ "<rule>": "error" \| "warn" \| "info" \| "off" }` for any rule, built-in or yours. `info` is reported and never fails, `--strict` included. A package rule changed here warns until `packageRules` gives a reason. |
| `packageRules` | | `{ "<package>/<rule>": { level?, files?, exclude?, reason } }` for the rules packages declare. `reason` is required. `files` and `exclude` apply to `prefer` rules; a package plugin decides its own files, so only `level` applies to its rules. See [Package rules](#package-rules). |
| `ratchet` | | `true`, or a list of rule ids, ratcheted under `--base`. See [The ratchet](#the-ratchet). |
| `contracts` | | `{ out?, schemas?, databaseEnv? }`: the supabase pack's `contracts-stale` check. Needs the supabase pack. |
| `allow` | | Exceptions: `{ rule, file?, match?, reason }`. `match` is the exact tag, token, export name or import specifier. `reason` is required. |
| `patterns` | | Declarative rules, below. |
| `rulesDoc` | | A markdown file of declarative rules, below. |
| `plugins` | | Rule modules, below. |
| `build` | `typecheck`, `build` scripts | Commands for `--build`. |

Unknown keys are an error, so a typo can't quietly turn a check off.

### App rules

Keep app-specific conventions in the app. Three ways, from least to most code:

**Patterns** (`patterns` in config): `{ id, level?, files, exclude?, forbid?, require?, path?, message?, newOnly? }`.
`forbid` must not match a file (the finding points at the line), `require` must match it, `path`
must match its path. All are regular expressions; prefix `(?i)` for case-insensitive. `level` is
`error` (default), `warn`, or `guide` (documentation only, never checked).

**A rules document** (`rulesDoc`): the same rules in markdown, next to the prose that explains
them. A `### rule-id` heading starts a rule, the `- key: value` lines under it set it (`files`
and `exclude` are comma-separated), and a `#`/`##` heading ends it:

```md
## Layout

### pages-use-layouts
- level: error
- files: src/routes/_shell/*.tsx
- require: (DashboardPage|DetailPage|SettingsPage|FormPage)
- message: Signed-in pages render a Genesis page layout.
```

**Plugins** (`plugins`): a module that default-exports a plugin, an array of them, or a factory
that receives the options from `["./path.mjs", options]`. Paths resolve from the config file.

```js
// scripts/genesis-rules.mjs
/** @type {(options?: { max?: number }) => import("@marktiderman/genesis-cli/doctor").DoctorPlugin} */
export default function maxFileLength({ max = 400 } = {}) {
  return {
    name: "max-file-length",
    check({ files, report }) {
      for (const file of files) {
        const lines = file.text.split("\n").length;
        if (lines > max) report({ rule: "max-file-length", level: "warn", file: file.path, message: `has ${lines} lines; split it` });
      }
    },
  };
}
```

`check` gets `{ root, files, genesis, config, report }`. Each file has `path` (relative,
POSIX), `absolutePath`, `ext`, `text` and `code` (comments blanked, line numbers kept).
`genesis` has `components`, `exports`, `values`, `tokens`, `rawTags`, `palette` and the
version. `report({ rule, file, line?, level?, message, subject? })` records a finding; config
`rules` levels and `allow` entries apply to plugin rules exactly as to built-in ones. A plugin
that throws becomes a `plugin-error` finding rather than a crash. In TypeScript,
`defineDoctorPlugin` from `@marktiderman/genesis-cli/doctor` types the object.

### Vite

```ts
import { genesisDoctor } from "@marktiderman/genesis-cli/vite";

export default defineConfig({ plugins: [genesisDoctor()] });
```

`vite build` fails when the doctor finds errors (`genesisDoctor({ strict: true })` fails on
warnings too). `vite dev` logs problems and shows Vite's error overlay, re-checks on every
change under the app (plus `genesis.config.json` and the rules doc), shows the overlay to
browsers that connect later, and reloads once everything passes. Neither runs `contracts-stale`,
which reads the database; run `genesis doctor` in CI for it. Options: `root`, `configPath`,
`strict`, `debounceMs`. `vite` is an optional peer dependency.

### Programmatic use

```ts
import { runDoctor, formatReport } from "@marktiderman/genesis-cli/doctor";

const result = await runDoctor({ root: process.cwd(), strict: true });
if (!result.ok) throw new Error(formatReport(result));
```

### Moving from a local verify script

1. `npm i -D @marktiderman/genesis-cli` (or your package manager's equivalent).
2. Move the exceptions to `genesis.config.json` under `doctor`: scan roots to `src`, ignores to
   `ignore`, brand-bridge files to `tokenFiles`, theme stylesheet(s) to `themeCss` (usually not
   needed; both shipped theme files are read by default), every exception to `allow` with its
   reason, the rules document to `rulesDoc`.
3. Replace the script in package.json with `genesis doctor` (and `genesis doctor --build`), and
   the local Vite plugin import with `@marktiderman/genesis-cli/vite`.
4. Run `genesis doctor`, fix or `allow` what it reports (it checks `raw-color` in code as well
   as CSS, and `raw-tag` only in JSX files), then delete the old script.
## genesis figma:routes

A read-only check that an app's Figma app file covers its routes, so CI reports the drift and an
agent closes it (through the Figma MCP; this command never writes to Figma). The file layout it
expects is in [docs/FIGMA-GUIDELINES.md](../../docs/FIGMA-GUIDELINES.md): frames named by route,
`<route> · <state>` for a state, and a `Proposals` page.

```json
{ "figma": { "file": "<file key>", "pages": { "web": "<page name>", "native": "<page name>" }, "proposalsPage": "Proposals" } }
```

`figma` goes at the top of genesis.config.json. `file` is the key from the file's URL; `pages`
names the page holding each platform's route frames (one or both); `proposalsPage` defaults to
`Proposals`. The token comes from `FIGMA_ACCESS_TOKEN` (a personal access token with read access
to the file). It is sent only as the `X-Figma-Token` header, never printed or written; nothing is
cached.

| Option | |
| --- | --- |
| `--json` | Print the report as JSON. |
| `--strict` | Exit 1 when anything is missing: a page the config names that the file doesn't have, a route with no frame, navigation with no hotspot, a mismatched `// figma:` id. Frames with no route, hotspots to them and navigation the check can't read are reported but never fail it, by design: they are drift for a designer to sort, not gaps in what the app ships. |
| `-d, --dir <dir>` | The app's folder (default: cwd). |

Exit codes: `0` reported, `1` gaps under `--strict`, `2` the check couldn't run (no `figma` block,
genesis.config.json isn't valid JSON, no token, the API refused or didn't answer within 30 seconds).
The same check runs in `genesis doctor` as the `figma-routes` rule.

**Routes.** Expo Router under `src/app`, else `app` (platform `native`): a file is its route,
`(group)` folders kept as written, `index` naming its folder (`(tabs)/index.tsx` is `(tabs)`), and
`_layout` and `+`-files (`+not-found`, `+native-intent`, `+html`, `+api`) left out. TanStack
Router file routes under `src/routes` (platform `web`): dots and folders are segments, `$id`
params and `{-$section}` optional segments kept as written, `.lazy` files folded into their
route, `__root`, `route.tsx` and `-private` files left out. The root page is `index`.

**Navigation.** String literals only: `router.push("…")`, `router.replace("…")`,
`router.navigate("…")`, `<Link href="…">`, `<Link to="…">` and `navigate({ to: "…" })`, in
`src/` and `app/`. A target is matched to a route by URL: groups and pathless `_x` segments
dropped, params match any segment, an Expo catch-all `[...rest]` (and a TanStack `$` splat)
matches the rest of the path, optional segments may be absent. Only navigation in a route file
is checked against that route's frame. A template literal with `${…}` or a `{ pathname, params }`
object can't be resolved to a route, so in a route file it is listed as not checked (`info`)
rather than matched.

**Figma.** `GET /v1/files/:key?depth=2` gives the pages and their top-level frames;
sections on those pages are read with `GET /v1/files/:key/nodes?ids=…&depth=1` for the frames
inside them. Each route frame's tree is then read with `GET /v1/files/:key/nodes?ids=…`, and a
hotspot is any node in it with `interactions[].actions[]` of `type: "NODE"` and a
`destinationId` (any `navigation` except `CHANGE_TO`, which swaps a variant), or with the older
`transitionNodeID`. A frame matches a route when its name before ` · ` is the route as written
(`(tabs)/settings`) or names the same URL (`settings`).

**The report.** A summary (routes, route frames, covered routes and percent, hotspots, missing),
then: routes with no frame; frames on a route page with no route (move them to Proposals, or add
the route); the Proposals page's frames by section; navigation in a route file whose screen has a
frame but no hotspot to the target's frame; hotspots whose destination frame has no route;
`// figma:` ids that don't match; and navigation that isn't a string literal (not checked).

```text
Figma route coverage (file FAKEfileKEY123): 7 routes, 6 frames, 4 covered (57%), 3 hotspots, 6 missing

Routes with no frame (3)
  platform  route             file
  --------  ----------------  -------------------------------
  native    items/[id]        src/app/items/[id].tsx
  web       admin/decks       src/routes/admin/decks.tsx
  web       docs/{-$section}  src/routes/docs.{-$section}.tsx

Navigation with no hotspot (2)
  from    to                      at
  ------  ----------------------  --------------------------
  (tabs)  items/[id] (no frame)   src/app/(tabs)/index.tsx:6
  index   admin/decks (no frame)  src/routes/index.tsx:6
```

### Linking a route to its frame

A route file may name its frame's node id in a comment on one of its first five lines, so an
agent can jump from the route to the frame:

```tsx
// figma: 12:345
export default function Settings() { … }
```

`12-345` (as a URL writes it) works too. The check reports a comment whose id isn't one of the
frames named for that route (the frame was replaced, or the comment was copied).

## genesis upstream

What an app needed from Genesis and didn't find goes in `docs/genesis-upstream.md` (or
`genesis-upstream.md` at the app's root), one table:

| id | kind | status | feature | package | local | need |
| --- | --- | --- | --- | --- | --- | --- |
| kanban-swimlanes | extension | candidate | data-views | @marktiderman/genesis-ui | src/components/lanes.tsx | Swimlanes on KanbanBoard |

`kind` is `gap` (nothing in Genesis), `extension` (a part with no prop, variant or slot for it)
or `invention` (the app built it). `status` is `candidate`, `proposed`, `promoted` or `declined`.
`local` is the app's own code for it: repo-relative paths, separated by `, ` (a comma and a space)
or `<br>`; a comma with no space after it stays part of the path.

- `genesis upstream check` validates it, and warns when a promoted entry's local code is still
  there (delete your copy and use the Genesis one).
- `genesis upstream export <id>` prints the link to Genesis's gap issue form, filled in from the
  entry (never the local path). It sends nothing; check the text names no app or customer, file
  it, and set the entry to `proposed`.

