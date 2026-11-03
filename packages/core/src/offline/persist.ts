import type { Query, QueryCacheNotifyEvent, QueryClient } from "@tanstack/react-query";
import { userPrefix, type CacheOp, type CacheScope, type LocalCache, type QueryPersistence, type StoredQuery } from "./types";

/** Options for {@link persistOffline}. */
export interface PersistOfflineOptions {
  /** Where reads are kept: `indexedDbLocalCache()` on the web, `sqliteLocalCache({ db })` on the phone. */
  cache: LocalCache;
  /**
   * The resources whose reads are kept on the device: the one opt-in switch.
   * Keeping data on a device is a decision, so nothing else is written. Leave
   * out a resource whose rows shouldn't sit on a phone unencrypted.
   */
  resources: readonly string[];
  /** Your app's version: a different value discards what was kept. */
  buster: string;
  /** How old a kept read may be when restored. Default 7 days. */
  maxAge?: number;
  /** Save at most this often. Default 500 ms. */
  throttleMs?: number;
}

const DAY = 24 * 60 * 60 * 1000;
const META = "__genesis_offline_meta__";
const KINDS = new Set(["list", "detail", "infinite"]);

type Row = Record<string, unknown>;
type Ref = { $row: string };
const isRef = (v: unknown): v is Ref => !!v && typeof v === "object" && typeof (v as Ref).$row === "string" && Object.keys(v).length === 1;
const isRow = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v) && (v as Row).id != null;

/** A query's key as text: its identity in the store. */
const keyText = (key: readonly unknown[]) =>
  JSON.stringify(key, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Row).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );

/** A person's scope from what the app shell hands over: a user id, or a scope `cacheScope` built. */
const toScope = (scope: string): CacheScope | null => (!scope ? null : scope.startsWith("u:") ? scope : `${userPrefix(scope)}none`);

/** Replaces the rows in a read with references, and collects them. Null: not a shape this keeps. */
function split(kind: string, select: unknown, data: unknown, rows: Row[]): unknown {
  const list = (page: unknown) => {
    if (!page || typeof page !== "object" || !Array.isArray((page as { data?: unknown }).data)) return page;
    const p = page as { data: unknown[] };
    return { ...p, data: p.data.map((r) => (isRow(r) ? (rows.push(r), { $row: String(r.id) }) : r)) };
  };
  if (kind === "list") return list(data);
  if (kind === "infinite") {
    if (!data || typeof data !== "object" || !Array.isArray((data as { pages?: unknown }).pages)) return null;
    const d = data as { pages: unknown[] };
    return { ...d, pages: d.pages.map(list) };
  }
  // A record read whole is a row; a projection (`select`) is kept as it is, beside the rows.
  if (select === undefined && isRow(data)) {
    rows.push(data);
    return { $row: String(data.id) };
  }
  return data;
}

/** Collects the ids a stored read refers to. */
function refsIn(value: unknown, out: Set<string>): void {
  if (isRef(value)) out.add(value.$row);
  else if (Array.isArray(value)) for (const v of value) refsIn(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) refsIn(v, out);
}

/** Puts the rows back; undefined when a row it needs is missing. */
function join(value: unknown, rows: Map<string, Row>): unknown {
  if (isRef(value)) return rows.get(value.$row);
  if (Array.isArray(value)) {
    const out = value.map((v) => join(v, rows));
    return out.some((v, i) => v === undefined && value[i] !== undefined) ? undefined : out;
  }
  if (value && typeof value === "object") {
    const out: Row = {};
    for (const [k, v] of Object.entries(value)) {
      const joined = join(v, rows);
      if (joined === undefined && v !== undefined) return undefined;
      out[k] = joined;
    }
    return out;
  }
  return value;
}

/**
 * Keeps the reads of the listed resources on the device, per record, and
 * puts them back into the QueryClient on the next start, so lists and records
 * open at once and then refresh as usual. What `GenesisNativeApp`'s and
 * `GenesisProvider`'s `persist` take.
 *
 *   persist={persistOffline({ cache: indexedDbLocalCache(), resources: ["tasks", "people"], buster: version })}
 *
 * - Only reads that came back from the provider are kept (never an optimistic
 *   change that hasn't been saved), in the bucket of the person and workspace
 *   they were read in.
 * - A restored read is marked as fetched when it was, so it refetches as soon
 *   as a screen shows it. It never replaces a newer read already in the client.
 * - A sign-out, a change of person or workspace, or `clear()` stops every save
 *   still in flight from landing in the new bucket.
 *
 * @stability Beta
 */
