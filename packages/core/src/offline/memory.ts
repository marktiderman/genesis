import { assertScope, userPrefix, type CacheOp, type CacheScope, type LocalCache, type StoredQuery, type StoredRow } from "./types";

interface Bucket {
  rows: Map<string, StoredRow>;
  queries: Map<string, StoredQuery>;
}

const rowKey = (resource: string, id: string) => `${resource}\u0000${id}`;

/** Applies one op to a bucket (shared with the other adapters' tests through behaviour, not code). */
function apply(bucket: Bucket, op: CacheOp): void {
  if (op.kind === "row") {
    const k = rowKey(op.row.resource, op.row.id);
    const before = bucket.rows.get(k);
    bucket.rows.set(k, before ? { ...op.row, row: { ...before.row, ...op.row.row } } : op.row);
  } else if (op.kind === "query") {
    bucket.queries.set(op.query.key, op.query);
  } else {
    bucket.queries.delete(op.key);
  }
}

/**
 * A `LocalCache` in memory: for tests, and for a screen that wants the
 * contract without a device store. Nothing survives a reload.
 *
 * @stability Beta
 */
export function memoryLocalCache(): LocalCache {
  const buckets = new Map<CacheScope, Bucket>();
  const bucket = (scope: CacheScope) => {
    let b = buckets.get(scope);
    if (!b) buckets.set(scope, (b = { rows: new Map(), queries: new Map() }));
    return b;
  };
  return {
    async readQueries(scope) {
      assertScope(scope);
      return [...(buckets.get(scope)?.queries.values() ?? [])];
    },
    async readRows(scope, resource, ids) {
      assertScope(scope);
      const b = buckets.get(scope);
      if (!b) return [];
      return ids.map((id) => b.rows.get(rowKey(resource, id))).filter((r): r is StoredRow => !!r);
    },
    async write(scope, ops) {
      assertScope(scope);
      // All or nothing: apply to a copy, then swap it in.
      const current = bucket(scope);
      const next: Bucket = { rows: new Map(current.rows), queries: new Map(current.queries) };
      for (const op of ops) apply(next, op);
      buckets.set(scope, next);
    },
    async clear(target) {
      if (!target) buckets.clear();
      else if ("scope" in target) buckets.delete(target.scope);
      else for (const scope of [...buckets.keys()]) if (scope.startsWith(userPrefix(target.user))) buckets.delete(scope);
    },
  };
}
