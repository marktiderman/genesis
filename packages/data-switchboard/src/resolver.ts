// =====================================================================
// Resolver — the data client the app actually calls.
//
//   data.resource('tickets').list()  →  canonical rows, Level-agnostic.
//
// It asks the Registry which provider(s) serve a resource (precedence
// C > B > A), then:
//   • Tier A / B (single) — one provider serves the whole row. Passthrough.
//   • Tier B (MERGE)      — MULTI-SOURCE READ-TIME MERGE: an ordered list of
//                   providers (e.g. ["airtable","supabase"]). On EVERY read the
//                   resolver fetches from ALL sources, then UNIONs the rows,
//                   DEDUPs by the resource `key` (rows sharing a key collapse to
//                   ONE), CONSOLIDATEs fields (a merged record's fields = the
//                   union of fields across all sources for that key), and on a
//                   field CONFLICT the LAST-listed source WINS. This is a read-
//                   time QUERY merge, NOT a sync — nothing is written back.
//   • Tier C      — FIELD FEDERATION: the base provider supplies row identity
//                   + unclaimed fields; each federated field is pulled from
//                   another provider. The resolver FETCHES EACH CONTRIBUTING
//                   PROVIDER ONCE (a `list()` per provider, not per row) and
//                   MERGES by the resource `key` into the canonical shape.
//                   Tier C is a field-level JOIN and therefore REQUIRES a
//                   shared identity key across the contributing providers.
//
// WRITES: a single-source plan writes to its BASE provider; a MERGE plan writes
// to the designated `writeProvider` (writeTo, else the last/winning source) —
// there is NO write-to-all. A Tier-C plan FANS OUT a write (WC46.016): each
// field's new value routes to the provider that OWNS it (base for identity +
// unclaimed fields, each federated field to its owner), keyed by the shared
// identity `key`; the consolidated row is re-read through the federation.
// =====================================================================

import type { Adapter } from "./adapters/adapter";
import { asWritable } from "./adapters/adapter";
import type { Registry } from "./registry";
import type { DataRow, ProviderKind, QueryOptions, ResolvedPlan, ResourceContract } from "./types";

/** Per-resource handle the app holds. */
export interface ResourceClient<Row extends DataRow = DataRow> {
  list(): Promise<Row[]>;
  get(key: string): Promise<Row | null>;
  query(opts: QueryOptions): Promise<Row[]>;
  create(row: Row): Promise<Row>;
  update(key: string, patch: Partial<Row>): Promise<Row>;
  delete(key: string): Promise<void>;
  /** The resolution plan in effect (which provider serves what). */
  plan(): ResolvedPlan;
}

export class Switchboard {
  constructor(private readonly registry: Registry) {}

  /** Get the Level-agnostic client for a resource. */
  resource<Row extends DataRow = DataRow>(name: string): ResourceClient<Row> {
    const contract = this.registry.getContract(name);
    const self = this;
    return {
      plan: () => self.registry.resolve(name),
      list: () => self.list(contract) as Promise<Row[]>,
      get: (key) => self.get(contract, key) as Promise<Row | null>,
      query: (opts) => self.query(contract, opts) as Promise<Row[]>,
      create: (row) => self.create(contract, row) as Promise<Row>,
      update: (key, patch) => self.update(contract, key, patch) as Promise<Row>,
      delete: (key) => self.delete(contract, key),
    };
  }

  // -- reads -----------------------------------------------------------

  private async list(contract: ResourceContract): Promise<DataRow[]> {
    const plan = this.registry.resolve(contract.name);
    if (plan.mergeSources) {
      const perSource = await Promise.all(plan.mergeSources.map((p) => this.registry.getAdapter(p).list(contract)));
      return this.mergeSources(contract, perSource);
    }
    const base = this.registry.getAdapter(plan.base);
    const rows = await base.list(contract);
    return this.federate(contract, plan, rows);
  }

  private async get(contract: ResourceContract, key: string): Promise<DataRow | null> {
    const plan = this.registry.resolve(contract.name);
    if (plan.mergeSources) {
      // Ask each source for the keyed row; consolidate the (≤1-per-source) hits.
      const hits = await Promise.all(plan.mergeSources.map((p) => this.registry.getAdapter(p).get(contract, key)));
      const present = hits.filter((r): r is DataRow => r != null);
      if (present.length === 0) return null;
      // Each surviving hit came from a DISTINCT source, still in `mergeSources`
      // order (Promise.all preserves order; filter keeps it). Feed them one row
      // PER source array so mergeSources' per-source loop applies last-source-wins
      // structurally — identical semantics to list()/query(), not reliant on the
      // ordering of a single flattened array.
      const [merged] = this.mergeSources(
        contract,
        present.map((row) => [row]),
      );
      return merged ?? null;
    }
    const base = this.registry.getAdapter(plan.base);
    const row = await base.get(contract, key);
    if (!row) return null;
    const [merged] = await this.federate(contract, plan, [row]);
    return merged ?? row;
  }

