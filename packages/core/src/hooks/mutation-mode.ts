// ---------------------------------------------------------------------------
// Mutation modes — when a write reaches the cache, and when the provider.
//
// - `pessimistic` (default): wait for the provider, then refetch. Today's
//   behaviour.
// - `optimistic`: patch the TanStack Query cache at once, send the write, and
//   put the cache back (and report the error) if it fails.
// - `undoable`: patch the cache at once and offer an undo (`onUndoable`);
//   the write is sent after a delay unless undone. A provider that serves
//   `undo` (capabilities `undo: true`) gets the write at once instead, and
//   the undo asks the provider to reverse it.
//
// Core has no UI: the undo toast is the caller's (`onUndoable`). genesis-ui's
// ResourceForm and ResourcePage show a sonner toast.
//
// Pending writes belong to the QueryClient, not to the hook that started
// them: a form that closes on success can still be undone from its toast.
// ---------------------------------------------------------------------------

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { BaseRecord, DataProvider, Identifier, ListResult } from "../provider/types";
import type { AuditEntry, ProviderCapabilities } from "../schema/types";
import { capabilitiesQueryKey } from "./use-capabilities";
import { resourceKeys } from "../query-keys";

export type MutationMode = "pessimistic" | "optimistic" | "undoable";

/** How long an `undoable` write waits for an undo before it is sent. */
export const DEFAULT_UNDO_DELAY_MS = 5000;

/** An undoable write, as handed to `onUndoable` so a UI can offer the undo. */
export interface UndoableWrite {
  resource: string;
  kind: "create" | "update" | "delete";
  /** The record's id; absent for a create (it has none until it is sent). */
  id?: Identifier;
  /**
   * - `delay`: the write has not been sent. `undo()` discards it; `commit()`
   *   sends it now instead of waiting.
   * - `provider`: the write was sent at once, because the provider serves
   *   `undo`. `undo()` asks the provider to reverse it; `commit()` does
   *   nothing.
   */
  strategy: "delay" | "provider";
  /** How long the undo is offered, in ms (the toast's duration). */
  delayMs: number;
  /**
   * Take the write back. Resolves true when it was undone (or will never be
   * sent), false when it could not be: already sent under `delay` (the
   * window closed, it was committed, a later write on the same record sent
   * it first, or the page unloaded), already undone, or the provider's undo
   * failed (reported through `onError`). Works after the hook that made the
   * write has unmounted. Safe to call more than once.
   */
  undo: () => Promise<boolean>;
  /** Send a `delay` write now. */
  commit: () => void;
}

export interface MutationModeOptions {
  /** Default `"pessimistic"`. */
  mutationMode?: MutationMode;
  /** How long an `undoable` write waits, in ms. Default 5000. */
  undoDelayMs?: number;
  /** Called with every `undoable` write, to show an undo control. */
  onUndoable?: (write: UndoableWrite) => void;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function sameId(a: unknown, b: unknown): boolean {
  return a != null && b != null && String(a) === String(b);
}

function isListResult(value: unknown): value is ListResult<BaseRecord> {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { data?: unknown }).data)
  );
}

/** TanStack infinite-query data whose pages are list results. */
interface InfiniteLists {
  pages: unknown[];
  pageParams: unknown[];
}

function isInfiniteLists(value: unknown): value is InfiniteLists {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { pages?: unknown }).pages) &&
    Array.isArray((value as { pageParams?: unknown }).pageParams)
  );
}

/**
 * Runs `fn` on every list a cache entry holds: a `[resource, "list", …]`
 * entry is one list (keyed by its query hash); a `[resource, "infinite",
 * …]` entry (useInfiniteResource) is one list per loaded page (keyed
 * `hash#page`). Returns the entry rebuilt, or the same object when `fn`
 * changed nothing. Rows added or removed change every page's `total`,
 * since each page reports the whole list's count.
 */
