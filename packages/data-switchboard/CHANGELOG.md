# @marktiderman/genesis-switchboard

## 2.0.0

### Major Changes

- b4de53f: **Major, not minor** — this repo's versioning policy (`.changeset/README.md` / PRD-07) puts breaking changes at MAJOR once a package is past 0.x, and this release has two breaking-flavored pieces (below). Both are additive at the value level; the break is at the type level, for exhaustive consumer code.

  `QueryOptions` gains `whereIn` (membership filter, one or more fields) and `offset` (paired with `limit`, for a bounded page window past the first). All five adapters (Code, Airtable, Notion, gitdata, Supabase) implement both — the client-side adapters filter/slice in memory over an already-fetched, reference-stable snapshot; `SupabaseAdapter` pushes `whereIn` down to the query builder's `.in()` and `offset`+`limit` down to `.range()`. `offset` without `limit` is a fail-loud error on every adapter (`range()` needs both bounds; the shape is unsupported everywhere, not silently guessed on some adapters and rejected on others). `SupabaseAdapter` additionally requires `orderBy` whenever `offset` is set: Postgres/PostgREST make no ordering guarantee absent an explicit `ORDER BY`, so ranged pagination without one can skip or repeat rows across pages — a risk specific to a live re-queried backend, which the in-memory adapters don't share. `createSwitchboardProvider`'s `ListParams` → `QueryOptions` translation carries the same requirement: paginating past page 1 without `params.sort` now throws instead of silently building an offset window with no stable order.

  `ProviderKind` gains `"jsonb"` (+ `PROVIDER_LEVEL.jsonb = "L2"`) for a Supabase JSONB blob column backing many logical resources out of one physical table with no per-resource DDL — same "persistent, human/app-editable, no migration" shape as Airtable/Notion, just Postgres-backed. No adapter for it ships from this package; a consumer's own `Adapter` implementation declares `kind: "jsonb"` and the registry/resolver already accept any `ProviderKind`. **Breaking**: any code with an exhaustive `switch`/lookup over `ProviderKind` outside this package needs a case for `"jsonb"` (this package itself has none — checked, the only exhaustive map was `PROVIDER_LEVEL`, updated here).

  `createSwitchboardProvider` — the bridge from `@marktiderman/genesis-core`'s `DataProvider` interface onto a `Switchboard` `ResourceClient` — moves into this package from the dashboard app (`apps/dashboard/app/lib/switchboard-provider.ts`, deleted; the app now imports it from `@marktiderman/genesis/switchboard/data-provider`), so any Genesis-core consumer can put a Switchboard behind its data plane, not just the dashboard. It now maps `in` filters to `whereIn` and `page > 1` to `offset` instead of throwing — the two gaps its own "FAIL LOUD" comments called out as needing this exact extension before being usable for anything beyond page-1, equality-only reads. It ships at its own `./data-provider` subpath (`@marktiderman/genesis-switchboard/data-provider`), not the package root: its module does `import type` from the new **optional peer dependency** `@marktiderman/genesis-core` (`workspace:^`), and re-exporting it from the root barrel would force every consumer — even ones who only want `Switchboard`/`CodeAdapter`/etc. — to have `genesis-core` resolvable under `skipLibCheck: false`, the same reasoning `./gitdata` already splits on for its Node-only concern. Nothing changes for a consumer who doesn't import `./data-provider`.

## 1.0.0

### Major Changes

- e972635: Rename the npm scope from the old pre-public scope to `@marktiderman` across all Genesis packages: `genesis-*` → `@marktiderman/genesis-*`.

  The data-layer package additionally shortens its name to `@marktiderman/genesis-switchboard` (dropping the redundant `data-` prefix while keeping the `genesis-` family prefix consistent with the other packages).

  **Breaking change.** Consumers must update every import specifier and dependency entry (e.g. `genesis-ui` → `@marktiderman/genesis-ui`, and `genesis-data-switchboard` → `@marktiderman/genesis-switchboard`). Per npm best practice the previous pre-public-scope names will be `npm deprecate`d with a pointer to the new names once the `@marktiderman/*` packages are published. The legacy `genesis@2.0.0` umbrella package under the old scope is unaffected (separate lineage).

### Minor Changes

- 3a35b0f: Port the Switchboard — a pluggable, cross-runtime data-layer config — into Genesis as a first-class package (Genesis D-25, step 1). Composes LEVELS (L1 Code / L2 Middle / L3 Production) × TIERS (A env / B resource / C field, precedence C > B > A) so a consumer reads one canonical shape via `data.resource('x').list()` and never knows where the data lives. Ships the Registry + Adapter interface + Code/Airtable/Notion/Supabase adapters + Resolver + Reconciler (drift + promote) + types + tests + `SWITCHBOARD.md` + the teaching sample config. `@supabase/supabase-js` is an optional peer. Rescoped from `@acme/data-switchboard`. Dashboard wiring is a separate follow-up.