  private async query(contract: ResourceContract, opts: QueryOptions): Promise<DataRow[]> {
    const plan = this.registry.resolve(contract.name);
    if (plan.mergeSources) {
      // FILTER-THEN-MERGE: push the `where` down to EVERY source, then union +
      // dedup + consolidate the survivors. This is cheap (each source returns
      // only matches) and correct for the crossover model, where the sources
      // hold progressively-complete copies of the SAME rows. Caveat: if a key
      // matches the filter in only ONE source, only that source contributes —
      // the other source's fields for that key are NOT consolidated in (it
      // filtered the row out before the merge saw it). Cross-source field-
      // completion under a `where` on a field that diverges between sources is a
      // documented limitation (SWITCHBOARD.md §3a "Query semantics").
      const perSource = await Promise.all(
        plan.mergeSources.map((p) => this.registry.getAdapter(p).query(contract, opts)),
      );
      return this.mergeSources(contract, perSource);
    }
    const base = this.registry.getAdapter(plan.base);
    const rows = await base.query(contract, opts);
    return this.federate(contract, plan, rows);
  }

  // -- Tier C field federation ----------------------------------------

  /**
   * Merge federated fields into base rows. Fetches EACH federated provider
   * exactly ONCE (one list() call), indexes its rows by `key`, then copies the
   * claimed field values onto the matching base rows. No-op for Tier A/B
   * (empty `federated`).
   */
  private async federate(contract: ResourceContract, plan: ResolvedPlan, baseRows: DataRow[]): Promise<DataRow[]> {
    const federatedFields = Object.entries(plan.federated);
    if (federatedFields.length === 0) return baseRows;

    // Group fields by their owning provider so we fetch each provider once.
    const fieldsByProvider = new Map<ProviderKind, string[]>();
    for (const [field, provider] of federatedFields) {
      if (provider === plan.base) continue; // base already supplied it.
      const list = fieldsByProvider.get(provider) ?? [];
      list.push(field);
      fieldsByProvider.set(provider, list);
    }

    // One list() per contributing provider, indexed by the shared `key`.
    const indexByProvider = new Map<ProviderKind, Map<string, DataRow>>();
    await Promise.all(
      [...fieldsByProvider.keys()].map(async (provider) => {
        const adapter = this.registry.getAdapter(provider);
        const rows = await adapter.list(contract);
        const idx = new Map<string, DataRow>();
        for (const r of rows) idx.set(String(r[contract.key]), r);
        indexByProvider.set(provider, idx);
      }),
    );

    // Merge: copy each claimed field from its provider's matching row.
    return baseRows.map((baseRow) => {
      const id = String(baseRow[contract.key]);
      const merged: DataRow = { ...baseRow };
      for (const [provider, fields] of fieldsByProvider) {
        const contributor = indexByProvider.get(provider)?.get(id);
        if (!contributor) {
          // NO contributor ROW for this key — a JOIN miss. The federated field
          // is genuinely unresolved, so it MUST resolve to undefined (the base
          // provider's value must NOT leak through a field it doesn't own). But
          // we LOG it: a silent undefined hides a broken join / missing upstream
          // row and compounds a stale read (CMT-1742-011, compounds -002). This
          // is distinct from "row present, field absent" (handled below, where
          // `contributor[field]` is a legitimate absence, not a join failure).
          // eslint-disable-next-line no-console -- unresolved-federation observability is required.
          console.warn(
            `[data-switchboard] federate: ${contract.name} ${contract.key}="${id}" has NO "${provider}" ` +
              `contributor row — federated field(s) [${fields.join(", ")}] resolve to undefined (JOIN miss).`,
          );
          for (const field of fields) merged[field] = undefined;
          continue;
        }
        // Row present: copy each field. `contributor[field] === undefined` here
        // means the field is legitimately absent on an existing row (not a miss).
        for (const field of fields) merged[field] = contributor[field];
      }
      return merged;
    });
  }

  // -- Tier B multi-source merge (read-time) ---------------------------