function mapLists(
  key: QueryKey,
  hash: string,
  value: unknown,
  fn: (list: ListResult<BaseRecord>, hash: string) => ListResult<BaseRecord>,
): unknown {
  if (key[1] === "list") return isListResult(value) ? fn(value, hash) : value;
  if (key[1] !== "infinite" || !isInfiniteLists(value)) return value;
  let changed = false;
  // Rows added or removed across pages, applied to every page's count: a
  // page after the first may report -1 (not counted), so its own total
  // can't carry the change.
  let rowDelta = 0;
  const pages = value.pages.map((page, i) => {
    if (!isListResult(page)) return page;
    const next = fn(page, `${hash}#${i}`);
    if (next !== page) {
      changed = true;
      rowDelta += next.data.length - page.data.length;
    }
    return next;
  });
  if (!changed) return value;
  const withTotals = value.pages.map((orig, i) => {
    const page = pages[i];
    if (!isListResult(page) || !isListResult(orig) || typeof orig.total !== "number") return page;
    return { ...page, total: orig.total < 0 ? orig.total : Math.max(0, orig.total + rowDelta) };
  });
  return { ...value, pages: withTotals };
}

/** Every list result a cache entry holds (see `mapLists`). */
function listsIn(key: QueryKey, value: unknown): ListResult<BaseRecord>[] {
  if (key[1] === "list") return isListResult(value) ? [value] : [];
  if (key[1] === "infinite" && isInfiniteLists(value)) return value.pages.filter(isListResult);
  return [];
}

function isDetailKeyFor(key: QueryKey, resource: string, id: Identifier): boolean {
  return key[0] === resource && key[1] === "detail" && sameId(key[2], id);
}

/** Structural equality for row values (JSON-like data, Dates). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((item, i) => sameValue(item, other[i]));
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (k) => Object.prototype.hasOwnProperty.call(b, k) &&
      sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** The record as the cache has it now, from a detail entry or any list. */
