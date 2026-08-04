// =====================================================================
// Adapter interface — ONE contract per provider.
//
// The app calls `data.resource('x').list()` and NEVER knows the Level.
// Each provider (Code L1 · Airtable L2 · Supabase L3 · Notion L2) implements
// this single contract. Read ops (list/get/query/describe) are mandatory;
// write ops (create/update/delete) are present only where the provider is
// writable — a read-only provider throws `ReadOnlyAdapterError`.
// =====================================================================

import type { DataRow, DescribeResult, Level, ProviderKind, QueryOptions, ResourceContract } from "../types";

/** Thrown by a read-only adapter when a write op is attempted. */
export class ReadOnlyAdapterError extends Error {
  constructor(provider: ProviderKind, op: string, resource: string) {
    super(`Provider "${provider}" is read-only — cannot ${op} on "${resource}".`);
    this.name = "ReadOnlyAdapterError";
  }
}

/** Thrown when an adapter is asked for a resource it has no mapping for. */
export class UnknownResourceError extends Error {
  constructor(provider: ProviderKind, resource: string) {
    super(`Provider "${provider}" has no mapping for resource "${resource}".`);
    this.name = "UnknownResourceError";
  }
}

export interface Adapter {
  readonly kind: ProviderKind;
  readonly level: Level;

  /** All rows for a resource (subject to the provider's natural limits). */
  list(contract: ResourceContract): Promise<DataRow[]>;

  /** A single row by its identity `key` value, or null if absent. */
  get(contract: ResourceContract, key: string): Promise<DataRow | null>;

  /** Rows matching a provider-agnostic query. */
  query(contract: ResourceContract, opts: QueryOptions): Promise<DataRow[]>;

  /**
   * Live schema for the resource as this provider sees it (drives drift).
   * Optionally pass an already-fetched row snapshot (`rows`) so the caller and
   * `describe()` introspect the SAME snapshot — keeps schema-drift and row-drift
   * consistent and avoids a redundant `select *`. When omitted, the adapter
   * fetches its own snapshot.
   */
  describe(contract: ResourceContract, rows?: DataRow[]): Promise<DescribeResult>;

  // -- Writable providers only (else ReadOnlyAdapterError). ------------
  create?(contract: ResourceContract, row: DataRow): Promise<DataRow>;
  update?(contract: ResourceContract, key: string, patch: Partial<DataRow>): Promise<DataRow>;
  delete?(contract: ResourceContract, key: string): Promise<void>;
}

/** Narrow an adapter to its writable surface (or throw a typed error). */
export function asWritable(
  adapter: Adapter,
  op: "create" | "update" | "delete",
  resource: string,
): Required<Pick<Adapter, "create" | "update" | "delete">> {
  if (typeof adapter[op] !== "function") {
    throw new ReadOnlyAdapterError(adapter.kind, op, resource);
  }
  // Safe: each op presence is checked at its call site below.
  return adapter as Required<Pick<Adapter, "create" | "update" | "delete">>;
}