  /**
   * The read-time merge engine. Given rows fetched from each ordered source
   * (`perSource[i]` came from `mergeSources[i]`), produce the merged set:
   *
   *   1. UNION       — every row from every source is a candidate.
   *   2. DEDUP by key — rows sharing `contract.key` collapse to ONE record,
   *                     keyed insertion-order-stable (first key seen wins slot).
   *   3. CONSOLIDATE — a record's fields = the union of fields across all
   *                     sources for that key (a field set by ANY source appears).
   *   4. CONFLICT    — sources are applied in LIST ORDER, so a LATER source's
   *                     value for the same field OVERWRITES an earlier one
   *                     (LAST-listed source wins). `undefined` from a later
   *                     source does NOT clobber an earlier real value.
   *
   * Worked example: source A = 5 rows, source B = 10 rows, 4 of A's keys also
   * appear in B ⇒ 15 candidates − 4 collapsed = 11 records.
   */
  private mergeSources(contract: ResourceContract, perSource: readonly DataRow[][]): DataRow[] {
    const key = contract.key;
    // Insertion-ordered map preserves first-seen key order for a stable result.
    const merged = new Map<string, DataRow>();
    for (const rows of perSource) {
      for (const row of rows) {
        const id = String(row[key]);
        const existing = merged.get(id);
        if (!existing) {
          merged.set(id, { ...row });
          continue;
        }
        // Consolidate: later source wins per-field, but never overwrites an
        // existing value with `undefined` (a missing field ≠ an intentional
        // clear). The key field is identical by construction.
        for (const [field, value] of Object.entries(row)) {
          if (value === undefined && existing[field] !== undefined) continue;
          existing[field] = value;
        }
      }
    }
    return [...merged.values()];
  }

  // -- writes (single-source: base; merge: the designated write sink) --

  private writableBase(
    contract: ResourceContract,
    op: "create" | "update" | "delete",
  ): { adapter: Adapter; plan: ResolvedPlan } {
    const plan = this.registry.resolve(contract.name);
    // Merge plans route writes to writeProvider (writeTo ?? last source); single
    // plans write to base. There is no write-to-all — a merge is read-time only.
    const target = plan.writeProvider ?? plan.base;
    const adapter = this.registry.getAdapter(target);
    asWritable(adapter, op, contract.name); // throws ReadOnlyAdapterError if not.
    return { adapter, plan };
  }

  private async create(contract: ResourceContract, row: DataRow): Promise<DataRow> {
    const plan = this.registry.resolve(contract.name);
    if (this.isFederated(plan)) return this.federatedCreate(contract, plan, row);
    const { adapter } = this.writableBase(contract, "create");
    return adapter.create!(contract, row);
  }

  private async update(contract: ResourceContract, key: string, patch: Partial<DataRow>): Promise<DataRow> {
    const plan = this.registry.resolve(contract.name);
    if (this.isFederated(plan)) return this.federatedUpdate(contract, plan, key, patch);
    const { adapter } = this.writableBase(contract, "update");
    return adapter.update!(contract, key, patch);
  }

  private async delete(contract: ResourceContract, key: string): Promise<void> {
    const plan = this.registry.resolve(contract.name);
    if (this.isFederated(plan)) {
      await this.federatedDelete(contract, plan, key);
      return;
    }
    const { adapter } = this.writableBase(contract, "delete");
    await adapter.delete!(contract, key);
  }

  // -- Tier C federated WRITES (WC46.016) ------------------------------
  //
  // A Tier-C resource composes its row from MANY providers (base owns identity
  // + unclaimed fields; each federated field is owned by another provider). A
  // write must therefore FAN OUT: each field's new value is routed to the
  // provider that OWNS it, keyed by the shared identity `key`. (Pre-WC46.016
  // writes targeted only the base provider, silently dropping federated-field
  // edits — the documented Phase-3 gap.) The merged canonical row is returned
  // by re-reading through the federation (`get`), so every provider's
  // contribution is reflected, not just the slices we just wrote.
  //
  // ⚠️ NOT CROSS-PROVIDER ATOMIC — this is an EXPLICIT contract, not an
  // oversight. A federated write spans heterogeneous backends (Postgres,
  // Notion, Airtable, in-memory) that share no distributed-transaction
  // coordinator, so a true 2-phase commit is not achievable here. If a write
  // to a later provider fails, earlier providers' writes STAY committed and
  // the error is thrown — the resource can be left partially created/updated,
  // or partially deleted. A "best-effort rollback" is deliberately NOT added:
  // a compensating write can itself fail mid-undo, which would manufacture a
  // FALSE atomicity guarantee (worse than a loud, honest partial failure).
  // Callers MUST treat a thrown federated-write error as INDETERMINATE (the
  // write may be partially applied) and reconcile via `reconcileModel`/
  // `driftReport` or a retry of the same idempotent write. A durable
  // transactional-outbox / saga coordinator is tracked as future work for a
  // dedicated WC, gated on a real multi-provider consistency requirement.

