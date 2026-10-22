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
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { BaseRecord, DataProvider, Identifier, ListResult } from "../provider/types";
import type { AuditEntry, ProviderCapabilities } from "../schema/types";

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
   * Take the write back. Resolves true when it was undone, false when it
   * could not be: already sent under `delay` (the window closed, or the hook
   * unmounted), already undone, or the provider's undo failed (reported
   * through `onError`). Safe to call more than once.
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
// Writes in flight per QueryClient and resource
//
// While an optimistic or undoable write on a resource is pending, refetching
// that resource would bring back the server's rows and wipe the patch. So a
// write's `[resource]` invalidation waits until no patched write on the
// resource is left; the last one to settle refetches.
// ---------------------------------------------------------------------------

const pendingByClient = new WeakMap<QueryClient, Map<string, number>>();

function pendingMap(queryClient: QueryClient): Map<string, number> {
  let map = pendingByClient.get(queryClient);
  if (!map) {
    map = new Map();
    pendingByClient.set(queryClient, map);
  }
  return map;
}

/** Optimistic or undoable writes on `resource` not yet settled. */
export function pendingWriteCount(queryClient: QueryClient, resource: string): number {
  return pendingMap(queryClient).get(resource) ?? 0;
}

function beginPending(queryClient: QueryClient, resource: string): void {
  const map = pendingMap(queryClient);
  map.set(resource, (map.get(resource) ?? 0) + 1);
}

/** Returns how many are left. */
function endPending(queryClient: QueryClient, resource: string): number {
  const map = pendingMap(queryClient);
  const left = Math.max(0, (map.get(resource) ?? 0) - 1);
  if (left === 0) map.delete(resource);
  else map.set(resource, left);
  return left;
}

/**
 * Invalidate `[resource]`, unless a patched write on it is still pending
 * (the last one to settle refetches).
 */
export function invalidateResource(queryClient: QueryClient, resource: string): Promise<void> {
  if (pendingWriteCount(queryClient, resource) > 0) return Promise.resolve();
  return queryClient.invalidateQueries({ queryKey: [resource] });
}

// ---------------------------------------------------------------------------
// Cache patches
//
// Lists live at [resource, "list", params] as ListResult; one record at
// [resource, "detail", id, select]. A patch touches only the record it is
// about, and its rollback puts back only that record, so two writes on
// different records never undo each other.
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

function isDetailKeyFor(key: QueryKey, resource: string, id: Identifier): boolean {
  return key[0] === resource && key[1] === "detail" && sameId(key[2], id);
}

/** The record as the cache has it now, from a detail entry or any list. */
export function cachedRecord(
  queryClient: QueryClient,
  resource: string,
  id: Identifier,
): BaseRecord | undefined {
  for (const [key, value] of queryClient.getQueriesData<unknown>({ queryKey: [resource, "detail"] })) {
    if (isDetailKeyFor(key, resource, id) && value && typeof value === "object") return value as BaseRecord;
  }
  for (const [, value] of queryClient.getQueriesData<unknown>({ queryKey: [resource, "list"] })) {
    if (!isListResult(value)) continue;
    const found = value.data.find((row) => sameId(row.id, id));
    if (found) return found;
  }
  return undefined;
}

type Rollback = () => void;

