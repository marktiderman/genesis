# The Switchboard — pluggable data layer for Genesis

> **Package:** `@marktiderman/genesis-switchboard`
>
> **What it is:** a SHARED, cross-runtime (Node + Deno + React Native) framework that makes a resource's _backing_ a configuration choice, not a code rewrite. The app calls `data.resource('x').list()` and **never knows where the data lives** — code fixtures, Airtable, Notion, gitdata, or Supabase. It composes **two independent axes** (LEVELS × TIERS) so you can move one resource — or even one _field_ — between a mock, a human-editable middle layer, and production Postgres without touching consumer code.

---

## Why a switchboard exists

A growing app is built in layers that each want _different_ data backing at _different_ times:

- An **agent / prototyping layer** wants instant, zero-cost fixtures it can edit in code and reset on restart.
- A **human-curation layer** wants a spreadsheet a non-engineer can edit live — Airtable / Notion — with no migration ceremony.
- A **production layer** wants durable, migration-governed Postgres (Supabase) with RLS.

Without a switchboard, choosing a backing is a rewrite, and the middle (human-editable) layer silently drifts from production until a launch surprises everyone. The Switchboard makes the backing a _declaration_, and makes drift between layers a _report_ — so the middle layer never becomes a silent trap.

---

## The two axes (mental model)

```text
              TIERS  (at what granularity you choose the backing)
              ─────────────────────────────────────────────────────────
              A Environment        B Resource          C Field/Column
              one default for      override ONE        compose ONE resource's
              ALL resources        resource            fields from MANY providers
  L          ┌───────────────────────────────────────────────────────────┐
  E   L1 Code│  dev → all code    features → code     scratch col ← code   │
  V          │                                         (rest from base)    │
  E   L2 Mid │  dev → Airtable    features ← Airtable  curated col ← Airtable│
  L          │  (human-editable)                                           │
  S   L3 Prod│  prod → Supabase   tickets ← Supabase   identity+rows ← Supa │
             └───────────────────────────────────────────────────────────┘
              Resolution precedence:  C  >  B  >  A
```

- **LEVELS** answer _HOW a resource is backed_ (persistence + governance). Cost-of-change and durability rise L1 → L3.
- **TIERS** answer _AT WHAT GRANULARITY you choose the backing_. The registry resolves, **per-resource and per-field**, which provider serves it, applying precedence **C > B > A**.

The two axes are **independent and compose**: a resource at any Tier can be backed by any Level's provider.

**Two precedence rules, at two scopes:** (1) _across tiers_, **C > B > A** decides which tier's binding serves a resource; (2) _within a Tier-B multi-source merge_, **the LAST-listed source wins** a field conflict (see [§3a Multi-source MERGE](#3a-multi-source-merge--realtime-read-time-merge-a-tier-b-variant)). A fully-worked composition that exercises **every Level × Tier combination plus the merge** lives in **`src/switchboard.config.sample.ts`** (a teaching artifact — not wired to any app).

### CORE PIECES

1. **Registry** — one declaration of every Resource: its provider-agnostic contract (field schema + identity `key`), its sourceOfTruth Level, and its bindings (A/B/C). The app reads the registry; nothing else knows where data lives.
2. **Adapter interface** — one contract per provider: list/get/query (+ create/update/delete where writable, + describe for schema). CodeAdapter (L1) · AirtableAdapter (L2) · NotionAdapter (L2) · GitdataAdapter (L2) · SupabaseAdapter (L3). App calls `data.resource('x').list()` and never knows the Level.
3. **Resolver** — walks A→B→C, fetches each contributing provider once, MERGES by the resource `key` into the canonical shape. Tier C is a field-level join requiring a shared identity key.
4. **Reconciliation** — drift report (compare same resource across two Levels: schema+rows+values; baseline = sourceOfTruth Level) + promote (turn a proven L2 shape into an L3 Supabase migration (DDL + optional backfill) for human approval). The middle layer never becomes a silent drift trap.

---

## Architecture (this package)

```text
packages/data-switchboard/
├── SWITCHBOARD.md            ← this doc
└── src/
    ├── types.ts              Level · Tier · FieldSchema · ResourceContract · Binding · ResolvedPlan
    ├── registry.ts           Registry + bind() (Tier A/B/C) + resolve() (precedence C>B>A)
    ├── resolver.ts           Switchboard — the data client; Tier-C field federation (fetch-once, merge by key)
    ├── reconcile.ts          driftReport() (resource across two Levels) + promote() (L2→L3 migration gen)
    ├── resources.ts          tickets + features worked-example contracts (illustrative Airtable/Supabase maps)
    └── adapters/
        ├── adapter.ts        Adapter interface (list/get/query/create/update/delete/describe)
        ├── code.ts           CodeAdapter    — L1 (in-memory fixtures; fully writable)
        ├── airtable.ts       AirtableAdapter — L2 (field IDs · returnFieldsByFieldId · TTL cache · capped-429 retry · stale-while-error)
        ├── notion.ts         NotionAdapter   — L2 (property encode/decode, cursor pagination)
        ├── gitdata.ts        GitdataAdapter  — L2 (markdown-frontmatter files as rows; Node-only)
        └── supabase.ts       SupabaseAdapter — L3 (structural supabase-js client; RLS user_id=auth.uid())
```

