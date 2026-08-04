// =====================================================================
// SupabaseAdapter — Level L3 (Production).
//
// Durable, migration-governed Postgres. This is where a proven L2 shape
// lands once it's promoted (DDL + RLS). Access is ALWAYS through RLS keyed
// on `user_id = auth.uid()` (root CLAUDE.md §1 — org_id is metadata, never
// an access principal); this adapter NEVER filters by org_id and uses the
// modern publishable/secret key format only.
//
// We accept a pre-built supabase-js client (the app owns auth/session). The
// adapter only needs `.from(table)` query-builder semantics, so it is typed
// against a minimal structural interface — keeping the package importable in
// Node, Deno, and RN without forcing a specific @supabase/supabase-js major.
// =====================================================================

import type { Adapter } from "./adapter";
import { UnknownResourceError } from "./adapter";
import { introspectFields } from "../introspect";
import type { DataRow, DescribeResult, Level, ProviderKind, QueryOptions, ResourceContract } from "../types";

/** Minimal structural shape of the supabase-js query builder we rely on. */
export interface SupabaseQueryBuilder {
  select(columns?: string): SupabaseQueryBuilder;
  insert(values: Record<string, unknown>): SupabaseQueryBuilder;
  update(values: Record<string, unknown>): SupabaseQueryBuilder;
  delete(): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  in(column: string, values: readonly unknown[]): SupabaseQueryBuilder;
  order(column: string, opts?: { ascending?: boolean }): SupabaseQueryBuilder;
  limit(count: number): SupabaseQueryBuilder;
  /** Inclusive [from, to] window — the offset+limit primitive together. */
  range(from: number, to: number): SupabaseQueryBuilder;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
  single(): Promise<{ data: unknown; error: unknown }>;
  then<R>(onfulfilled: (value: { data: unknown; error: unknown }) => R): Promise<R>;
}

export interface SupabaseClientLike {
  from(table: string): SupabaseQueryBuilder;
}

export interface SupabaseResourceMap {
  /** Postgres table name (schema public). */
  readonly table: string;
  /**
   * Optional canonical-name → column-name remap. Omit for 1:1 (the common
   * case — canonical names already match column names).
   */
  readonly columns?: Readonly<Record<string, string>>;
  /**
   * Optional equality filters applied to READ paths (`list`/`get`/`query`)
   * only — a map of **db-column → value** chained as `.eq(column, value)`.
   * Use it to scope a logical resource to one slice of a SHARED physical table
   * (e.g. two resources backed by the same table, one product-scoped and one
   * not). Applied to all paths — reads AND writes — so mutations cannot escape
   * the resource slice.
   */
  readonly filter?: Readonly<Record<string, string>>;
}

export interface SupabaseAdapterConfig {
  readonly client: SupabaseClientLike;
  readonly maps: Readonly<Record<string, SupabaseResourceMap>>;
}

function isPgError(error: unknown): error is { message: string; code?: string } {
  return typeof error === "object" && error !== null && "message" in error;
}

export class SupabaseAdapter implements Adapter {
  readonly kind: ProviderKind = "supabase";
  readonly level: Level = "L3";

  constructor(private readonly cfg: SupabaseAdapterConfig) {}

  private map(contract: ResourceContract): SupabaseResourceMap {
    const m = this.cfg.maps[contract.name];
    if (!m) throw new UnknownResourceError(this.kind, contract.name);
    return m;
  }

  /** canonical field name → db column name (identity unless remapped). */
  private col(map: SupabaseResourceMap, name: string): string {
    return map.columns?.[name] ?? name;
  }

  /** Chain the map's read-path equality filters (db-column → value) onto a qb. */
  private withFilter(qb: SupabaseQueryBuilder, map: SupabaseResourceMap): SupabaseQueryBuilder {
    if (!map.filter) return qb;
    let out = qb;
    for (const [column, value] of Object.entries(map.filter)) out = out.eq(column, value);
    return out;
  }

  /** db row → canonical row (reverse the column remap). */
  private toCanonical(map: SupabaseResourceMap, dbRow: DataRow): DataRow {
    if (!map.columns) return { ...dbRow };
    const reverse: Record<string, string> = {};
    for (const [name, column] of Object.entries(map.columns)) {
      reverse[column] = name;
    }
    const out: DataRow = {};
    for (const [column, value] of Object.entries(dbRow)) {
      out[reverse[column] ?? column] = value;
    }
    return out;
  }

  /** canonical row → db row (apply the column remap). */
  private toDbRow(map: SupabaseResourceMap, row: Partial<DataRow>): DataRow {
    if (!map.columns) return { ...row };
    const out: DataRow = {};
    for (const [name, value] of Object.entries(row)) {
      out[this.col(map, name)] = value;
    }
    return out;
  }

  async list(contract: ResourceContract): Promise<DataRow[]> {
    const map = this.map(contract);
    const { data, error } = await this.withFilter(this.cfg.client.from(map.table).select("*"), map).then((r) => r);
    if (error) throw this.wrap(error, "list", contract.name);
    return ((data as DataRow[] | null) ?? []).map((r) => this.toCanonical(map, r));
  }

