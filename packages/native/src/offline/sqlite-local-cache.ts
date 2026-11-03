/**
 * `@marktiderman/genesis-native/offline`: the phone's device cache, in SQLite
 * (expo-sqlite), so lists and records open at once (ADR 0010, slice 1).
 *
 *   import * as SQLite from "expo-sqlite";
 *   import { persistOffline, sqliteLocalCache } from "@marktiderman/genesis-native/offline";
 *
 *   const db = SQLite.openDatabaseSync("genesis-offline.db");
 *   <GenesisNativeApp persist={persistOffline({ cache: sqliteLocalCache({ db }), resources: ["tasks"], buster: version })} … />
 *
 * @stability Beta
 */
import type { CacheOp, LocalCache, StoredQuery, StoredRow } from "@marktiderman/genesis-core/offline";

/** The part of expo-sqlite's `SQLiteDatabase` this uses (op-sqlite fits behind a small wrapper). */
export interface SQLiteDatabaseLike {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: (string | number | null)[]): Promise<unknown>;
  getAllAsync<T>(source: string, params: (string | number | null)[]): Promise<T[]>;
  /** Runs `task` in one exclusive transaction, so a write lands whole or not at all. */
  withExclusiveTransactionAsync(task: (txn: SQLiteDatabaseLike) => Promise<void>): Promise<void>;
}

/** Options for {@link sqliteLocalCache}. */
export interface SqliteLocalCacheOptions {
  db: SQLiteDatabaseLike;
}

// busy_timeout: a clear at sign-out that overlaps a save waits for it instead of failing.
const SCHEMA = `
pragma busy_timeout = 5000;
create table if not exists genesis_offline_rows (
  scope text not null, resource text not null, id text not null,
  row text not null, fetched_at integer not null,
  primary key (scope, resource, id)
);
create table if not exists genesis_offline_queries (
  scope text not null, key text not null, query_key text not null,
  resource text not null, data text not null, fetched_at integer not null,
  primary key (scope, key)
);`;

function assertScope(scope: string): void {
  if (!/^u:[^|]+\|/.test(scope)) {
    throw new Error(`[genesis offline] "${scope}" isn't a person's cache scope: build it with cacheScope(userId, workspace).`);
  }
}

/** `LIKE` matches `_` and `%` as wildcards: escape them in a person's prefix. */
const likePrefix = (prefix: string) => `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * A `LocalCache` in SQLite, for the phone. Rows and queries are separate
 * tables keyed by scope, so one row is stored once whatever lists hold it,
 * and every write runs in one exclusive transaction. Values are stored as
 * JSON, so a `Date` in a read comes back as its ISO text (rows from Supabase
 * are text already).
 *
 * @stability Beta
 */
export function sqliteLocalCache({ db }: SqliteLocalCacheOptions): LocalCache {
  let ready: Promise<void> | null = null;
  const open = () => {
    ready ??= db.execAsync(SCHEMA).catch((error: unknown) => {
      ready = null;
      throw error;
    });
    return ready;
  };

  return {
    async readQueries(scope) {
      assertScope(scope);
      await open();
      const rows = await db.getAllAsync<{ key: string; query_key: string; resource: string; data: string; fetched_at: number }>(
        "select key, query_key, resource, data, fetched_at from genesis_offline_queries where scope = ?",
        [scope],
      );
      return rows.map(
        (r): StoredQuery => ({
          key: r.key,
          queryKey: JSON.parse(r.query_key) as unknown[],
          resource: r.resource,
          data: JSON.parse(r.data) as unknown,
          fetchedAt: r.fetched_at,
        }),
      );
    },

    async readRows(scope, resource, ids) {
      assertScope(scope);
      if (ids.length === 0) return [];
      await open();
      const out: StoredRow[] = [];
      // SQLite caps bound parameters; read in chunks.
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const rows = await db.getAllAsync<{ id: string; row: string; fetched_at: number }>(
          `select id, row, fetched_at from genesis_offline_rows where scope = ? and resource = ? and id in (${chunk.map(() => "?").join(",")})`,
          [scope, resource, ...chunk],
        );
        for (const r of rows) out.push({ resource, id: r.id, row: JSON.parse(r.row) as Record<string, unknown>, fetchedAt: r.fetched_at });
      }
      return out;
    },

    async write(scope, ops: readonly CacheOp[]) {
      assertScope(scope);
      if (ops.length === 0) return;
      await open();
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const op of ops) {
          if (op.kind === "row") {
            // An older read never overwrites a newer one.
            await txn.runAsync(
              `insert into genesis_offline_rows (scope, resource, id, row, fetched_at) values (?, ?, ?, ?, ?)
               on conflict (scope, resource, id) do update set row = excluded.row, fetched_at = excluded.fetched_at
               where excluded.fetched_at >= genesis_offline_rows.fetched_at`,
              [scope, op.row.resource, op.row.id, JSON.stringify(op.row.row), op.row.fetchedAt],
            );
          } else if (op.kind === "query") {
            await txn.runAsync(
              "insert or replace into genesis_offline_queries (scope, key, query_key, resource, data, fetched_at) values (?, ?, ?, ?, ?, ?)",
              [scope, op.query.key, JSON.stringify(op.query.queryKey), op.query.resource, JSON.stringify(op.query.data), op.query.fetchedAt],
            );
          } else if (op.kind === "forget") {
            await txn.runAsync(
              `delete from genesis_offline_queries where scope = ? and key = ?${op.before === undefined ? "" : " and fetched_at < ?"}`,
              op.before === undefined ? [scope, op.key] : [scope, op.key, op.before],
            );
          } else if (op.kind === "drop") {
            await txn.runAsync("delete from genesis_offline_rows where scope = ? and resource = ? and id = ?", [scope, op.resource, op.id]);
          } else {
            const ids = await txn.getAllAsync<{ id: string }>(
              "select id from genesis_offline_rows where scope = ? and resource = ? and fetched_at < ?",
              [scope, op.resource, op.before],
            );
            const keep = new Set(op.keep);
            for (const { id } of ids) {
              if (!keep.has(id)) await txn.runAsync("delete from genesis_offline_rows where scope = ? and resource = ? and id = ?", [scope, op.resource, id]);
            }
          }
        }
      });
    },

    async clear(target) {
      await open();
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const table of ["genesis_offline_rows", "genesis_offline_queries"]) {
          if (!target) await txn.runAsync(`delete from ${table}`, []);
          else if ("scope" in target) await txn.runAsync(`delete from ${table} where scope = ?`, [target.scope]);
          else if ("user" in target) await txn.runAsync(`delete from ${table} where scope like ? escape '\\'`, [likePrefix(`u:${target.user}|`)]);
          else await txn.runAsync(`delete from ${table} where scope not like ? escape '\\'`, [likePrefix(`u:${target.except}|`)]);
        }
      });
    },
  };
}

export { cacheScope, persistOffline, type LocalCache, type PersistOfflineOptions, type QueryPersistence } from "@marktiderman/genesis-core/offline";
