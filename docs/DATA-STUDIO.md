# Genesis Data Studio

Plan v2.1, 2026-10-18. Status: **proposal, for the maintainer's decision**. Nothing described here
is built yet.

An Airtable-style workspace for any Supabase or Postgres project. It ships in Genesis, and each app
hosts it either as a route of its own or as a second app in its monorepo.

This plan comes from three sources:

- file-level reading of Genesis at `6ad07d1` and supasheet at `49e8fbe`;
- current Refine, react-admin and Supabase documentation (read 2026-10-18);
- three adversarial reviews: architecture, security, and product.

Gamify, the first consumer, is only one of three adoption tests. Its own plan for moving data access
off its API is in `GamifyEducation/gamify-platform` `prds/api-shrink/`.

## The rule

> A signed-in user sees and edits exactly what they already can. The database or the app's own API
> decides that, never Genesis.

## Verdict

Genesis is the right home, and parity-plus with supasheet is reachable.

**What Genesis already has:**

- `ResourcePage`;
- forms with 14 field types;
- a table with inline editing;
- saved views and slots;
- a data-provider contract.

**What it lacks:** knowledge of every table's real shape, and safe server-side access.

Three findings shape the build:

1. **`ResourcePage` loads only the first 25 rows** and then searches, sorts and filters in the browser
   (`ResourcePage.tsx:653`, `core/src/hooks/use-resource.ts:106`). The fix must be **opt-in**, because
   some providers reject server-side sort or search today: gamify's API provider throws on sort, and
   the switchboard bridge throws on search (`data-switchboard/src/data-provider.ts:110`).
2. **Browsers can no longer read the schema from hosted Supabase.** Since 8 Apr 2026 the `/rest/v1/`
   OpenAPI document is refused to anon keys (Supabase changelog 42949), and publishable keys never
   see it (see Confirmed, below). The schema has to be read on the server or generated ahead of time.
3. **The schema model already exists** in the switchboard (`FieldSchema`, `ResourceContract`,
   `describe()`). It is promoted into one home, not duplicated (FRAMEWORK.md rule 1).

## How data is reached

### Genesis server handler (new)

The handler is a web-standard `Request → Response` function that mounts in a Next.js route, Hono,
Remix or Cloudflare. It connects to Postgres directly, which gives it the catalog, transactions and
version checks.

