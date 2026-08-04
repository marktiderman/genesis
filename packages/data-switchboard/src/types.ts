// =====================================================================
// @marktiderman/genesis-switchboard — core types
//
// The Switchboard is Genesis's pluggable data layer, built as a SHARED,
// cross-runtime framework (Node + Deno + RN). It models
// TWO INDEPENDENT AXES that COMPOSE:
//
//   • LEVELS  — HOW a resource is backed (persistence + governance).
//   • TIERS   — AT WHAT GRANULARITY you choose the backing.
//
// Nothing in the app knows where data lives; it asks the registry-backed
// client (`data.resource('x').list()`) and the resolver figures out which
// provider(s) serve it. See SWITCHBOARD.md for the full design.
// =====================================================================

// ---------------------------------------------------------------------
// LEVELS — HOW a resource is backed (persistence + governance).
// Cost-of-change + durability rise L1 → L3.
// ---------------------------------------------------------------------
export type Level =
  | "L1" // Code     — in-code fixtures; ephemeral, instant.
  | "L2" // Middle   — Airtable, Notion; persistent, human-editable, NO migration.
  | "L3"; // Production — Supabase, Mongo later; durable, migration-governed.

export const LEVELS: readonly Level[] = ["L1", "L2", "L3"] as const;

/** Human-facing label for a Level (docs / drift reports). */
export const LEVEL_LABEL: Record<Level, string> = {
  L1: "Code",
  L2: "Middle",
  L3: "Production",
};

// ---------------------------------------------------------------------
// TIERS — AT WHAT GRANULARITY you choose the backing.
// Resolution precedence: C > B > A. The registry resolves, per-resource
// and per-field, which provider serves it.
// ---------------------------------------------------------------------
export type Tier =
  | "A" // Environment — one default provider for ALL resources in an env.
  | "B" // Resource    — override ONE resource (e.g. `features` from Airtable).
  | "C"; // Field       — compose ONE resource's fields from multiple providers.

// ---------------------------------------------------------------------
// FIELD SCHEMA — the provider-agnostic contract for a resource's columns.
// ---------------------------------------------------------------------
export type FieldType = "string" | "number" | "boolean" | "datetime" | "json" | "relation";

export interface FieldSchema {
  /** Canonical field name in the resource's shape (provider-agnostic). */
  readonly name: string;
  readonly type: FieldType;
  /** True when a row may omit this field. */
  readonly optional?: boolean;
  /**
   * True when the field holds an ORDERED LIST of `type` values (e.g. a
   * multi-relation like `deps`/`serves`). Promotion emits a Postgres ARRAY
   * column (`<base>[]`) instead of a lossy scalar, so the cardinality survives
   * L1→L3 (CMT-1742-014).
   */
  readonly array?: boolean;
  /** Human note (surfaces in describe()/drift reports). */
  readonly description?: string;
}

// ---------------------------------------------------------------------
// PROVIDER — a concrete backing for some/all of a resource. Each provider
// is realized by exactly one Adapter and sits at exactly one Level.
// ---------------------------------------------------------------------
export type ProviderKind = "code" | "airtable" | "supabase" | "notion" | "gitdata" | "jsonb";

export const PROVIDER_LEVEL: Record<ProviderKind, Level> = {
  code: "L1",
  airtable: "L2",
  notion: "L2",
  /** Git-backed markdown tables under `data/` (docs-as-data / GITDATA). */
  gitdata: "L2",
  supabase: "L3",
  /**
   * A JSONB blob column in a durable Supabase table, serving many logical
   * resources out of one physical table with no per-resource DDL — same
   * "persistent, human/app-editable, NO migration" shape as Airtable/Notion,
   * just Postgres-backed instead of a third-party API. L2, not L3: promoting
   * a resource off this into its own typed, migration-governed table is
   * exactly the L2→L3 `promote()` path this package already models.
   */
  jsonb: "L2",
};

// ---------------------------------------------------------------------
// RESOURCE CONTRACT — one declaration of every Resource:
//   • its provider-agnostic field schema + identity `key`,
//   • its sourceOfTruth Level (the drift baseline),
//   • (bindings live in the Registry, not here — see Binding below).
// The app reads this; nothing else knows where data lives.
// ---------------------------------------------------------------------
export interface ResourceContract<Row extends DataRow = DataRow> {
  /** Resource name the app addresses, e.g. "tickets". */
  readonly name: string;
  /**
   * Identity field name. Tier C is a field-level JOIN keyed on this — every
   * contributing provider MUST surface the same `key` value per row.
   *
   * Typed `string` (not `keyof Row & string`) on purpose: `keyof Row` is a
   * dependent type that TypeScript checks contravariantly, which would make
   * `ResourceContract<WorkCycleRow>` non-assignable to the erased
   * `ResourceContract<DataRow>` the adapters/registry accept. The key is
   * validated against the field schema at runtime instead.
   */
  readonly key: string;
  readonly fields: readonly FieldSchema[];
  /** Baseline Level for reconciliation/drift. */
  readonly sourceOfTruth: Level;
  /** Optional doc string (jobs-to-be-done, surfaced in SWITCHBOARD.md). */
  readonly description?: string;
  /** Phantom marker so `Row` is inferable from a contract. */
  readonly __row?: Row;
}

/** A canonical, provider-agnostic row. Keys are field names from the schema. */
export type DataRow = Record<string, unknown>;

// ---------------------------------------------------------------------
// BINDINGS — Tier A/B/C declarations attached in the Registry.
//
//   Tier A (environment): default provider for ALL resources in an env.
//   Tier B (resource):    override ONE resource to a single provider, OR to
//                         an ORDERED LIST of providers that READ-TIME MERGE.
//   Tier C (field):       compose ONE resource's fields from MANY providers,
//                         joined by the resource `key`.
//
// Resolution precedence is C > B > A. The merge variant is a Tier-B binding
// (it overrides ONE resource), so it sits at the same precedence rung as a
// single-provider resource binding — see MergeBinding below.
// ---------------------------------------------------------------------