export function cachedRecord(
  queryClient: QueryClient,
  resource: string,
  id: Identifier,
): BaseRecord | undefined {
  for (const [key, value] of queryClient.getQueriesData<unknown>({ queryKey: resourceKeys(resource).details })) {
    if (isDetailKeyFor(key, resource, id) && value && typeof value === "object") return value as BaseRecord;
  }
  for (const [key, value] of queryClient.getQueriesData<unknown>({ queryKey: [resource] })) {
    for (const list of listsIn(key, value)) {
      const found = list.data.find((row) => sameId(row.id, id));
      if (found) return found;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The registry — one per QueryClient
//
// Holds every optimistic/undoable write not yet settled, and the cache
// patches they made. Patches are re-applied to any `[resource, "list" |
// "infinite" | "detail", …]` data that arrives while they are pending (a refetch, a new
// page, filter or search), so a deleted row stays gone and an edit stays
// shown until the write settles. Because of that, refetching is always safe
// and nothing waits for pending writes before invalidating.
// ---------------------------------------------------------------------------

/** One record's change, kept applied to the cache while its write is pending. */
interface Patch {
  resource: string;
  id: Identifier;
  kind: "update" | "delete";
  /** An update's values; the same object its write sends, so a rebase changes both. */
  data?: Record<string, unknown>;
  /** Per cache entry (query hash): the row just before this patch, and its list index. */
  before: Map<string, { row: BaseRecord; index: number }>;
}

/** One optimistic or undoable write that has not settled. */
interface Tracked {
  seq: number;
  queryClient: QueryClient;
  provider: DataProvider;
  resource: string;
  kind: "create" | "update" | "delete";
  /** `resource` + id: writes on the same record are sent in order. */
  rowKey?: string;
  patch?: Patch;
  /** Row-shaped values it will send (update); undefined when not row-shaped. */
  data?: Record<string, unknown>;
  /** The cached row just before this write's patch. */
  baseline?: BaseRecord;
  /**
   * - waiting: an undoable write in its delay
   * - queued: to be sent, behind earlier writes on the same record
   * - sending / done
   */
  state: "waiting" | "queued" | "sending" | "done";
  /** Sent with `keepalive` (because the page was unloading). */
  keepalive: boolean;
  /** Set when it was dropped because an earlier write it built on was taken back. */
  dropped: boolean;
  /** Send now: a waiting write skips its delay; `unloading` also skips the row queue. */
  flush: (unloading?: boolean) => void;
  /** Drop a waiting or queued write (see `dropped`). */
  drop: () => void;
}

interface Registry {
  pending: Map<string, number>;
  patches: Patch[];
  writes: Tracked[];
  rowTails: Map<string, Promise<void>>;
  /** Cache data this module wrote, so the cache listener does not re-patch it. */
  produced: WeakSet<object>;
  /** True while this module is writing to the cache. */
  writing: boolean;
  unsubscribe?: () => void;
}

const registries = new WeakMap<QueryClient, Registry>();
let nextSeq = 0;

function registryFor(queryClient: QueryClient): Registry {
  let reg = registries.get(queryClient);
  if (!reg) {
    reg = {
      pending: new Map(),
      patches: [],
      writes: [],
      rowTails: new Map(),
      produced: new WeakSet(),
      writing: false,
    };
    registries.set(queryClient, reg);
  }
  return reg;
}

/** Optimistic or undoable writes on `resource` not yet settled. */
export function pendingWriteCount(queryClient: QueryClient, resource: string): number {
  return registries.get(queryClient)?.pending.get(resource) ?? 0;
}

function beginPending(reg: Registry, resource: string): void {
  reg.pending.set(resource, (reg.pending.get(resource) ?? 0) + 1);
}

function endPending(reg: Registry, resource: string): void {
  const left = Math.max(0, (reg.pending.get(resource) ?? 0) - 1);
  if (left === 0) reg.pending.delete(resource);
  else reg.pending.set(resource, left);
}

/**
 * Invalidate `[resource]`. Safe while optimistic/undoable writes on it are
 * pending: their patches are re-applied to whatever the refetch brings.
 */
export function invalidateResource(queryClient: QueryClient, resource: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: resourceKeys(resource).all });
}

function setProduced(reg: Registry, queryClient: QueryClient, key: QueryKey, value: unknown): void {
  const wasWriting = reg.writing;
  reg.writing = true;
  try {
    queryClient.setQueryData(key, value);
  } finally {
    reg.writing = wasWriting;
  }
  // Structural sharing may store a different object than `value`.
  const stored: unknown = queryClient.getQueryData(key);
  if (stored && typeof stored === "object") reg.produced.add(stored);
}

function applyUpdate(row: BaseRecord, data: Record<string, unknown>): BaseRecord {
  return { ...row, ...data, id: row.id };
}

/** `row` with `data`'s fields put back to what they were in `before`. */
function revertFields(row: BaseRecord, data: Record<string, unknown>, before: BaseRecord): BaseRecord {
  const out: Record<string, unknown> = { ...row };
  for (const k of Object.keys(data)) {
    if (k === "id") continue;
    if (k in before) out[k] = before[k];
    else delete out[k];
  }
  return out as BaseRecord;
}

/**
 * Applies `patches`, in order, to one cache entry's data, recording each
 * patch's before-row for that entry. Returns the same object when nothing
 * applied.
 */
function applyPatches(key: QueryKey, hash: string, value: unknown, patches: Patch[]): unknown {
  if (key[1] === "list" || key[1] === "infinite") {
    return mapLists(key, hash, value, (list, listHash) => {
      let rows = list.data;
      let total = list.total;
      let changed = false;
      for (const p of patches) {
        const index = rows.findIndex((row) => sameId(row.id, p.id));
        if (index < 0) continue;
        p.before.set(listHash, { row: rows[index]!, index });
        if (p.kind === "update") {
          rows = rows.slice();
          rows[index] = applyUpdate(rows[index]!, p.data ?? {});
        } else {
          rows = rows.filter((_, i) => i !== index);
          if (typeof total === "number" && total >= 0) total = Math.max(0, total - 1);
        }
        changed = true;
      }
      if (!changed) return list;
      return typeof total === "number" ? { ...list, data: rows, total } : { ...list, data: rows };
    });
  }
  if (key[1] === "detail" && value && typeof value === "object") {
    let row = value as BaseRecord;
    let changed = false;
    for (const p of patches) {
      if (p.kind !== "update" || !sameId(key[2], p.id)) continue;
      p.before.set(hash, { row, index: -1 });
      row = applyUpdate(row, p.data ?? {});
      changed = true;
    }
    return changed ? row : value;
  }
  return value;
}

/** Re-applies pending patches to data that just landed in the cache. */
function ensureListener(reg: Registry, queryClient: QueryClient): void {
  if (reg.unsubscribe) return;
  reg.unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (reg.writing || event.type !== "updated" || event.action.type !== "success") return;
    const { queryKey: key, queryHash: hash } = event.query;
    const resource = key[0];
    if (typeof resource !== "string") return;
    const data: unknown = event.query.state.data;
    if (!data || typeof data !== "object" || reg.produced.has(data)) return;
    const patches = reg.patches.filter((p) => p.resource === resource);
    if (patches.length === 0) return;
    const next = applyPatches(key, hash, data, patches);
    if (next !== data) setProduced(reg, queryClient, key, next);
  });
}

