// ---------------------------------------------------------------------------
// Live reads — refetch a resource's cached reads when the provider reports a
// change (`DataProvider.subscribe`).
//
// Events are invalidation hints only. Nothing from an event's payload is
// written to the cache: the refetch goes through the provider's normal read,
// so what a user sees is always what that read (and its RLS) returns.
//
// Pending optimistic and undoable writes are safe: their patches are
// re-applied to whatever a refetch brings (see mutation-mode.ts), so a row
// deleted with undo stays hidden and an edit stays shown until the write
// settles. A change caused by this client's own write arrives as an event
// too; the refetch it causes is idempotent, so it is not filtered out.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import type { ResourceChangeEvent, SubscribeParams } from "../provider/types";

/** How long a burst of change events is gathered into one refetch. */
export const DEFAULT_LIVE_DEBOUNCE_MS = 250;

/** `live` as an object, to tune it. `live: true` takes the defaults. */
export interface LiveOptions {
  /**
   * Events arriving within this many milliseconds of each other cause one
   * refetch, not one each. Default {@link DEFAULT_LIVE_DEBOUNCE_MS}. A
   * steady stream still refetches at least every `4 × debounceMs`.
   */
  debounceMs?: number;
}

const warnedNoSubscribe = new WeakSet<object>();

/**
 * Subscribes while mounted and `enabled`, and invalidates `queryKey` (a
 * prefix) once per burst of events that `accept` lets through. While the
 * page is hidden the queries are only marked stale; they refetch when it is
 * shown again (TanStack Query's `refetchOnWindowFocus`) or next used.
 *
 * @internal Used by `useResource` and `useOne`'s `live` option.
 */
export function useLiveInvalidation(
  resource: string,
  live: boolean | LiveOptions | undefined,
  enabled: boolean,
  params: SubscribeParams,
  queryKey: QueryKey,
  accept?: (event: ResourceChangeEvent) => boolean,
): void {
  const provider = useDataProvider();
  const queryClient = useQueryClient();
  const on = !!live && enabled;
  const debounceMs = Math.max(
    0,
    (typeof live === "object" ? live.debounceMs : undefined) ?? DEFAULT_LIVE_DEBOUNCE_MS,
  );
  const paramsKey = JSON.stringify(params);
  const keyKey = JSON.stringify(queryKey);

  // The latest values, read when an event arrives, so a new array or
  // callback each render doesn't resubscribe.
  const latest = useRef({ queryKey, accept, params });
  latest.current = { queryKey, accept, params };

  useEffect(() => {
    if (!on) return;
    if (typeof provider.subscribe !== "function") {
      if (process.env.NODE_ENV !== "production" && !warnedNoSubscribe.has(provider)) {
        warnedNoSubscribe.add(provider);
        console.warn(
          `[genesis] "${resource}" asked for live updates, but the data provider has no subscribe(); the list will only refresh on its own reads.`,
        );
      }
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let burstStart = 0;
    let active = true;
    // A busy table must not postpone the refetch forever.
    const maxWaitMs = debounceMs * 4;
    const fire = () => {
      timer = undefined;
      if (!active) return;
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      void queryClient.invalidateQueries({
        queryKey: [...latest.current.queryKey],
        refetchType: hidden ? "none" : "active",
      });
    };
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = provider.subscribe(resource, latest.current.params, (event) => {
        if (!active) return;
        const test = latest.current.accept;
        if (test && event.type !== "changed" && !test(event)) return;
        // Coalesce: one refetch per burst, after it goes quiet (or has
        // lasted `maxWaitMs`).
        const now = Date.now();
        if (timer === undefined) burstStart = now;
        else clearTimeout(timer);
        timer = setTimeout(fire, Math.min(debounceMs, Math.max(0, burstStart + maxWaitMs - now)));
      });
    } catch (error) {
      console.error(`[genesis] subscribing to "${resource}" failed:`, error);
    }
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
      try {
        unsubscribe?.();
      } catch (error) {
        console.error(`[genesis] unsubscribing from "${resource}" failed:`, error);
      }
    };
    // `paramsKey` / `keyKey` stand for `params` / `queryKey` by value.
  }, [on, provider, queryClient, resource, debounceMs, paramsKey, keyKey]);
}
