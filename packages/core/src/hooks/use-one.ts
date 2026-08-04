import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import type { BaseRecord, Identifier } from "../provider/types";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface UseOneOptions {
  /** Supabase select/join syntax, e.g. "*, author:profiles(name)". */
  select?: string;
  /** Defaults to `!!id` — won't fetch when id is falsy. */
  enabled?: boolean;
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

  const { select, enabled } = options;
  const isEnabled = enabled ?? !!id;

  return useQuery<T>({
    // `select` is part of the key because it is part of the REQUEST: two pages
    // asking for the same record with different projections get different
    // rows back, and keying only on the id makes them share one cache entry.
    // Whichever mounted first wins for the whole staleTime window, and the
    // other silently renders a record missing the joined fields it asked for
    // — no error, no refetch, just absent data. `useResource`'s list key has
    // always included `select` (it keys on the whole `params` object); this
    // was the one place it did not.
    queryKey: [resource, "detail", id, select],
    queryFn: async () => {
      if (id == null) throw new Error("Missing id");
      const result = await provider.getOne<T>(resource, { id, select });
      return result.data;
    },
    enabled: isEnabled,
  });
}