function addPatch(reg: Registry, queryClient: QueryClient, patch: Patch): void {
  reg.patches.push(patch);
  ensureListener(reg, queryClient);
  for (const query of queryClient.getQueryCache().findAll({ queryKey: [patch.resource] })) {
    const value: unknown = query.state.data;
    const next = applyPatches(query.queryKey, query.queryHash, value, [patch]);
    if (next !== value) setProduced(reg, queryClient, query.queryKey, next);
  }
}

function dropPatchRecord(reg: Registry, patch: Patch): number {
  const index = reg.patches.indexOf(patch);
  if (index >= 0) reg.patches.splice(index, 1);
  if (reg.patches.length === 0 && reg.unsubscribe) {
    reg.unsubscribe();
    reg.unsubscribe = undefined;
  }
  return index;
}

function firstBefore(patch: Patch): { row: BaseRecord; index: number } | undefined {
  for (const value of patch.before.values()) return value;
  return undefined;
}

/**
 * Takes a patch back out of the cache, keeping every other pending patch on
 * the same record applied (field by field, not by restoring a whole saved
 * row).
 */
function retractPatch(reg: Registry, queryClient: QueryClient, patch: Patch): void {
  const index = dropPatchRecord(reg, patch);
  if (index < 0) return;
  const onRow = (p: Patch) => p.resource === patch.resource && sameId(p.id, patch.id);
  const remaining = reg.patches.filter(onRow);

  // Later patches on the record recorded their before-rows on top of this
  // one: take its values out of them too.
  if (patch.kind === "update" && patch.data) {
    for (const later of reg.patches.slice(index).filter(onRow)) {
      for (const [hash, b] of later.before) {
        const src = patch.before.get(hash) ?? firstBefore(patch);
        if (src) later.before.set(hash, { ...b, row: revertFields(b.row, patch.data, src.row) });
      }
    }
  }

  const reapply = (row: BaseRecord) =>
    remaining.reduce((r, p) => (p.kind === "update" ? applyUpdate(r, p.data ?? {}) : r), row);

  for (const query of queryClient.getQueryCache().findAll({ queryKey: [patch.resource] })) {
    const key = query.queryKey;
    const value: unknown = query.state.data;
    let next: unknown = value;
    if (key[1] === "list" || key[1] === "infinite") {
      next = mapLists(key, query.queryHash, value, (list, listHash) => {
        const b = patch.before.get(listHash);
        const at = list.data.findIndex((row) => sameId(row.id, patch.id));
        if (patch.kind === "update") {
          const src = b ?? firstBefore(patch);
          if (at < 0 || !src || !patch.data) return list;
          const rows = list.data.slice();
          rows[at] = reapply(revertFields(rows[at]!, patch.data, src.row));
          return { ...list, data: rows };
        }
        // A delete puts the row back where it was, unless a later delete of
        // the same record still hides it.
        if (at >= 0 || !b || remaining.some((p) => p.kind === "delete")) return list;
        const rows = list.data.slice();
        rows.splice(Math.min(b.index, rows.length), 0, reapply(b.row));
        return {
          ...list,
          data: rows,
          ...(typeof list.total === "number" && list.total >= 0 ? { total: list.total + 1 } : {}),
        };
      });
    } else if (
      key[1] === "detail" &&
      patch.kind === "update" &&
      patch.data &&
      sameId(key[2], patch.id) &&
      value &&
      typeof value === "object"
    ) {
      const src = patch.before.get(query.queryHash) ?? firstBefore(patch);
      if (!src) continue;
      next = reapply(revertFields(value as BaseRecord, patch.data, src.row));
    }
    if (next !== value) setProduced(reg, queryClient, key, next);
  }
}