### 1. Registry — the one declaration

```ts
const registry = new Registry()
  .register(ticketsContract) // contract: fields + key + sourceOfTruth
  .register(featuresContract)
  .useAdapter(new CodeAdapter({ fixtures })) // L1
  .useAdapter(new AirtableAdapter({ … })) // L2
  .useAdapter(new SupabaseAdapter({ client, maps })) // L3
  .setEnvironmentDefault("airtable") // Tier A
  .bindResource("tickets", "supabase") // Tier B override
  .bindFields("widgets", "supabase", {
    // Tier C field federation
    scratch: "code",
  });
```

`registry.resolve(name)` returns a `ResolvedPlan { base, baseTier, federated }` applying precedence **C > B > A**. The app reads the registry; nothing else knows where data lives.

### 2. Adapter interface — one contract per provider

```ts
interface Adapter {
  kind: ProviderKind;
  level: Level;
  list(c): Promise<DataRow[]>;
  get(c, key): Promise<DataRow | null>;
  query(c, opts): Promise<DataRow[]>;
  describe(c): Promise<DescribeResult>; // live schema → drives drift
  create?(c, row);
  update?(c, key, patch);
  delete?(c, key); // writable providers only
}
```

A read-only provider throws `ReadOnlyAdapterError` on write.

**AirtableAdapter hardening (the patterns that survive a real integration):**

- **Field IDs, not names.** Canonical field-name → Airtable `fldXXX`, requesting `returnFieldsByFieldId=true`, so a human **renaming a column in the Airtable UI never breaks the app** (IDs are immutable; names are not).
- **TTL cache.** `list/get/query` share a short-lived per-resource cache so a read burst is one network call. `ttlMs: 0` disables.
- **Capped 429 retry.** Airtable rate-limits at 5 req/s/base; the adapter retries with exponential backoff **capped** at `maxRetries`, honoring `Retry-After`.
- **Stale-while-error.** If a refresh fails but a previous snapshot exists, it serves the **stale** rows rather than throwing — the middle layer degrades gracefully instead of taking the app down.

**SupabaseAdapter** accepts a pre-built supabase-js client (the app owns auth/session) and is typed against a **minimal structural interface**, so the package imports cleanly on Node, Deno, and RN without forcing a `@supabase/supabase-js` major. Access is **always** RLS-gated on `user_id = auth.uid()` (never `org_id`) with modern publishable/secret keys only.

**GitdataAdapter** backs resources as markdown files under a data root (folder = table, file = row) — one adapter instance serves any number of tables. Node/Deno filesystem only; a browser app reaches it through a server route.

### 3. Resolver — the data client

`Switchboard.resource(name)` returns a `ResourceClient` with `list/get/query/create/update/delete/plan`. For Tier A/B it is a straight passthrough to the base provider. For **Tier C** it performs **field federation**:

> walks A→B→C, **fetches each contributing provider once** (a `list()` per provider, not per row), and **MERGES by the resource `key`** into the canonical shape. Tier C is a field-level **join** and therefore **requires a shared identity key** across the contributing providers.

Writes target the **base** provider (the identity owner) by default. **Tier-C federated-field writes are implemented**: `create`/`update`/`delete` **fan out** so each field routes to its owning provider, keyed by the shared `key` — see `src/__tests__/federated-writes.test.ts`.

### 3a. Multi-source MERGE — realtime read-time merge (a Tier-B variant)

A resource's Tier-B binding may name a **single** provider **or** an **ordered list of sources** that are **merged at read time**:

```ts
registry.bindMerge("tickets", ["airtable", "supabase"]);
// equivalently: registry.bind({ tier: "B", merge: true, resource: "tickets", sources: ["airtable", "supabase"] });
```

On **every read** (`list` / `get` / `query`) the resolver fetches from **all** sources and merges them — this is a **read-time query merge, NOT a sync** (nothing is written back). The four steps, in order:

1. **UNION** — every row from every source is a candidate.
2. **DEDUP by `key`** — rows sharing the resource's `key` collapse to **ONE** record. _Worked example (proven in tests): Airtable = 5 rows, Supabase = 10 rows; if 4 Airtable rows share a key with Supabase rows, the merged result is **11** records (15 union − 4 collapsed), not 15._
3. **CONSOLIDATE fields** — a merged record's fields = the **union of fields across all sources** for that key. A field set by _any_ source appears on the result (some fields from Airtable, others from Supabase → one consolidated record).
4. **CONFLICT** — when the **same** field is present in **>1** source for the same keyed record, the **LAST-listed source in the config WINS** (last-write-wins by config order). A _later_ source's `undefined` does **not** clobber an earlier real value (a missing field ≠ an intentional clear).

So **precedence within a merge is LAST-SOURCE-WINS** — order the most authoritative source **last**. With `["airtable", "supabase"]`, Supabase (durable) wins any field both set, while Airtable still contributes any curator-only field Supabase lacks.

**Write routing (explicit + safe).** A merge has no "write to all". `create` / `update` / `delete` route to a **single designated source**: `writeTo` if supplied, otherwise the **last** source in `sources` (the conflict winner — i.e. what a subsequent read reflects). The plan surfaces this as `ResolvedPlan.writeProvider`. To keep curation writes flowing to Airtable while still reading the merged view, pass it explicitly:

```ts
registry.bindMerge("tickets", ["airtable", "supabase"], "airtable"); // reads merge; writes → Airtable.
```

`ResolvedPlan` gains two **optional** fields for a merge plan (absent on single-source plans): `mergeSources` (the ordered providers) and `writeProvider` (the write sink). `plan.base` is the **last** source so a non-merge-aware caller still sees a single "the" provider. Proven green in **`src/__tests__/merge.test.ts`** (union count · the exact 5 + 10 → 11 dedup · field consolidation · last-source-wins on a field conflict · write routing · a real Airtable + Supabase adapter merge).

**Query semantics — filter-then-merge.** `query({ where })` pushes the filter down to **every** source, then unions/dedups/consolidates the survivors (cheap, and correct for the crossover model where the sources hold progressively-complete copies of the **same** rows). The one caveat: if a key passes the `where` in only **one** source, only that source contributes to the merged record — the other source's fields for that key are **not** consolidated in, because that source filtered the row out before the merge saw it. So **cross-source field-completion under a `where` on a field that diverges between the sources** is a known limitation. It does not affect the crossover use (filter on stable identity/status fields, or read unfiltered and filter in the consumer); the alternative — merge-then-filter — would force every source to return its full table on every query and is intentionally not the default. `list()`/`get()` are unaffected (no filter). _`get(key)` fetches the keyed row from each source and consolidates the ≤1-per-source hits, so a partial-by-source `get` still consolidates fields across whichever sources hold that key._

### 4. Reconciliation — drift report + promote

- **`driftReport(registry, resource, fromAdapter, toAdapter)`** compares the _same_ resource across two Levels along three dimensions — **SCHEMA** (fields present in one Level, missing in the other), **ROWS** (`key` values present in one, missing in the other), **VALUES** (per-`(key, field)` differences on rows present in both) — with the **baseline = the resource's `sourceOfTruth` Level**. Returns `{ schema, rows, values, inSync }`.
- **`promote(registry, resource, opts)`** turns a **proven L2 shape into an L3 Supabase migration** (DDL from the contract field schema + a `user_id` column + RLS `user_id = auth.uid()` + `updated_at` trigger + an **optional** backfill `INSERT` of current L2 rows) **for human approval**. It returns **SQL text only — nothing is ever executed.** A human reviews and runs the migration.

---

## Worked example — `tickets` + `features` (the Tier-B proof)

The core capability this package proves: **mixed per-entity sources** — some resources from Supabase, others from Airtable, _simultaneously_. Two illustrative resources demonstrate it (real ids replaced with placeholders — swap in your own base):

- **`tickets`** — one ticket = one card = one unit of work. `sourceOfTruth: L2` (curated in Airtable by default), but **bound to Supabase (Tier B)** in the demo.
- **`features`** — a product-map feature node (name, level, status, JTBD, parent). **Stays on Airtable** (Tier A default).

```ts
const registry = new Registry()
  .register(ticketsContract)
  .register(featuresContract)
  .useAdapter(airtableAdapter)
  .useAdapter(supabaseAdapter)
  .setEnvironmentDefault("airtable") // everything defaults to Airtable…
  .bindResource("tickets", "supabase"); // …except tickets → Supabase.

const data = new Switchboard(registry);
await data.resource("tickets").list(); // ← from SUPABASE  (Tier B)
await data.resource("features").list(); // ← from AIRTABLE (Tier A)
```

This is proven green in **`src/__tests__/mixed-source.test.ts`** — one `Switchboard` instance serving two resources from two different backends at once, with writes routing to each resource's own provider.

---

## Build phases — what is full vs stubbed

