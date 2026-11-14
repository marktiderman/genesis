import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import type { BaseRecord, FilterParam, Identifier } from "../provider/types";
import { useLiveInvalidation, type LiveOptions } from "./use-live";
import { resourceKeys } from "../query-keys";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface UseOneOptions {
  /** Supabase select/join syntax, e.g. "*, author:profiles(name)". */
  select?: string;
  /** Defaults to `!!id` — won't fetch when id is falsy. */
  enabled?: boolean;
  /**
   * Keep the record current while mounted: refetch it when the provider
   * reports a change to it (`DataProvider.subscribe`). See
   * `UseResourceOptions.live`. Off by default.
   */
  live?: boolean | LiveOptions;
  /**
   * The list's filters, when the record is opened from a list (`GetOneParams.scope`): a resource
   * read from a function takes its scope from them. Text searches (`contains`) are left out; the
   * rest are kept, and they're part of the cache key when there are any.
   */
  scope?: FilterParam[] | undefined;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetch a single record by id, powered by TanStack Query.
 *
 * Returns the full `UseQueryResult<T>` with the data unwrapped from the
 * provider's `GetOneResult` wrapper.
 */
export function useOne<T extends BaseRecord = BaseRecord>(
  resource: string,
  id: Identifier | undefined | null,
  options: UseOneOptions = {},
): UseQueryResult<T> {
  const provider = useDataProvider();

  const { select, enabled, live } = options;
  // The list's filters as a function source's `args` gets them (`filters`, `take`), less a text
  // search: `contains` narrows a list, never a scope, and keeping it would make a new record read
  // per keystroke. An `in` scope (a link filter, a multi-value segment) and ranges stay.
  const scopeKey = JSON.stringify((options.scope ?? []).filter((f) => f.operator !== "contains"));
  const scope = useMemo(() => JSON.parse(scopeKey) as FilterParam[], [scopeKey]);
  const isEnabled = enabled ?? !!id;

  // Only this record's events; `changed` (events may have been missed) too.
  useLiveInvalidation(
    resource,
    live,
    isEnabled && id != null,
    id != null ? { id } : {},
    resourceKeys(resource).detailsOf(id),
    (event) => event.type === "changed" || !("id" in event) || event.id == null || String(event.id) === String(id),
  );

  return useQuery<T>({
    // `select` is part of the key because it is part of the REQUEST: two pages
    // asking for the same record with different projections get different
    // rows back, and keying only on the id makes them share one cache entry.
    // Whichever mounted first wins for the whole staleTime window, and the
    // other silently renders a record missing the joined fields it asked for
    // — no error, no refetch, just absent data. `useResource`'s list key has
    // always included `select` (it keys on the whole `params` object); this
    // was the one place it did not.
    queryKey: scope?.length ? [...resourceKeys(resource).detail(id, select), { scope }] : resourceKeys(resource).detail(id, select),
    queryFn: async () => {
      if (id == null) throw new Error("Missing id");
      const result = await provider.getOne<T>(resource, { id, select, ...(scope?.length ? { scope } : {}) });
      return result.data;
    },
    enabled: isEnabled,
  });
}