/**
 * A write was taken back (undone, or it failed): retract its patch, and fix
 * the later writes on the same record that have not been sent. A later
 * update that kept this write's values unchanged (its form opened from the
 * patched cache) gets them put back to what they were before; one whose
 * values are not row-shaped cannot be fixed, so it is dropped.
 */
function takeBack(reg: Registry, write: Tracked): void {
  if (write.patch) retractPatch(reg, write.queryClient, write.patch);
  if (!write.rowKey || write.kind !== "update" || !write.patch?.data) return;
  const undone = write.patch.data;
  const before = write.baseline ?? firstBefore(write.patch)?.row ?? ({} as BaseRecord);
  const later = reg.writes.filter(
    (w) =>
      w.seq > write.seq &&
      w.rowKey === write.rowKey &&
      w.kind === "update" &&
      (w.state === "waiting" || w.state === "queued"),
  );
  for (const w of later) {
    if (!w.data) {
      w.drop();
      continue;
    }
    const rebased: Record<string, unknown> = {};
    const removed: string[] = [];
    for (const k of Object.keys(undone)) {
      if (k === "id" || !(k in w.data)) continue;
      const kept = sameValue(w.data[k], undone[k]) && w.baseline != null && sameValue(w.baseline[k], undone[k]);
      if (!kept) continue;
      if (k in before) rebased[k] = before[k];
      else removed.push(k);
    }
    if (Object.keys(rebased).length === 0 && removed.length === 0) continue;
    // w.data is also w.patch.data: rebase it in place, then show it.
    Object.assign(w.data, rebased);
    for (const k of removed) delete w.data[k];
    if (w.baseline) w.baseline = revertFields(w.baseline, undone, before);
    if (w.patch) refreshFields(reg, w.queryClient, w.patch, [...Object.keys(rebased), ...removed]);
  }
}

/**
 * After a patch's values changed in place: shows its new values for `keys`
 * in every cached copy of the record, except where a later patch on the
 * record sets the same field.
 */
function refreshFields(reg: Registry, queryClient: QueryClient, patch: Patch, keys: string[]): void {
  const index = reg.patches.indexOf(patch);
  if (index < 0 || !patch.data) return;
  const data = patch.data;
  const overridden = new Set<string>();
  for (const p of reg.patches.slice(index + 1)) {
    if (p.resource === patch.resource && sameId(p.id, patch.id) && p.data) {
      for (const k of Object.keys(p.data)) overridden.add(k);
    }
  }
  const fields = keys.filter((k) => !overridden.has(k));
  if (fields.length === 0) return;
  const fix = (row: BaseRecord, hash: string): BaseRecord => {
    const out: Record<string, unknown> = { ...row };
    const before = (patch.before.get(hash) ?? firstBefore(patch))?.row;
    for (const k of fields) {
      if (k in data) out[k] = data[k];
      else if (before && k in before) out[k] = before[k];
      else delete out[k];
    }
    return out as BaseRecord;
  };
  for (const query of queryClient.getQueryCache().findAll({ queryKey: [patch.resource] })) {
    const key = query.queryKey;
    const value: unknown = query.state.data;
    let next: unknown = value;
    if (key[1] === "list" || key[1] === "infinite") {
      next = mapLists(key, query.queryHash, value, (list, listHash) => {
        const at = list.data.findIndex((row) => sameId(row.id, patch.id));
        if (at < 0) return list;
        const rows = list.data.slice();
        rows[at] = fix(rows[at]!, listHash);
        return { ...list, data: rows };
      });
    } else if (key[1] === "detail" && sameId(key[2], patch.id) && value && typeof value === "object") {
      next = fix(value as BaseRecord, query.queryHash);
    }
    if (next !== value) setProduced(reg, queryClient, key, next);
  }
}