export function persistOffline(options: PersistOfflineOptions): (queryClient: QueryClient) => QueryPersistence {
  const { cache, buster, maxAge = 7 * DAY, throttleMs = 500 } = options;
  const kept = new Set(options.resources);

  return (queryClient) => {
    // Generations: a save or a restore started before a newer one (or a clear) is dropped, so
    // nothing lands in another person's or workspace's bucket.
    // Restores and saves count apart, so starting to save doesn't cancel a restore still reading.
    let restores = 0;
    let saves = 0;
    let lastUser: string | null = null;

    const keptQuery = (query: Query) => {
      const [resource, kind] = query.queryKey as readonly unknown[];
      return typeof resource === "string" && kept.has(resource) && typeof kind === "string" && KINDS.has(kind);
    };

    const restore = async (raw: string) => {
      const scope = toScope(raw);
      if (!scope) return;
      const mine = ++restores;
      lastUser = scope.slice(2, scope.indexOf("|"));
      try {
        const stored = await cache.readQueries(scope);
        const meta = stored.find((q) => q.key === META);
        if (!meta || (meta.data as { buster?: unknown })?.buster !== buster) {
          // A different app version, or nothing kept yet: start this bucket afresh.
          await cache.clear({ scope });
          await cache.write(scope, [{ kind: "query", query: { key: META, queryKey: [META], resource: META, data: { buster }, fetchedAt: Date.now() } }]);
          return;
        }
        const fresh = stored.filter((q) => q.key !== META && Date.now() - q.fetchedAt <= maxAge && kept.has(q.resource));
        // The rows each resource's reads refer to, read once per resource.
        const wanted = new Map<string, Set<string>>();
        for (const q of fresh) {
          const ids = wanted.get(q.resource) ?? new Set<string>();
          refsIn(q.data, ids);
          wanted.set(q.resource, ids);
        }
        const rowsOf = new Map<string, Map<string, Row>>();
        for (const [resource, ids] of wanted) {
          const found = await cache.readRows(scope, resource, [...ids]);
          rowsOf.set(resource, new Map(found.map((r) => [r.id, r.row as Row])));
        }
        if (mine !== restores) return;
        for (const q of fresh) {
          const data = join(q.data, rowsOf.get(q.resource) ?? new Map());
          if (data === undefined) continue; // A row it needs is gone: the screen reads it again.
          const existing = queryClient.getQueryState(q.queryKey);
          if (existing?.data !== undefined && existing.dataUpdatedAt >= q.fetchedAt) continue;
          queryClient.setQueryData(q.queryKey, data, { updatedAt: q.fetchedAt });
        }
      } catch {
        // An unreadable cache is no reason to fail the start: the screens read from the server.
      }
    };

    const subscribe = (raw: string) => {
      const scope = toScope(raw);
      if (!scope) return () => {};
      const mine = ++saves;
      const pending = new Map<string, Query>();
      let timer: ReturnType<typeof setTimeout> | undefined;

      const flush = () => {
        timer = undefined;
        if (mine !== saves || pending.size === 0) return;
        const ops: CacheOp[] = [];
        for (const query of pending.values()) {
          const state = query.state;
          if (state.status !== "success" || state.data === undefined) continue;
          const [resource, kind, , select] = query.queryKey as readonly unknown[];
          const rows: Row[] = [];
          const data = split(kind as string, select, state.data, rows);
          if (data === null) continue;
          for (const row of rows) ops.push({ kind: "row", row: { resource: resource as string, id: String(row.id), row, fetchedAt: state.dataUpdatedAt } });
          const stored: StoredQuery = { key: keyText(query.queryKey), queryKey: query.queryKey, resource: resource as string, data, fetchedAt: state.dataUpdatedAt };
          ops.push({ kind: "query", query: stored });
        }
        pending.clear();
        if (ops.length) void cache.write(scope, ops).catch(() => undefined);
      };

      const unsubscribe = queryClient.getQueryCache().subscribe((event: QueryCacheNotifyEvent) => {
        if (event.type !== "updated" || mine !== saves) return;
        const action = event.action as { type?: string; manual?: boolean };
        // A fetch that came back; never a change made in the client (an optimistic patch, a live
        // hint's merge, a restore), which the next fetch confirms or undoes.
        if (action.type !== "success" || action.manual) return;
        if (!keptQuery(event.query)) return;
        pending.set(event.query.queryHash, event.query);
        timer ??= setTimeout(flush, throttleMs);
      });
      return () => {
        unsubscribe();
        if (timer) clearTimeout(timer);
        flush();
      };
    };

    const clear = async () => {
      restores += 1;
      saves += 1;
      await cache.clear(lastUser ? { user: lastUser } : undefined);
    };

    return { restore, subscribe, clear };
  };
}