function patchUpdate(
  queryClient: QueryClient,
  resource: string,
  id: Identifier,
  data: Record<string, unknown>,
): Rollback {
  const lists: { key: QueryKey; previous: BaseRecord }[] = [];
  const details: { key: QueryKey; previous: unknown }[] = [];
  for (const [key, value] of queryClient.getQueriesData<unknown>({ queryKey: [resource, "list"] })) {
    if (!isListResult(value)) continue;
    const index = value.data.findIndex((row) => sameId(row.id, id));
    if (index < 0) continue;
    const previous = value.data[index]!;
    lists.push({ key, previous });
    const rows = value.data.slice();
    rows[index] = { ...previous, ...data, id: previous.id };
    queryClient.setQueryData(key, { ...value, data: rows });
  }
  for (const [key, value] of queryClient.getQueriesData<unknown>({ queryKey: [resource, "detail"] })) {
    if (!isDetailKeyFor(key, resource, id) || !value || typeof value !== "object") continue;
    details.push({ key, previous: value });
    queryClient.setQueryData(key, { ...(value as BaseRecord), ...data, id: (value as BaseRecord).id });
  }
  return () => {
    for (const { key, previous } of lists) {
      const now = queryClient.getQueryData<unknown>(key);
      if (!isListResult(now)) continue;
      const index = now.data.findIndex((row) => sameId(row.id, id));
      if (index < 0) continue;
      const rows = now.data.slice();
      rows[index] = previous;
      queryClient.setQueryData(key, { ...now, data: rows });
    }
    for (const { key, previous } of details) queryClient.setQueryData(key, previous);
  };
}