// ---------------------------------------------------------------------------
// Page unload
//
// Waiting writes are sent when the page goes away (`beforeunload`, and
// `pagehide` for mobile tab kills and bfcache), with `keepalive: true` in
// their params so a fetch-based provider can let them outlive the page. The
// "Leave site?" prompt shows only while a write is being sent without that
// guarantee: its provider does not report `keepaliveWrites`, or it was
// already on its way without keepalive.
// ---------------------------------------------------------------------------

const allWrites = new Set<Tracked>();

function servesKeepalive(write: Tracked): boolean {
  const caps = write.queryClient.getQueryData<ProviderCapabilities>(
    capabilitiesQueryKey(write.provider, write.resource),
  );
  return caps?.keepaliveWrites === true;
}

function flushForUnload(): void {
  const writes = [...allWrites].sort((a, b) => a.seq - b.seq);
  for (const write of writes) {
    if (write.state === "waiting" || write.state === "queued") write.flush(true);
  }
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  flushForUnload();
  const atRisk = [...allWrites].some((w) => w.state === "sending" && !(w.keepalive && servesKeepalive(w)));
  if (!atRisk) return;
  event.preventDefault();
  // Older browsers need returnValue set to show the prompt.
  event.returnValue = "";
}

function onPageHide(): void {
  flushForUnload();
}

function track(write: Tracked): void {
  allWrites.add(write);
  if (allWrites.size === 1 && typeof window !== "undefined") {
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
  }
}

