// =====================================================================
// CodeAdapter — Level L1 (Code).
//
// In-code fixtures: ephemeral, instant, zero cost-of-change. Backs a
// resource entirely from a JS array, or — under Tier C — contributes a
// few scratch/mocked columns to a row whose identity comes from elsewhere.
//
// Fully writable (mutates the in-memory array), which makes it the natural
// backing for prototyping + tests. Restart = reset.
// =====================================================================

import type { Adapter } from "./adapter";
import { UnknownResourceError } from "./adapter";
import { introspectFields } from "../introspect";
import type { DataRow, DescribeResult, Level, ProviderKind, QueryOptions, ResourceContract } from "../types";

export interface CodeAdapterOptions {
  /**
   * resource-name → seed rows. Cloned on construction so the live store is
   * isolated from the caller's fixtures (mutations don't leak back).
   */
  readonly fixtures: Readonly<Record<string, readonly DataRow[]>>;
}

export class CodeAdapter implements Adapter {
  readonly kind: ProviderKind = "code";
  readonly level: Level = "L1";

  private readonly store = new Map<string, DataRow[]>();

  constructor(opts: CodeAdapterOptions) {
    for (const [resource, rows] of Object.entries(opts.fixtures)) {
      this.store.set(
        resource,
        rows.map((r) => ({ ...r })),
      );
    }
  }

  private rows(contract: ResourceContract): DataRow[] {
    const rows = this.store.get(contract.name);
    if (!rows) throw new UnknownResourceError(this.kind, contract.name);
    return rows;
  }

  async list(contract: ResourceContract): Promise<DataRow[]> {
    return this.rows(contract).map((r) => ({ ...r }));
  }

  async get(contract: ResourceContract, key: string): Promise<DataRow | null> {
    const hit = this.rows(contract).find((r) => String(r[contract.key]) === key);
    return hit ? { ...hit } : null;
  }

  async query(contract: ResourceContract, opts: QueryOptions): Promise<DataRow[]> {
    let out = this.rows(contract).map((r) => ({ ...r }));
    if (opts.where) {
      const entries = Object.entries(opts.where);
      out = out.filter((r) => entries.every(([k, v]) => r[k] === v));
    }
    if (opts.whereIn) {
      const entries = Object.entries(opts.whereIn);
      out = out.filter((r) => entries.every(([k, values]) => values.includes(r[k])));
    }
    if (opts.orderBy) {
      const field = opts.orderBy;
      const dir = opts.direction === "desc" ? -1 : 1;
      out.sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        if (av === bv) return 0;
        // Null/undefined sort LAST, stably — independent of `dir` (so a missing
        // orderBy value never lands ahead of real data on a desc sort).
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : 1) * dir;
      });
    }
    if (typeof opts.offset === "number") {
      if (typeof opts.limit !== "number") {
        throw new Error(
          `CodeAdapter: offset requires limit on "${contract.name}" — an unbounded "skip N, take the rest" is not a supported QueryOptions shape.`,
        );
      }
      out = out.slice(opts.offset, opts.offset + opts.limit);
    } else if (typeof opts.limit === "number") {
      out = out.slice(0, opts.limit);
    }
    return out;
  }

  async describe(contract: ResourceContract, rows?: DataRow[]): Promise<DescribeResult> {
    // INTROSPECT the live fixtures (WC46.015) — derive the schema from the rows
    // actually present, not a hand-authored echo. Adding a field to a fixture
    // surfaces here automatically; the contract only enriches (description /
    // specific type). Empty fixtures fall back to the declared contract fields.
    // A caller may pass its already-fetched snapshot to share one read.
    return {
      resource: contract.name,
      provider: this.kind,
      level: this.level,
      fields: introspectFields(rows ?? this.rows(contract), contract),
    };
  }

  async create(contract: ResourceContract, row: DataRow): Promise<DataRow> {
    const rows = this.rows(contract);
    const copy = { ...row };
    rows.push(copy);
    return { ...copy };
  }

  async update(contract: ResourceContract, key: string, patch: Partial<DataRow>): Promise<DataRow> {
    const rows = this.rows(contract);
    const idx = rows.findIndex((r) => String(r[contract.key]) === key);
    if (idx === -1) {
      throw new Error(`CodeAdapter: no "${contract.name}" row with ${contract.key}="${key}".`);
    }
    const merged = { ...rows[idx], ...patch };
    rows[idx] = merged;
    return { ...merged };
  }

  async delete(contract: ResourceContract, key: string): Promise<void> {
    const rows = this.rows(contract);
    const idx = rows.findIndex((r) => String(r[contract.key]) === key);
    if (idx !== -1) rows.splice(idx, 1);
  }
}