function patchDelete(queryClient: QueryClient, resource: string, id: Identifier): Rollback {
  const lists: { key: QueryKey; index: number; previous: BaseRecord }[] = [];
  for (const [key, value] of queryClient.getQueriesData<unknown>({ queryKey: [resource, "list"] })) {
    if (!isListResult(value)) continue;
    const index = value.data.findIndex((row) => sameId(row.id, id));
    if (index < 0) continue;
    lists.push({ key, index, previous: value.data[index]! });
    const rows = value.data.filter((_, i) => i !== index);
    queryClient.setQueryData(key, {
      ...value,
      data: rows,
      total: typeof value.total === "number" ? Math.max(0, value.total - 1) : value.total,
    });
  }
  return () => {
    for (const { key, index, previous } of lists) {
      const now = queryClient.getQueryData<unknown>(key);
      if (!isListResult(now) || now.data.some((row) => sameId(row.id, id))) continue;
      const rows = now.data.slice();
      rows.splice(Math.min(index, rows.length), 0, previous);
      queryClient.setQueryData(key, {
        ...now,
        data: rows,
        total: typeof now.total === "number" ? now.total + 1 : now.total,
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Pending (delayed) writes — flushed on unmount and before the page unloads
// ---------------------------------------------------------------------------

interface DelayedWrite {
  /** Sends it now, if it is still waiting. */
  flush: () => void;
}

const allDelayed = new Set<DelayedWrite>();

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (allDelayed.size === 0) return;
  // Send what is waiting, and ask the browser to hold the page so the
  // requests can finish (the user may still leave).
  for (const write of [...allDelayed]) write.flush();
  event.preventDefault();
  event.returnValue = "";
}

function trackDelayed(write: DelayedWrite): void {
  allDelayed.add(write);
  if (allDelayed.size === 1 && typeof window !== "undefined") {
    window.addEventListener("beforeunload", onBeforeUnload);
  }
}

function untrackDelayed(write: DelayedWrite): void {
  if (!allDelayed.delete(write)) return;
  if (allDelayed.size === 0 && typeof window !== "undefined") {
    window.removeEventListener("beforeunload", onBeforeUnload);
  }
}

/** The delayed writes one hook instance started, flushed when it unmounts. */
export type DelayedWrites = Set<DelayedWrite>;

/**
 * A hook's own set of delayed writes. When the hook unmounts (the form
 * closes, the route changes) every write still waiting is sent at once,
 * as React Admin does: leaving is not undoing.
 */
export function useDelayedWrites(): DelayedWrites {
  const [writes] = useState<DelayedWrites>(() => new Set());
  useEffect(
    () => () => {
      for (const write of [...writes]) write.flush();
    },
    [writes],
  );
  return writes;
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

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
  /** The delayed writes of the calling hook instance. */
  delayed: DelayedWrites;
  /** Sends the write. */
  send: () => Promise<{ record: R; audit?: AuditEntry }>;
  /**
   * After the write committed. Invalidates and calls success callbacks; its
   * `[resource]` invalidation should go through `invalidateResource`.
   */
  committed: (record: R) => Promise<void> | void;
  /** A write that failed after the caller was already told it went through. */
  failedLater: (error: Error) => void;
}

export type ExecuteWriteResult<R> =
  | { status: "committed"; record: R }
  | { status: "applied" };

async function providerServesUndo(
  queryClient: QueryClient,
  provider: DataProvider,
  resource: string,
): Promise<boolean> {
  if (!provider.undo || !provider.capabilities) return false;
  try {
    const caps = await queryClient.fetchQuery<ProviderCapabilities>({
      // The same key as useCapabilities, so the answer is shared.
      queryKey: ["__capabilities", resource],
      queryFn: () => provider.capabilities!(resource),
      staleTime: Infinity,
      // The write waits on this answer; an app's default retries would
      // hold it for seconds.
      retry: false,
    });
    return caps?.undo === true;
  } catch {
    return false;
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Runs one write in the given mode.
 *
 * - `pessimistic`: sends it and waits; a failure rejects.
 * - `optimistic` / `undoable`: resolves `{ status: "applied" }` as soon as
 *   the cache is patched. A later failure rolls the patch back and goes to
 *   `failedLater`, never to the returned promise.
 */
export async function executeWrite<R extends BaseRecord | void>(
  args: ExecuteWriteArgs<R>,
): Promise<ExecuteWriteResult<R>> {
  const { queryClient, provider, resource, kind, id, data, mode, send, committed, failedLater } = args;

  if (mode === "pessimistic") {
    const { record } = await send();
    await committed(record);
    return { status: "committed", record };
  }

  const viaProviderUndo = mode === "undoable" && (await providerServesUndo(queryClient, provider, resource));

  // A fetch already on its way would land after the patch and overwrite it.
  await queryClient.cancelQueries({ queryKey: [resource] });

  beginPending(queryClient, resource);
  let rollback: Rollback = () => {};
  if (kind === "update" && id != null && data) rollback = patchUpdate(queryClient, resource, id, data);
  else if (kind === "delete" && id != null) rollback = patchDelete(queryClient, resource, id);
  // A create has no cache entry yet: its id and its place in each sorted,
  // filtered list are the server's to say.

  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    if (endPending(queryClient, resource) === 0) {
      void queryClient.invalidateQueries({ queryKey: [resource] });
    }
  };

  const commitNow = async (): Promise<{ record: R; audit?: AuditEntry } | undefined> => {
    let result: { record: R; audit?: AuditEntry };
    try {
      result = await send();
    } catch (error) {
      rollback();
      end();
      failedLater(asError(error));
      return undefined;
    }
    try {
      await committed(result.record);
    } catch (error) {
      // The write did commit; only a callback failed.
      console.error(`[genesis] after-write callback failed for "${resource}":`, error);
    }
    end();
    return result;
  };

  const delayMs = Math.max(0, args.undoDelayMs ?? DEFAULT_UNDO_DELAY_MS);

  if (mode === "optimistic") {
    void commitNow();
    return { status: "applied" };
  }

  if (viaProviderUndo) {
    void commitNow().then((result) => {
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
  let state: "waiting" | "sent" | "cancelled" = "waiting";
  const write: DelayedWrite = {
    flush: () => {
      if (state !== "waiting") return;
      state = "sent";
      clearTimeout(timer);
      args.delayed.delete(write);
      untrackDelayed(write);
      void commitNow();
    },
  };
  const timer = setTimeout(write.flush, delayMs);
  args.delayed.add(write);
  trackDelayed(write);

  args.onUndoable?.({
    resource,
    kind,
    id,
    strategy: "delay",
    delayMs,
    commit: write.flush,
    undo: async () => {
      if (state !== "waiting") return false;
      state = "cancelled";
      clearTimeout(timer);
      args.delayed.delete(write);
      untrackDelayed(write);
      rollback();
      end();
      return true;
    },
  });

  return { status: "applied" };
}