  private isFederated(plan: ResolvedPlan): boolean {
    // Only true when ≥1 field is owned by a provider OTHER than the base.
    return Object.values(plan.federated).some((p) => p !== plan.base);
  }

  /** field-owner → its claimed field names (base-owned fields excluded). */
  private federatedTargets(plan: ResolvedPlan): Map<ProviderKind, string[]> {
    const byProvider = new Map<ProviderKind, string[]>();
    for (const [field, provider] of Object.entries(plan.federated)) {
      if (provider === plan.base) continue; // base already owns it.
      const list = byProvider.get(provider) ?? [];
      list.push(field);
      byProvider.set(provider, list);
    }
    return byProvider;
  }

  private async federatedCreate(contract: ResourceContract, plan: ResolvedPlan, row: DataRow): Promise<DataRow> {
    const targets = this.federatedTargets(plan);
    const federatedFields = new Set([...targets.values()].flat());

    // Base creates the identity row with every NON-federated field.
    const basePortion: DataRow = {};
    for (const [k, v] of Object.entries(row)) {
      if (!federatedFields.has(k)) basePortion[k] = v;
    }
    const baseAdapter = this.registry.getAdapter(plan.base);
    asWritable(baseAdapter, "create", contract.name);
    const created = await baseAdapter.create!(contract, basePortion);
    const keyValue = String(created[contract.key]);

    // Each federated provider stores a row carrying the SHARED key + its fields.
    await Promise.all(
      [...targets].map(async ([provider, fields]) => {
        const adapter = this.registry.getAdapter(provider);
        asWritable(adapter, "create", contract.name);
        const portion: DataRow = { [contract.key]: keyValue };
        for (const f of fields) if (f in row) portion[f] = row[f];
        await adapter.create!(contract, portion);
      }),
    );

    // Re-read through the federation so the result reflects every provider.
    const merged = await this.get(contract, keyValue);
    return merged ?? created;
  }

  private async federatedUpdate(
    contract: ResourceContract,
    plan: ResolvedPlan,
    key: string,
    patch: Partial<DataRow>,
  ): Promise<DataRow> {
    // The identity field is the federation join key; routing a new value only to
    // the base would strand contributor rows under the old key and break the
    // post-update re-read. Reject it outright rather than partially committing.
    if (contract.key in patch) {
      throw new Error(
        `Switchboard: federated update cannot change identity field "${contract.key}" for "${contract.name}".`,
      );
    }

    const targets = this.federatedTargets(plan);
    const federatedFields = new Set([...targets.values()].flat());

    // Route the patch: base-owned fields → base; each federated field → its owner.
    const basePatch: Partial<DataRow> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!federatedFields.has(k)) basePatch[k] = v;
    }
    if (Object.keys(basePatch).length > 0) {
      const baseAdapter = this.registry.getAdapter(plan.base);
      asWritable(baseAdapter, "update", contract.name);
      await baseAdapter.update!(contract, key, basePatch);
    }

    await Promise.all(
      [...targets].map(async ([provider, fields]) => {
        const providerPatch: Partial<DataRow> = {};
        for (const f of fields) if (f in patch) providerPatch[f] = patch[f];
        if (Object.keys(providerPatch).length === 0) return; // nothing for this owner.
        const adapter = this.registry.getAdapter(provider);
        asWritable(adapter, "update", contract.name);
        await adapter.update!(contract, key, providerPatch);
      }),
    );

    // Re-read through the federation for the complete, consolidated row.
    const merged = await this.get(contract, key);
    if (!merged) {
      throw new Error(
        `Switchboard: federated update of "${contract.name}" ${contract.key}="${key}" ` +
          `left no readable row (the base provider has no such row).`,
      );
    }
    return merged;
  }

  private async federatedDelete(contract: ResourceContract, plan: ResolvedPlan, key: string): Promise<void> {
    const targets = this.federatedTargets(plan);
    // Delete the keyed row from the base AND every federated field-owner, so a
    // Tier-C entity leaves no orphaned field rows behind in a contributor.
    const baseAdapter = this.registry.getAdapter(plan.base);
    asWritable(baseAdapter, "delete", contract.name);
    await baseAdapter.delete!(contract, key);
    await Promise.all(
      [...targets.keys()].map(async (provider) => {
        const adapter = this.registry.getAdapter(provider);
        asWritable(adapter, "delete", contract.name);
        await adapter.delete!(contract, key);
      }),
    );
  }
}
