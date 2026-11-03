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
const toScope = (scope: string): CacheScope | null =>
  !scope ? null : scope.startsWith("u:") ? (/^u:[^|]+\|/.test(scope) ? scope : null) : `${userPrefix(scope)}none`;

/**
 * Replaces the rows in a read with references, and collects them. Only a read of whole rows (no
 * `select`) is split, so every stored row has one shape; a projection is kept as it came. Null:
 * not a shape this keeps.
 */
function split(kind: string, select: unknown, data: unknown, rows: Row[]): unknown {
  if (select !== undefined) return kind === "infinite" && !(data && typeof data === "object" && Array.isArray((data as { pages?: unknown }).pages)) ? null : data;
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
  // A record read whole is a row.
  if (isRow(data)) {
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
 * - A restored read is marked as fetched when it was, so a screen refetches it
 *   once it's stale (the client's `staleTime`), as with any cached read. It
 *   never replaces a newer read already in the client.
 * - A newer read replaces a stored row, so a field the server stops returning
 *   goes; a record that comes back empty is deleted from the device. Each start
 *   deletes reads older than `maxAge` and the rows no kept read refers to.
 * - A sign-out, a change of person or workspace, or `clear()` stops every save
 *   and restore still in flight from landing in the new bucket.
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
    // Everyone this persistence restored or saved for: `clear` deletes all of their reads.
    const people = new Set<string>();
    const meta = (): CacheOp => ({ kind: "query", query: { key: META, queryKey: [META], resource: META, data: { buster }, fetchedAt: Date.now() } });

    const keptQuery = (query: Query) => {
      const [resource, kind] = query.queryKey as readonly unknown[];
      return typeof resource === "string" && kept.has(resource) && typeof kind === "string" && KINDS.has(kind);
    };

    const restore = async (raw: string, signal?: AbortSignal) => {
      const scope = toScope(raw);
      if (!scope) return;
      const mine = ++restores;
      people.add(scope.slice(2, scope.indexOf("|")));
      const stale = () => mine !== restores || signal?.aborted === true;
      try {
        const stored = await cache.readQueries(scope);
        if (stale()) return;
        const found = stored.find((q) => q.key === META);
        if (!found || (found.data as { buster?: unknown })?.buster !== buster) {
          // A different app version, or nothing kept yet: start this bucket afresh.
          await cache.clear({ scope });
          await cache.write(scope, [meta()]);
          return;
        }
        const reads = stored.filter((q) => q.key !== META);
        const fresh = reads.filter((q) => Date.now() - q.fetchedAt <= maxAge && kept.has(q.resource));
        // The rows each resource's reads refer to, read once per resource.
        const wanted = new Map<string, Set<string>>();
        for (const q of reads) if (!wanted.has(q.resource)) wanted.set(q.resource, new Set());
        for (const q of fresh) refsIn(q.data, wanted.get(q.resource)!);
        const rowsOf = new Map<string, Map<string, Row>>();
        for (const [resource, ids] of wanted) {
          if (ids.size === 0) continue;
          const rows = await cache.readRows(scope, resource, [...ids]);
          rowsOf.set(resource, new Map(rows.map((r) => [r.id, r.row as Row])));
        }
        if (stale()) return;
        for (const q of fresh) {
          const data = join(q.data, rowsOf.get(q.resource) ?? new Map());
          if (data === undefined) continue; // A row it needs is gone: the screen reads it again.
          const existing = queryClient.getQueryState(q.queryKey);
          if (existing?.data !== undefined && existing.dataUpdatedAt >= q.fetchedAt) continue;
          queryClient.setQueryData(q.queryKey, data, { updatedAt: q.fetchedAt });
        }
        // Keep the device to what can still be restored: expired reads, reads of resources no
        // longer kept, and rows nothing refers to are deleted.
        const sweep: CacheOp[] = reads.filter((q) => !fresh.includes(q)).map((q) => ({ kind: "forget", key: q.key }));
        for (const [resource, ids] of wanted) sweep.push({ kind: "prune", resource, keep: [...ids] });
        if (sweep.length) await cache.write(scope, sweep);
      } catch {
        // An unreadable cache is no reason to fail the start: the screens read from the server.
      }
    };

    const subscribe = (raw: string) => {
      const scope = toScope(raw);
      if (!scope) return () => {};
      const mine = ++saves;
      people.add(scope.slice(2, scope.indexOf("|")));
      // What each read was when it came back: saved later, but never what the client changed since.
      const pending = new Map<string, { queryKey: readonly unknown[]; data: unknown; fetchedAt: number }>();
      // Reads already on their way when this started belong to the scope before: never saved here.
      const before = new Set(queryClient.getQueryCache().getAll().filter((q) => q.state.fetchStatus === "fetching").map((q) => q.queryHash));
      let timer: ReturnType<typeof setTimeout> | undefined;
      let first = true;

      const flush = () => {
        timer = undefined;
        if (mine !== saves || pending.size === 0) return;
        // The bucket's app version, so the next start keeps what this saves.
        const ops: CacheOp[] = first ? [meta()] : [];
        first = false;
        for (const read of pending.values()) {
          const [resource, kind, params, detailSelect] = read.queryKey;
          // A record's projection is its key's fourth part; a list's is in its params.
          const select = kind === "detail" ? detailSelect : (params as { select?: unknown } | undefined)?.select;
          const key = keyText(read.queryKey);
          if (kind === "detail" && read.data == null) {
            // The record came back empty (deleted, or no longer readable): forget it here too.
            const id = read.queryKey[2];
            ops.push({ kind: "forget", key });
            if (select === undefined && id != null) ops.push({ kind: "drop", resource: resource as string, id: String(id) });
            continue;
          }
          const rows: Row[] = [];
          const data = split(kind as string, select, read.data, rows);
          if (data === null) continue;
          for (const row of rows) ops.push({ kind: "row", row: { resource: resource as string, id: String(row.id), row, fetchedAt: read.fetchedAt } });
          ops.push({ kind: "query", query: { key, queryKey: read.queryKey, resource: resource as string, data, fetchedAt: read.fetchedAt } satisfies StoredQuery });
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
        if (before.delete(event.query.queryHash)) return;
        if (!keptQuery(event.query)) return;
        const { data, dataUpdatedAt } = event.query.state;
        pending.set(event.query.queryHash, { queryKey: event.query.queryKey, data, fetchedAt: dataUpdatedAt });
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
      const everyone = [...people];
      people.clear();
      if (everyone.length === 0) await cache.clear();
      else for (const user of everyone) await cache.clear({ user });
    };

    return { restore, subscribe, clear };
  };
}