  async get(contract: ResourceContract, key: string): Promise<DataRow | null> {
    const map = this.map(contract);
    const { data, error } = await this.withFilter(this.cfg.client.from(map.table).select("*"), map)
      .eq(this.col(map, contract.key), key)
      .maybeSingle();
    if (error) throw this.wrap(error, "get", contract.name);
    return data ? this.toCanonical(map, data as DataRow) : null;
  }

  async query(contract: ResourceContract, opts: QueryOptions): Promise<DataRow[]> {
    const map = this.map(contract);
    let qb = this.withFilter(this.cfg.client.from(map.table).select("*"), map);
    if (opts.where) {
      for (const [k, v] of Object.entries(opts.where)) {
        qb = qb.eq(this.col(map, k), v);
      }
    }
    if (opts.whereIn) {
      for (const [k, values] of Object.entries(opts.whereIn)) {
        qb = qb.in(this.col(map, k), values);
      }
    }
    if (opts.orderBy) {
      qb = qb.order(this.col(map, opts.orderBy), {
        ascending: opts.direction !== "desc",
      });
    }
    if (typeof opts.offset === "number") {
      if (typeof opts.limit !== "number") {
        throw new Error(
          `SupabaseAdapter: offset requires limit on "${contract.name}" — range() needs both bounds.`,
        );
      }
      // Postgres/PostgREST make no ordering guarantee absent an explicit
      // ORDER BY — range() pagination without one can skip or repeat rows
      // across pages as the planner's incidental order shifts between
      // requests. Unlike the offset/limit check above, this is Postgres-
      // specific: the in-memory adapters slice a single already-fetched,
      // reference-stable snapshot, so they carry no equivalent risk.
      if (!opts.orderBy) {
        throw new Error(
          `SupabaseAdapter: offset requires orderBy on "${contract.name}" — range() pagination without a ` +
            `stable sort can skip or repeat rows across pages.`,
        );
      }
      qb = qb.range(opts.offset, opts.offset + opts.limit - 1);
    } else if (typeof opts.limit === "number") {
      qb = qb.limit(opts.limit);
    }
    const { data, error } = await qb.then((r) => r);
    if (error) throw this.wrap(error, "query", contract.name);
    return ((data as DataRow[] | null) ?? []).map((r) => this.toCanonical(map, r));
  }

  async describe(contract: ResourceContract, rows?: DataRow[]): Promise<DescribeResult> {
    // INTROSPECT the live rows (WC46.015) — derive the schema from a `select *`
    // of the actual table, so a column added in Postgres surfaces in drift
    // WITHOUT hand-editing the contract (a richer signal than echoing it). A
    // dedicated information_schema probe stays a documented later enrichment;
    // introspecting the returned rows is genuine source-derived schema today.
    // Empty table ⇒ fall back to the declared contract fields. A caller (e.g.
    // driftReport) may hand us its already-fetched snapshot so schema-drift and
    // row-drift compare the SAME read and we skip a redundant `select *`.
    const snapshot = rows ?? (await this.list(contract));
    return {
      resource: contract.name,
      provider: this.kind,
      level: this.level,
      fields: introspectFields(snapshot, contract),
    };
  }

  async create(contract: ResourceContract, row: DataRow): Promise<DataRow> {
    const map = this.map(contract);
    const dbRow = {
      ...this.toDbRow(map, row),
      ...(map.filter ?? {}),
    };
    const { data, error } = await this.cfg.client.from(map.table).insert(dbRow).select("*").single();
    if (error) throw this.wrap(error, "create", contract.name);
    return this.toCanonical(map, data as DataRow);
  }

  async update(contract: ResourceContract, key: string, patch: Partial<DataRow>): Promise<DataRow> {
    const map = this.map(contract);
    const dbPatch = {
      ...this.toDbRow(map, patch),
      ...(map.filter ?? {}),
    };
    const { data, error } = await this.withFilter(
      this.cfg.client.from(map.table).update(dbPatch),
      map,
    )
      .eq(this.col(map, contract.key), key)
      .select("*")
      .single();
    if (error) throw this.wrap(error, "update", contract.name);
    return this.toCanonical(map, data as DataRow);
  }

  async delete(contract: ResourceContract, key: string): Promise<void> {
    const map = this.map(contract);
    const { error } = await this.withFilter(
      this.cfg.client.from(map.table).delete(),
      map,
    )
      .eq(this.col(map, contract.key), key)
      .then((r) => r);
    if (error) throw this.wrap(error, "delete", contract.name);
  }

  private wrap(error: unknown, op: string, resource: string): Error {
    const detail = isPgError(error) ? `${error.code ? `[${error.code}] ` : ""}${error.message}` : String(error);
    return new Error(`SupabaseAdapter ${op} failed on "${resource}": ${detail}`);
  }
}
