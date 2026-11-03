import { assertScope, userPrefix, type CacheOp, type LocalCache, type StoredQuery, type StoredRow } from "./types";

/** Options for {@link indexedDbLocalCache}. */
export interface IndexedDbLocalCacheOptions {
  /** The database name. Default `"genesis-offline"`. */
  name?: string;
  /** The IndexedDB factory. Default `globalThis.indexedDB`. */
  indexedDB?: IDBFactory;
  /**
   * Ask the browser to keep this origin's storage (`navigator.storage.persist()`).
   * Default false: some browsers ask the person, and kept storage outlives a
   * shared machine's session longer. Without it the browser may evict the
   * cache under pressure; it's rebuilt from the server.
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
    if (options.persist === true) {
      const storage = (globalThis as { navigator?: { storage?: { persist?: () => Promise<boolean> } } }).navigator?.storage;
      void storage?.persist?.().catch(() => false);
    }
    const request = factory.open(name, VERSION);
    // Another tab holds an older version open: it closes on its versionchange, then this opens.
    request.onblocked = () => undefined;
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

  // Every key starts with its scope, so a scope's (or a person's) records are one key range: an
  // array key sorts after any shorter array it starts with, and an array element sorts after a
  // string, so `[scope, []]` is above every `[scope, ...]`.
  const scopeRange = (scope: string) => IDBKeyRange.bound([scope], [scope, []]);
  const personRange = (user: string) => IDBKeyRange.bound([userPrefix(user)], [`${userPrefix(user)}\uffff`]);

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
      // Requests in one transaction run in the order they're made, so the ops apply in order. A row
      // is written only if the stored one isn't newer: read first, then put (one row op per key, the
      // newest, so two reads of one row in one write can't race).
      const newest = new Map<string, StoredRow>();
      for (const op of ops) {
        if (op.kind !== "row") continue;
        const k = JSON.stringify([op.row.resource, op.row.id]);
        const seen = newest.get(k);
        if (!seen || seen.fetchedAt <= op.row.fetchedAt) newest.set(k, op.row);
      }
      const olderThan = (store: IDBObjectStore, key: IDBValidKey, before: number, then: () => void) => {
        const get = store.get(key);
        get.onsuccess = () => {
          const stored = get.result as { fetchedAt: number } | undefined;
          if (stored && stored.fetchedAt < before) then();
        };
      };
      for (const op of ops) {
        if (op.kind === "row") {
          const row = newest.get(JSON.stringify([op.row.resource, op.row.id]));
          if (row !== op.row) continue;
          const get = rows.get([scope, row.resource, row.id]);
          get.onsuccess = () => {
            const stored = get.result as RowRecord | undefined;
            if (!stored || stored.fetchedAt <= row.fetchedAt) rows.put({ ...row, scope } satisfies RowRecord);
          };
        } else if (op.kind === "query") queries.put({ ...op.query, scope } satisfies QueryRecord);
        else if (op.kind === "forget") {
          if (op.before === undefined) queries.delete([scope, op.key]);
          else olderThan(queries, [scope, op.key], op.before, () => queries.delete([scope, op.key]));
        } else if (op.kind === "drop") rows.delete([scope, op.resource, op.id]);
        else {
          const keep = new Set(op.keep);
          const cursor = rows.openCursor(IDBKeyRange.bound([scope, op.resource], [scope, op.resource, []]));
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (!c) return;
            const stored = c.value as RowRecord;
            if (!keep.has(stored.id) && stored.fetchedAt < op.before) c.delete();
            c.continue();
          };
        }
      }
      await finished(tx);
    },
    async clear(target) {
      const db = await open();
      const tx = db.transaction(["rows", "queries"], "readwrite");
      for (const store of [tx.objectStore("rows"), tx.objectStore("queries")]) {
        if (!target) store.clear();
        else if ("scope" in target) store.delete(scopeRange(target.scope));
        else if ("user" in target) store.delete(personRange(target.user));
        else {
          // Everyone else: the keys below this person's range, and those above it.
          store.delete(IDBKeyRange.upperBound([userPrefix(target.except)], true));
          store.delete(IDBKeyRange.lowerBound([`${userPrefix(target.except)}\uffff`]));
        }
      }
      await finished(tx);
    },
  };
}
