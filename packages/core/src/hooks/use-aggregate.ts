import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import { resolveAggregate, type ResolveAggregateOptions } from "../provider/aggregate";
import type { AggregateParams, AggregateResult } from "../provider/types";
import { resourceKeys } from "../query-keys";
import { useLiveInvalidation, type LiveOptions } from "./use-live";

export interface UseAggregateOptions extends ResolveAggregateOptions {
  /** Default true. False waits (on a scope, say) and fetches nothing. */
  enabled?: boolean;
  /**
   * Keep the totals current while mounted: work them out again when the provider reports a
   * change to the resource (`DataProvider.subscribe`). Off by default.
   */
  live?: boolean | LiveOptions;
}

/**
 * Totals over a resource's rows (count, and sum, average, lowest or highest of a field), through
 * the data provider: its `aggregate`, or `resolveAggregate`'s fallback. Cached under the
 * resource's key, so any write to the resource through Genesis makes them stale, and `live`
 * keeps them current with changes made elsewhere. A widget reads a view's totals with it.
 *
 * @stability Beta
 */
export function useAggregate(
  resource: string,
  params: AggregateParams,
  options: UseAggregateOptions = {},
): UseQueryResult<AggregateResult> {
  const provider = useDataProvider();
  const { enabled = true, live, pageSize, maxRows } = options;
  const key = resourceKeys(resource).aggregate(params);
  useLiveInvalidation(resource, live, enabled, params.filters ? { filters: params.filters } : {}, key);
  return useQuery<AggregateResult>({
    queryKey: key,
    queryFn: () =>
      resolveAggregate(provider, resource, params, {
        ...(pageSize !== undefined ? { pageSize } : {}),
        ...(maxRows !== undefined ? { maxRows } : {}),
      }),
    enabled,
  });
}