- **It acts as the user.** For every request it opens a transaction, switches to the signed-in user's
  identity (`set local role authenticated` plus their token's claims), and runs the query. So **the
  database's own row rules always apply**.
- **The app decides which tables appear.** The app's `authorize(request, {resource, action})` does
  this. Everything is denied by default, and tables stay read-only until writes are enabled per table.
- **Rule-bearing writes go through the app's database functions.** A resource can map create, update
  or delete to a named function, e.g. `update: "save_question"`. Where such a function exists, the
  studio never writes the row directly. Where none exists, the handler does a single-row write under
  the database's rules.

### The app's own provider (existing)

Some apps keep their permissions in their own API, for example a REST backend. Those apps hand the
studio that API's Genesis data provider. That's the contract Genesis already ships, so there is no
new mode to maintain, and the API stays the single authority.

Providers declare their `capabilities`: search, sort, filter operators, and bulk writes. The UI hides
anything a provider can't do instead of erroring.

### Considered and dropped

| Option                                      | What it would have offered                                                | Why it's out                                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Act as admin" switch                       | Staff see and edit every row in every table immediately, with no API work | It is a second permission system that drifts from the app's rules. Its edits skip the app's own logic (grading, config locks, purchases). A bug would leak or corrupt data across every tenant |
| Browser-only studio mode                    | No server piece; works on a static site                                   | It shows the same rows as the handler, with less safety: no transactions and no reliable audit. Browser schema reads are blocked on hosted Supabase. It is also a second code path to maintain |
| SQL catalog kit installed in every database | Live schema discovery from the browser                                    | A migration per project for every Genesis upgrade. It exposes the schema to every logged-in user and inverts the package dependencies                                                          |
| Genesis-hosted studio                       | One URL for every project                                                 | Genesis would hold every project's database credential                                                                                                                                         |

## Packages and hosting

| Where                                       | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@marktiderman/genesis-studio` (new)        | The workspace UI: table sidebar, sheet grid, record pop-up, command palette. Routing goes through `onNavigate` plus a URL-state adapter, and sign-in fills a slot. Apps that don't want the studio pay nothing                                                                                                                                                                                                                                                                                                                                 |
| `@marktiderman/genesis-studio-server` (new) | The handler: schema discovery, queries that act as the user, write safety, the audit sink. It is the only package that touches database credentials                                                                                                                                                                                                                                                                                                                                                                                            |
| `genesis-core`                              | One schema model: the switchboard's `FieldSchema`/`ResourceContract` promoted here, with deprecated aliases left in the switchboard. Each field carries a storage type plus a widget hint. Keys may be composite (`key: string \| string[]`). Optional provider methods: `describe`, `listResources`, `capabilities`, `getManyReference`, `updateMany`, `deleteMany`. `describe()` reports the current user's column-level permissions, so a hidden column such as an answer key never renders, and a column they can't update shows read-only |
| `genesis-ui`                                | `ResourcePage` gains opt-in server paging (`paging="server"`), capability-hidden controls, schema-built forms and new view modes. The spreadsheet grid ships as an Experimental, optional subpath (`genesis-ui/sheet`), so other consumers don't inherit its dependency                                                                                                                                                                                                                                                                        |
| `genesis-cli`                               | `genesis-cli introspect` writes a typed `resources.genesis.ts` from the Postgres catalog, Supabase types or an OpenAPI spec. `genesis-cli init --admin` scaffolds a standalone admin app                                                                                                                                                                                                                                                                                                                                                       |
| Each app's own hosting                      | Either a route inside an existing app (e.g. `/admin/data`, one sign-in, no new deploy) or a separate app in the project's monorepo on its own subdomain. Genesis may run a public demo site on sample data, but never hosts customer studios                                                                                                                                                                                                                                                                                                   |

## Capability matrix

Key: **has** works · **partial** limited or flawed · **no** missing · **EE** react-admin paid tier · **—** not checked.

| Capability                                                                     | Genesis now                     | Supasheet     | Refine  | react-admin | Target | Notes                                                                                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------- | ------------- | ------- | ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| List every table automatically                                                 | no                              | has           | —       | partial     | P0     | Discovered server-side. RA's Supabase guesser reads the OpenAPI document, which is now blocked for browser keys (inferred from its source) |
| Real column types, required, enums, FKs                                        | guessed from row 0              | has           | samples | samples     | P0     | From the catalog or the generated contract                                                                                                 |
| Composite primary keys                                                         | no                              | has           | —       | —           | P0     | `id` is hard-coded in `supabase-provider.ts:192,219,229`, which blocks junction tables                                                     |
| Column-level permissions                                                       | no                              | has           | —       | —           | P0     | Per-user read and update rights per column                                                                                                 |
| Server paging, search, sort                                                    | first 25 rows                   | has           | has     | has         | P1     | Opt-in prop plus provider capabilities                                                                                                     |
| Permission-aware controls with a reason                                        | `allowCreate`/`allowEdit` flags | has           | has     | has         | P1     | From `authorize`/`can()`, never inferred from database grants                                                                              |
| Filter builder, multi-sort                                                     | partial                         | has           | —       | —           | P1     | Operators by field type. Multi-sort already exists client-side in `DataTable`                                                              |
| Group by a field                                                               | no                              | —             | —       | —           | P1     | An Airtable day-one behaviour                                                                                                              |
| Record pop-up, copyable record links                                           | detail panel                    | has           | —       | —           | P1     | Through the app's URL adapter                                                                                                              |
| Saved views (filters, sort, columns, widths)                                   | filters only                    | presets       | —       | has         | P1     | Column resize exists (`DataTable.tsx:111`)                                                                                                 |
| Spreadsheet grid, in-place editing                                             | text/select only                | partial       | —       | EE          | P0–P2  | P0: one cell with a version check and audit. P2: full grid with keyboard and copy/paste                                                    |
| Edit conflict detection                                                        | no                              | no            | —       | —           | P0     | Beyond parity                                                                                                                              |
| Audit trail                                                                    | no                              | has           | has     | EE          | P0     | Required before any write                                                                                                                  |
| Forms built from the schema, with validation                                   | guessed                         | no validation | —       | —           | P1     | zod from NOT NULL, CHECK, enums and domains                                                                                                |
| Foreign-key pickers, follow a link                                             | single, 100 rows                | has           | has     | has         | P1     | Server-side search; batched labels                                                                                                         |
| Related records on a record                                                    | no                              | has           | —       | —           | P1     | Tabs from foreign keys (1:1, 1:N, M:N)                                                                                                     |
| CSV export of every filtered row                                               | no                              | one page      | has     | has         | P1     | Pages through the provider                                                                                                                 |
| Undo                                                                           | no                              | kanban only   | has     | has         | P2     | A compensating write built from the audit                                                                                                  |
| Bulk edit and delete                                                           | hooks                           | has           | has     | has         | P2     | One transaction, exact row count                                                                                                           |
| CSV import                                                                     | no                              | partial       | has     | —           | P2     | Column mapping, dry run by default, one transaction                                                                                        |
| Conditional fields, form sections                                              | functions                       | has           | —       | —           | P2     | Declared in code config first                                                                                                              |
| Kanban, calendar, gallery                                                      | pieces                          | has           | —       | EE          | P3     | Paged queries, never unbounded                                                                                                             |
| Row actions, comments                                                          | props                           | has           | —       | —           | P3     | Actions call the app's functions                                                                                                           |
| Realtime, schema changes as migrations, dashboards, translations, React Native | no                              | mostly no     | partial | EE          | P4     | Beyond parity. Schema edits generate a migration for review and never run live                                                             |

## Write safety

Write safety is built into Genesis, whatever the data source.

- **No silent overwrites (P0).** Every update checks a version column, `updated_at` by default
  (configurable). If nothing changes, Genesis re-reads the row and reports what actually happened:
  "changed by someone else", "not visible to you", or "deleted". It never assumes "permission denied",
  which is wrong three times out of four.
- **Exact bulk writes (P2).** Bulk edits and deletes take explicit ids and run in one transaction. They
  roll back unless the number of rows changed equals the number requested, so access rules can't
  quietly skip rows.
- **Audit before editing (P0).** Writes can't be enabled until an audit sink is configured. An edit and
  its audit entry commit in the same Postgres transaction, or neither does. Each entry records the
  actor, the resource and key, and the before and after values. The sink is one of:
  - **A table** in the same database, written by the handler inside the edit's transaction.
  - **`database`**, meaning the app's own audit triggers handle it. Because the handler acts as the
    user, those triggers see the real actor.
  - **An outbox**, for an external log or callback. The handler writes the entry to an outbox table
    inside the edit's transaction, and a worker delivers it afterwards. A log or callback can't be the
    sink directly, because it can't commit or roll back with the edit.

  If the audit write fails, the edit rolls back and the user sees "not saved: audit failed". Delivery
  never blocks or undoes the edit, and an edit is never visible without its audit record: the entry is
  in the database from the moment the edit commits, even while delivery is pending or dead-lettered.

  **Tamper-proof.** Because the handler acts as the user, the user's own role must not be able to write
  audit rows, or anyone could forge or erase them through the Data API. The audit table and the outbox
  are written only by a `security definer` function with `search_path = ''`, kept in a schema the Data
  API doesn't expose. `anon` and `authenticated` get no insert, update or delete on either table, and
  only the delivery worker's role may mark outbox entries delivered. The function takes the actor from
  the session (`auth.uid()`), never from an argument, so it can't repeat supasheet's `p_caller` mistake.
  Under `database`, the app's own triggers must follow the same rules.

  **Outbox delivery.** Delivery is at least once, so each entry carries a unique id and receivers drop
  duplicates. Each entry also carries a per-record sequence number, and entries for one record are
  delivered in order: if one fails, later entries for that record wait behind it while other records
  keep flowing. Workers claim entries with a row lock that skips rows another worker holds, so two
  workers never send the same entry at once. Failed attempts retry with exponential backoff and jitter
  (configurable; default 10 attempts over about a day). An error that retrying can't fix, such as the
  receiver rejecting the payload, skips the remaining attempts. Either way the entry moves to a
  dead-letter table, raises an alert, and stays there until someone replays it, which resets its
  attempts.

- **Safe imports and real undo (P2).** Imports dry-run first and list every row that won't convert,
  then commit in one transaction. Undo issues a compensating write from the audit, so it works even
  after the tab is closed.

## Lessons from the others

**Copy from supasheet:**

- Edit forms show only the columns the user may update.
- One condition language for filters, presets and field rules.
- Related-record tabs, classified by foreign keys.
- Database functions as row actions.

**Avoid from supasheet:**

- Metadata that goes stale until refreshed by hand.
- Catalog functions that answer for any role the caller names (`p_caller` on SECURITY DEFINER RPCs).
- A public upload bucket with private-looking rules.
- Unbounded kanban and calendar queries.
- Exports that cover one page.
- Imports that silently turn bad values into null.

**From Refine:**

- Required versus optional provider methods.
- A `can()` that returns a reason.
- Import and export hooks that page through the provider.
- Its official shadcn integration is the nearest competitor to watch.

**From react-admin, NocoDB and Airtable:**

- `getManyReference` and batched reference labels.
- A column chooser saved per view.
- One table, many views.
- The day-one expectations: group-by, record pop-up, cell undo, copyable links.

## Roadmap

### P0 · Week one: fix a real row

**Scope:**

- The server handler acting as the user: schema discovery (including column permissions), list, read.
- A single-cell edit with a version check and audit, under the existing `DataTable`.
- Composite keys.
- The promoted schema model.

**Versioning:** new packages at 0.1; core gets an additive minor.

**Done when:**

- A real row is fixed through the studio in `apps/sample` and in a stock Supabase project (supasheet's
  demo schema), with the audit entry visible.
- Attaching a second project takes under 15 minutes.

### P1 · The studio people want to live in

**Scope:**

- Navigation: table sidebar, record pop-up and links, related tabs.
- Data control: opt-in server paging with capabilities, filter builder, multi-sort, group-by.
- Saved views with columns and widths.
- Editing: schema-built forms, relation pickers, permission reasons, rule-bearing writes mapped to the
  app's functions.
- CSV export.

**Versioning:** additive minors for UI changes; the studio at 0.2.

**Done when:** ten daily admin jobs pass in all three adoption tests: find a row, fix a field,
bulk-change a status, follow a link, export a filtered set, and five others.

### P2 · Power editing

**Scope:**

- The spreadsheet grid (Experimental subpath), with keyboard and copy/paste.
- Bulk writes and CSV import with dry run.
- Undo from the audit.
- Conditional fields and sections in code config.

**Done when:** every supasheet parity row marked P0–P2 is green, with a test per data seam.

### P3 · Workflow

- Kanban and calendar views.
- Row actions and comments.
- `genesis-cli introspect` for checked-in contracts.
- Optional per-table settings stored in Postgres comments, used as a generator input.

### P4 · Beyond

- Realtime.
- Schema changes as reviewed migrations.
- Aggregate dashboards.
- Translations.
- React Native.

## Adoption tests

| Project                | Data source                                                                                | Proves                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Genesis `apps/sample`  | Handler acting as the user                                                                 | The library works on its own                                    |
| Stock Supabase project | Handler acting as the user                                                                 | Attaching a fresh project takes under 15 minutes                |
| Gamify                 | The handler for tables with correct access rules; gamify's API provider for API-owned data | It works in a real app whose permissions live partly in its API |

Gamify must first fix the access-rule gaps it found on 18 Oct. That is Phase 0 of its API-shrink
proposal, and each later phase there makes more tables manageable with no gamify endpoint work.

## Decisions to finalize

| #   | Decision                        | Recommendation                                                                                                                 | When  |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 1   | What we're building             | One `DataStudio` component, plus `genesis-cli init --admin` for a standalone app                                               | Now   |
| 2   | Packages                        | `genesis-studio` and `genesis-studio-server`, both new                                                                         | Now   |
| 3   | What parity is measured against | Ten daily admin jobs, then Airtable behaviours, then supasheet's list                                                          | Now   |
| 4   | Week-one goal                   | Fix a real row, with an audit entry                                                                                            | Now   |
| 5   | Data sources                    | One handler that always acts as the user, plus the app's own provider. No admin switch and no browser-only mode                | Now   |
| 6   | Handler shape                   | Web-standard `Request → Response`                                                                                              | Now   |
| 7   | Handler connection              | A direct Postgres connection string, switching to the user's identity per request                                              | Now   |
| 8   | Which tables appear             | The app's `authorize()`: deny by default, read-only until enabled, never more than the database allows                         | Now   |
| 9   | Provider capabilities           | Declared by each provider; the UI hides what isn't supported                                                                   | Now   |
| 10  | Schema source                   | Server-side discovery for setup, plus a generated, checked-in contract that wins when present                                  | Now   |
| 11  | One schema model                | Promote the switchboard's types into core, with deprecated aliases                                                             | Now   |
| 12  | Field types                     | A storage type plus a widget hint                                                                                              | Now   |
| 13  | Record identity                 | `key: string \| string[]`                                                                                                      | Now   |
| 14  | Per-table settings              | Code first (`defineResource()`); Postgres comments later, as a generator input                                                 | Later |
| 15  | Permissions in the UI           | From `authorize`/`can()`, with a reason                                                                                        | Now   |
| 16  | Concurrent edits                | A version check on every update                                                                                                | P0    |
| 17  | Audit                           | In the edit's transaction: a table, `database` triggers, or an outbox                                                          | P0    |
| 18  | Undo                            | A compensating write from the audit                                                                                            | P2    |
| 19  | Bulk and import                 | Transactional, exact counts, dry run by default                                                                                | P2    |
| 20  | Grid engine                     | A one-day spike comparing react-data-grid with TanStack Table + Virtual; the winner ships as an Experimental, optional subpath | P2    |
| 21  | Extend or build new             | Extend `ResourcePage`/`DataTable`; server paging opt-in                                                                        | Now   |
| 22  | Day-one behaviours              | Grid edit, pop-up, filter, multi-sort, group-by, columns, saved views, links, cell undo, follow a link, export                 | P0–P2 |
| 23  | Routing and URL state           | The app supplies them through an adapter                                                                                       | Now   |
| 24  | More views                      | Kanban and calendar next; gantt only if asked                                                                                  | Later |
| 25  | Versioning                      | New packages at 0.x; core and UI changes are additive minors with changesets                                                   | Now   |
| 26  | Out of v1                       | React Native, realtime, translations, schema editing                                                                           | Now   |
| 27  | Adoption tests                  | Sample app, a stock Supabase project and gamify, with time-to-attach under 15 minutes                                          | Now   |
| 28  | Supasheet code                  | Rebuild the ideas rather than copy code, keeping Genesis MIT; archive the `marktiderman/supasheet` fork after porting          | Now   |
| 29  | Rule-bearing writes             | Map create, update and delete per resource to the app's database functions; direct row writes only where none exists           | P1    |
| 30  | Column permissions              | `describe()` returns per-user column read and update rights, and forms and the grid follow them                                | P0    |

## What the three reviewers changed

**Architecture.** Its 10x upgrade, a generated, checked-in contract, was adopted. It also changed:

- server paging would break providers, so it is now opt-in, with capabilities;
- the switchboard's schema model is promoted, not duplicated;
- composite keys;
- an Experimental grid subpath;
- semver per phase.

**Security.** Its 10x upgrade, server-side access with write safety, was adopted. It also changed:

- database grants say nothing when everyone is one database role, so permissions come from the app;
- "zero rows means denied" is unsound, so Genesis re-reads the row and reports what happened;
- version checks on every write;
- exact bulk row counts;
- audit before any write.

**Product.** Its 10x upgrade, attach by credential, was adopted, with acting as the user as the
default and only mode. It also changed:

- the first goal is value in week one;
- Genesis is benchmarked against Airtable, NocoDB and Supabase Studio;
- Airtable's day-one behaviours were promoted;
- gantt and translations were cut from v1;
- a time-to-attach target was added.

**Corrections to v1:**

- `NativeResourcePage` sends only search and filters to the server, not paging or sort
  (`NativeResourcePage.tsx:224`).
- List errors already render an error panel (`ResourcePage.tsx:671`). Only failed saves stop at
  `console.error`.

## Confirmed

- Hosted Supabase also hides the schema document from _publishable_ keys, not only legacy anon keys.
  Supabase's security retro says the OpenAPI spec is no longer publicly visible with the new
  publishable keys ([Supabase security 2025 retro](https://supabase.com/blog/supabase-security-2025-retro)).
  The self-hosting guide matches: `/rest/v1/` returns 403 to `sb_publishable_*` and anon keys and
  needs a secret key
  ([self-hosted auth keys](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys)).

## Not confirmed

- Grid-engine maintenance status: settled by the P2 spike.
- No benchmark has been run.
