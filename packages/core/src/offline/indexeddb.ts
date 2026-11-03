import { assertScope, userPrefix, type CacheOp, type LocalCache, type StoredQuery, type StoredRow } from "./types";

/** Options for {@link indexedDbLocalCache}. */
export interface IndexedDbLocalCacheOptions {
  /** The database name. Default `"genesis-offline"`. */
  name?: string;
  /** The IndexedDB factory. Default `globalThis.indexedDB`. */
  indexedDB?: IDBFactory;
  /**
   * Ask the browser to keep this origin's storage (`navigator.storage.persist()`).
   * Default true. Refused, the browser may evict the cache under pressure;
   * it's rebuilt from the server.
   */
  persist?: boolean;
}

const VERSION = 1;
type RowRecord = StoredRow & { scope: string };
type QueryRecord = StoredQuery & { scope: string };

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("[genesis offline] IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error);
  });

/**
 * A `LocalCache` in IndexedDB, for the web: plain IndexedDB, no dependency.
 * Rows and queries are separate object stores keyed by scope, so one row is
 * stored once whatever lists hold it, and a write is one transaction. A newer
 * version of the database opened in another tab closes this one, which then
 * reopens on its next use, instead of blocking the upgrade.
 *
 * @stability Beta
 */
export function indexedDbLocalCache(options: IndexedDbLocalCacheOptions = {}): LocalCache {
  const name = options.name ?? "genesis-offline";
  const factory = options.indexedDB ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  let opening: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    if (opening) return opening;
    if (!factory) return Promise.reject(new Error("[genesis offline] IndexedDB isn't available here."));
    if (options.persist !== false) {
      const storage = (globalThis as { navigator?: { storage?: { persist?: () => Promise<boolean> } } }).navigator?.storage;
      void storage?.persist?.().catch(() => false);
    }
    const request = factory.open(name, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("rows")) {
        db.createObjectStore("rows", { keyPath: ["scope", "resource", "id"] }).createIndex("scope", "scope");
      }
      if (!db.objectStoreNames.contains("queries")) {
        db.createObjectStore("queries", { keyPath: ["scope", "key"] }).createIndex("scope", "scope");
      }
    };
    opening = done(request).then((db) => {
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      return db;
    });
    opening.catch(() => {
      opening = null;
    });
    return opening;
  };

  const deleteScope = (store: IDBObjectStore, scope: string) =>
    new Promise<void>((resolve, reject) => {
      const cursor = store.index("scope").openKeyCursor(IDBKeyRange.only(scope));
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve();
        store.delete(c.primaryKey);
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });

  return {
    async readQueries(scope) {
      assertScope(scope);
      const db = await open();
      const records = (await done(db.transaction("queries").objectStore("queries").index("scope").getAll(IDBKeyRange.only(scope)))) as QueryRecord[];
      return records.map(({ scope: _s, ...query }) => query);
    },
    async readRows(scope, resource, ids) {
      assertScope(scope);
      if (ids.length === 0) return [];
      const db = await open();
      const store = db.transaction("rows").objectStore("rows");
      const found = await Promise.all(ids.map((id) => done(store.get([scope, resource, id])) as Promise<RowRecord | undefined>));
      return found.filter((r): r is RowRecord => !!r).map(({ scope: _s, ...row }) => row);
    },
    async write(scope, ops: readonly CacheOp[]) {
      assertScope(scope);
      if (ops.length === 0) return;
      const db = await open();
      const tx = db.transaction(["rows", "queries"], "readwrite");
      const rows = tx.objectStore("rows");
      const queries = tx.objectStore("queries");
      for (const op of ops) {
        if (op.kind === "row") {
          const key = [scope, op.row.resource, op.row.id];
          const get = rows.get(key);
          get.onsuccess = () => {
            const before = get.result as RowRecord | undefined;
            rows.put({ ...op.row, scope, row: { ...(before?.row ?? {}), ...op.row.row } } satisfies RowRecord);
          };
        } else if (op.kind === "query") {
          queries.put({ ...op.query, scope } satisfies QueryRecord);
        } else {
          queries.delete([scope, op.key]);
        }
      }
      await finished(tx);
    },
    async clear(target) {
      const db = await open();
      // Which scopes go, read first: a transaction can't wait on anything but its own requests.
      const scopes = !target ? null : "scope" in target ? [target.scope] : (await scopesFor(db)).filter((s) => s.startsWith(userPrefix(target.user)));
      const tx = db.transaction(["rows", "queries"], "readwrite");
      for (const store of [tx.objectStore("rows"), tx.objectStore("queries")]) {
        if (!scopes) store.clear();
        else for (const scope of scopes) void deleteScope(store, scope);
      }
      await finished(tx);
    },
  };

  async function scopesFor(db: IDBDatabase): Promise<string[]> {
    const out = new Set<string>();
    for (const store of ["rows", "queries"] as const) {
      const keys = (await done(db.transaction(store).objectStore(store).index("scope").getAllKeys())) as IDBValidKey[];
      for (const k of keys) out.add(String((k as unknown[])[0]));
    }
    return [...out];
  }
}