| Piece                                                                                                        | Status in this package                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry + Adapter interface + `bind()` (A/B/C)                                                              | **Full**                                                                                                                                                                                                                             |
| CodeAdapter (L1)                                                                                             | **Full** (read + write)                                                                                                                                                                                                              |
| AirtableAdapter (L2) — field IDs, returnFieldsByFieldId, TTL cache, capped-429 retry, stale-while-error      | **Full**                                                                                                                                                                                                                              |
| Tier A + Tier B resolution                                                                                   | **Full** (precedence + mixed-source proven)                                                                                                                                                                                          |
| SupabaseAdapter (L3)                                                                                         | **Full** (RLS user_id=auth.uid(); structural client)                                                                                                                                                                                 |
| Reconciler — `driftReport` (schema + rows + values)                                                          | **Full**                                                                                                                                                                                                                              |
| **Tier C field federation** (fetch-once, merge by `key`)                                                     | **Full** for reads (`bindFields` + resolver merge) **and writes**: create/update/delete FAN OUT — each field routes to its owning provider, keyed by the shared `key`; tested in `federated-writes.test.ts`.                        |
| **Tier B multi-source MERGE** (`bindMerge`; read-time union → dedup-by-key → consolidate → last-source-wins) | **Full** for reads (`list`/`get`/`query`), tested incl. the 5 + 10 → 11 case. Writes route to one designated source (`writeTo` ?? last) — a merge is read-time, never write-to-all.                                                 |
| **`promote`** (L2→L3 migration generation: DDL + RLS + trigger + optional backfill)                          | **Functional generator** (emits reviewable SQL text; never executes). Live-backfill `user_id` assignment per row is left to the operator by design — flagged inline in the generated SQL.                                          |
| NotionAdapter (L2)                                                                                           | **Full** — database query + cursor pagination, property encode/decode (title/rich_text/number/checkbox/select/multi_select/date/url), TTL cache, capped-429 retry, stale-while-error, archive-on-delete, introspective `describe()`. |
| GitdataAdapter (L2)                                                                                          | **Full** — markdown-frontmatter rows under a data root; Node/Deno filesystem only.                                                                                                                                                    |
| **Wholesale / zero-config `describe()`** (introspect schema from live DATA)                                  | **Full** — `introspectFields` derives the schema from actual rows (adding a field needs NO contract edit); makes schema drift detectable.                                                                                          |
| **`reconcileModel`** (model-level reconcile across two Levels)                                               | **Full** — runs `driftReport` for every registered resource, records one-sided resources as MISSING, rolls up a model verdict.                                                                                                      |
| Live `information_schema` describe for richer L3 drift                                                       | **Superseded** by data-introspection (`describe()` derives schema from live rows). A dedicated catalog probe — to surface a _declared-but-unpopulated_ column — remains a later enrichment.                                        |

---

## Cross-runtime + dependencies

- **Runtimes:** Node 18+, Deno, React Native. No Node-only built-ins are imported at the root (the gitdata adapter is Node-only and ships at its own `./gitdata` subpath); networking is an injectable `FetchLike` (defaults to global `fetch`).
- **Deps:** `fetch` (built-in/injected) + an **optional** `@supabase/supabase-js` _peer_ (only needed if you build a real Supabase client to hand the adapter; the adapter itself is typed structurally). Dev-only: `tsup`, `vitest`, `typescript`.
- **Build:** `tsup` → ESM + CJS + `.d.ts`. **Test:** `vitest` (Node env). **Typecheck:** `tsc --noEmit`.

```bash
pnpm --filter @marktiderman/genesis-switchboard typecheck
pnpm --filter @marktiderman/genesis-switchboard build
pnpm --filter @marktiderman/genesis-switchboard test
```

---

## Security / access invariants

- **RLS keyed on `user_id = auth.uid()` only.** `promote()`-generated DDL gates access on `user_id = (SELECT auth.uid())` (the initplan-cached pattern). `org_id` is **never** an access principal anywhere — it is intentionally absent from the generator.
- **Modern Supabase keys only.** Legacy JWT-style anon/service-role keys are disabled; the adapter accepts a client built with publishable/secret keys.
- **No migration is applied to prod by this package.** `promote()` output is a **file** for human review; nothing here touches a remote Supabase project.
- **No secrets live in this package.** Credentials (Airtable API key, Supabase client) are always injected by the caller — see `src/switchboard.config.sample.ts`.

---

## Follow-ups

1. **Dedicated catalog (`information_schema`) probe** for L3 to surface a _declared-but-unpopulated_ column that data-introspection alone cannot see (introspection from live rows covers the populated case).
2. **Airtable ↔ Supabase backfill helper** that assigns `user_id` per row during promotion (the one operator step the generator deliberately leaves manual).