/** Tier A — one default provider for an environment. */
export interface EnvironmentBinding {
  readonly tier: "A";
  readonly provider: ProviderKind;
}

/** Tier B — override a single resource to a single provider. */
export interface ResourceBinding {
  readonly tier: "B";
  readonly resource: string;
  readonly provider: ProviderKind;
}

/**
 * Tier B (MERGE variant) — bind ONE resource to an ORDERED LIST of providers
 * that are MERGED at read time (a realtime read-time QUERY merge, NOT a sync).
 * On every read the resolver fetches from ALL `sources`, then:
 *
 *   1. UNION         — concatenate rows from every source.
 *   2. DEDUP by key  — rows sharing the resource `key` collapse to ONE record
 *                      (5 rows + 10 rows with 4 shared keys ⇒ 11 records).
 *   3. CONSOLIDATE   — a merged record's fields = the UNION of fields across
 *                      every source for that key (a field present in any source
 *                      appears on the result — some from one source, some from
 *                      another, joined into one consolidated record).
 *   4. CONFLICT      — when the SAME field is present in >1 source for the same
 *                      keyed record, the LAST-listed source in `sources` WINS
 *                      (last-write-wins by config order).
 *
 * WRITE ROUTING: a merge is read-time only — there is NO "write to all". Writes
 * (create/update/delete) route to a single designated source: `writeTo` if set,
 * else the LAST source in `sources` (the conflict winner — i.e. what a read
 * reflects after the write). The resolver surfaces this as
 * `ResolvedPlan.writeProvider`.
 */
export interface MergeBinding {
  readonly tier: "B";
  readonly merge: true;
  readonly resource: string;
  /**
   * Ordered providers to merge. Field-CONFLICT precedence is LAST-WINS, so the
   * most-authoritative source goes LAST. MUST contain ≥1 provider; a
   * single-element list is a (degenerate) straight passthrough.
   */
  readonly sources: readonly ProviderKind[];
  /**
   * Provider that receives writes. Defaults to the LAST entry of `sources`.
   * MUST be one of `sources` (validated at bind time).
   */
  readonly writeTo?: ProviderKind;
}

/**
 * Tier C — federate ONE resource's fields across providers. The base
 * provider supplies row identity + any field not claimed by an override;
 * each `fields` entry routes specific field names to another provider.
 */
export interface FieldBinding {
  readonly tier: "C";
  readonly resource: string;
  /** Provider that owns row identity + unclaimed fields. */
  readonly base: ProviderKind;
  /** field-name → provider that serves that field. */
  readonly fields: Readonly<Record<string, ProviderKind>>;
}

export type Binding = EnvironmentBinding | ResourceBinding | MergeBinding | FieldBinding;

/** Narrow a binding to the Tier-B MERGE (multi-source) variant. */
export function isMergeBinding(binding: Binding): binding is MergeBinding {
  // `merge` is the discriminant between the two Tier-B shapes (single ResourceBinding
  // vs. multi-source MergeBinding); the `in` check narrows without a cast.
  return binding.tier === "B" && "merge" in binding && binding.merge === true;
}

// ---------------------------------------------------------------------
// QUERY — provider-agnostic list/query options.
// ---------------------------------------------------------------------
export interface QueryOptions {
  /** Equality filters on canonical field names. */
  readonly where?: Readonly<Record<string, unknown>>;
  /**
   * Membership filters — field name → allowed values (an OR/IN filter per
   * field). ANDed together with `where` and with each other, same as `where`.
   */
  readonly whereIn?: Readonly<Record<string, readonly unknown[]>>;
  readonly limit?: number;
  /**
   * Rows to skip before applying `limit`. Requires `limit` to also be set —
   * an unbounded "skip N, take the rest" is not a supported shape; pair it
   * with `orderBy` for a stable page over rows that may otherwise reorder
   * between reads.
   */
  readonly offset?: number;
  readonly orderBy?: string;
  readonly direction?: "asc" | "desc";
}

// ---------------------------------------------------------------------
// DESCRIBE — schema as reported live by a provider (drives drift).
// ---------------------------------------------------------------------
export interface DescribeResult {
  readonly resource: string;
  readonly provider: ProviderKind;
  readonly level: Level;
  readonly fields: readonly FieldSchema[];
}

// ---------------------------------------------------------------------
// PROVIDER RESOLUTION — what the resolver computed for a resource: which
// provider serves the whole row (A/B), which fields are federated (C), and —
// for a Tier-B merge — which ordered sources read-time MERGE and where writes
// route.
// ---------------------------------------------------------------------
export interface ResolvedPlan {
  readonly resource: string;
  /**
   * Provider that supplies row identity + all non-federated fields. For a merge
   * plan this is the LAST source (the conflict winner) — the single provider a
   * non-merge-aware caller would treat as "the" backing.
   */
  readonly base: ProviderKind;
  readonly baseTier: Tier;
  /** field-name → provider, for Tier-C federated fields only. */
  readonly federated: Readonly<Record<string, ProviderKind>>;
  /**
   * Ordered merge sources, for a Tier-B MERGE plan only (undefined otherwise).
   * Reads UNION → DEDUP by key → CONSOLIDATE fields → LAST-source-wins on a
   * field conflict.
   */
  readonly mergeSources?: readonly ProviderKind[];
  /**
   * Provider that receives writes for a MERGE plan (the designated write sink).
   * Undefined for non-merge plans (writes target `base`).
   */
  readonly writeProvider?: ProviderKind;
}