function untrack(write: Tracked): void {
  if (!allWrites.delete(write)) return;
  if (allWrites.size === 0 && typeof window !== "undefined") {
    window.removeEventListener("beforeunload", onBeforeUnload);
    window.removeEventListener("pagehide", onPageHide);
  }
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/** What `send` is given when the write goes out. */
export interface SendContext {
  /**
   * The row-shaped values to send, when `data` was given. They can differ
   * from `data`: an earlier write on the record that this one built on was
   * taken back, and its values were put back. Send these.
   */
  data?: Record<string, unknown>;
  /** The page is unloading: pass `keepalive: true` to the provider. */
  keepalive: boolean;
}

export interface ExecuteWriteArgs<R extends BaseRecord | void> {
  queryClient: QueryClient;
  provider: DataProvider;
  resource: string;
  kind: "create" | "update" | "delete";
  id?: Identifier;
  /**
   * The values to merge into the cached row (update). Leave out to patch
   * nothing, e.g. when the values are form-shaped and the row is not.
   */
  data?: Record<string, unknown>;
  mode: MutationMode;
  undoDelayMs?: number;
  onUndoable?: (write: UndoableWrite) => void;
  /** Sends the write. */
  send: (context: SendContext) => Promise<{ record: R; audit?: AuditEntry }>;
  /** After the write committed. Invalidates and calls success callbacks. */
  committed: (record: R) => Promise<void> | void;
  /** A write that failed (or was dropped) after the caller was told it went through. */
  failedLater: (error: Error) => void;
}

export type ExecuteWriteResult<R> =
  | { status: "committed"; record: R }
  | { status: "applied" };

const CAPABILITIES_QUERY = (provider: DataProvider, resource: string) => ({
  // The same key as useCapabilities, so the answer is shared.
  queryKey: capabilitiesQueryKey(provider, resource),
  queryFn: () => provider.capabilities!(resource),
  staleTime: Infinity,
  // A write may wait on this answer; an app's default retries would hold
  // it for seconds.
  retry: false as const,
});

/**
 * Whether `provider` serves `undo` for `resource`, from its capabilities
 * (useCapabilities' key, so the answer is shared, and scoped to this
 * provider: a swapped-out provider's capabilities never offer undo).
 * @internal Exported for tests.
 */
export async function providerServesUndo(
  queryClient: QueryClient,
  provider: DataProvider,
  resource: string,
): Promise<boolean> {
  if (!provider.undo || !provider.capabilities) return false;
  try {
    const caps = await queryClient.fetchQuery<ProviderCapabilities>(CAPABILITIES_QUERY(provider, resource));
    return caps?.undo === true;
  } catch {
    return false;
  }
}

/** A later write that built on one that was taken back. */
export const DROPPED_WRITE_MESSAGE =
  "This change was not saved: it was made on top of an earlier change that was undone or failed. Please make it again.";

/**
 * Runs one write in the given mode.
 *
 * - `pessimistic`: sends it and waits; a failure rejects.
 * - `optimistic` / `undoable`: resolves `{ status: "applied" }` as soon as
 *   the cache is patched. A later failure rolls the patch back and goes to
 *   `failedLater`, never to the returned promise.
 *
 * Writes on the same record are sent one after another, in the order they
 * were made; sending one first sends the earlier ones still waiting.
 */
export async function executeWrite<R extends BaseRecord | void>(
  args: ExecuteWriteArgs<R>,
): Promise<ExecuteWriteResult<R>> {
  const { queryClient, provider, resource, kind, id, mode, send, committed, failedLater } = args;

  if (mode === "pessimistic") {
    const { record } = await send({ data: args.data, keepalive: false });
    await committed(record);
    return { status: "committed", record };
  }

  const viaProviderUndo = mode === "undoable" && (await providerServesUndo(queryClient, provider, resource));
  // Warm the capabilities answer, so the unload handler can tell (without
  // waiting) whether this provider keeps writes alive.
  if (provider.capabilities && !queryClient.getQueryData(capabilitiesQueryKey(provider, resource))) {
    void queryClient.prefetchQuery(CAPABILITIES_QUERY(provider, resource));
  }

  const reg = registryFor(queryClient);
  const hasRow = kind !== "create" && id != null;
  const data = args.data ? { ...args.data } : undefined;
  let patch: Patch | undefined;
  if (hasRow && kind === "update" && data) patch = { resource, id: id!, kind: "update", data, before: new Map() };
  else if (hasRow && kind === "delete") patch = { resource, id: id!, kind: "delete", before: new Map() };
  // A create has no cache entry yet: its id and its place in each sorted,
  // filtered list are the server's to say.

  const delayMs = Math.max(0, args.undoDelayMs ?? DEFAULT_UNDO_DELAY_MS);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveSent: (result: { record: R; audit?: AuditEntry } | undefined) => void = () => {};
  const sent = new Promise<{ record: R; audit?: AuditEntry } | undefined>((resolve) => {
    resolveSent = resolve;
  });

  const write: Tracked = {
    seq: ++nextSeq,
    queryClient,
    provider,
    resource,
    kind,
    rowKey: hasRow ? `${resource}\u0000${String(id)}` : undefined,
    patch,
    data: kind === "update" ? data : undefined,
    baseline: hasRow ? cachedRecord(queryClient, resource, id!) : undefined,
    state: "queued",
    keepalive: false,
    dropped: false,
    flush: () => {},
    drop: () => {},
  };

  const settle = () => {
    write.state = "done";
    clearTimeout(timer);
    const at = reg.writes.indexOf(write);
    if (at >= 0) reg.writes.splice(at, 1);
    untrack(write);
    endPending(reg, resource);
  };

  const sendNow = async (keepalive: boolean): Promise<void> => {
    if (write.state !== "queued") return;
    write.state = "sending";
    write.keepalive = keepalive;
    let result: { record: R; audit?: AuditEntry };
    try {
      result = await send({ data: write.data, keepalive });
    } catch (error) {
      settle();
      takeBack(reg, write);
      void invalidateResource(queryClient, resource);
      failedLater(asError(error));
      resolveSent(undefined);
      return;
    }
    // The server has it now; the refetch `committed` starts replaces the patch.
    if (patch) dropPatchRecord(reg, patch);
    settle();
    try {
      await committed(result.record);
    } catch (error) {
      // The write did commit; only a callback failed.
      console.error(`[genesis] after-write callback failed for "${resource}":`, error);
    }
    resolveSent(result);
  };

  const enqueue = () => {
    if (!write.rowKey) {
      void sendNow(false);
      return;
    }
    const key = write.rowKey;
    const previous = reg.rowTails.get(key);
    const run = () => sendNow(false);
    const next = previous ? previous.then(run, run) : run();
    reg.rowTails.set(key, next);
    void next.finally(() => {
      if (reg.rowTails.get(key) === next) reg.rowTails.delete(key);
    });
  };

  write.flush = (unloading = false) => {
    if (write.state === "waiting") {
      clearTimeout(timer);
      // Earlier writes on the record go first, so the server sees them in order.
      if (!unloading) {
        for (const earlier of reg.writes) {
          if (earlier.seq < write.seq && earlier.rowKey === write.rowKey && earlier.rowKey && earlier.state === "waiting") {
            earlier.flush();
          }
        }
      }
      write.state = "queued";
      if (unloading) void sendNow(true);
      else enqueue();
    } else if (write.state === "queued" && unloading) {
      // Behind an earlier write on the record; the page will not wait for it.
      void sendNow(true);
    }
  };

  write.drop = () => {
    if (write.state !== "waiting" && write.state !== "queued") return;
    write.dropped = true;
    settle();
    takeBack(reg, write);
    void invalidateResource(queryClient, resource);
    failedLater(new Error(DROPPED_WRITE_MESSAGE));
    resolveSent(undefined);
  };

  beginPending(reg, resource);
  reg.writes.push(write);
  track(write);
  if (patch) addPatch(reg, queryClient, patch);

  if (mode === "optimistic") {
    enqueue();
    return { status: "applied" };
  }

  if (viaProviderUndo) {
    enqueue();
    void sent.then((result) => {
      const auditId = result?.audit?.id;
      if (!result || !args.onUndoable) return;
      if (!auditId) {
        console.warn(
          `[genesis] "${resource}" serves undo, but its ${kind} returned no audit entry; no undo offered.`,
        );
        return;
      }
      let undone = false;
      args.onUndoable({
        resource,
        kind,
        id: id ?? (result.record as BaseRecord | undefined)?.id,
        strategy: "provider",
        delayMs,
        commit: () => {},
        undo: async () => {
          if (undone) return false;
          undone = true;
          let ok = true;
          try {
            await provider.undo!(resource, { auditId });
          } catch (error) {
            ok = false;
            failedLater(asError(error));
          }
          await invalidateResource(queryClient, resource);
          return ok;
        },
      });
    });
    return { status: "applied" };
  }

  // Delayed: wait, then send unless undone or flushed first.
  write.state = "waiting";
  timer = setTimeout(() => write.flush(), delayMs);

  args.onUndoable?.({
    resource,
    kind,
    id,
    strategy: "delay",
    delayMs,
    commit: () => write.flush(),
    undo: async () => {
      if (write.dropped) return true;
      if (write.state !== "waiting") return false;
      settle();
      takeBack(reg, write);
      void invalidateResource(queryClient, resource);
      resolveSent(undefined);
      return true;
    },
  });

  return { status: "applied" };
}
