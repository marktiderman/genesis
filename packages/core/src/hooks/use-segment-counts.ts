import { useQueries } from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import { resolveAggregate } from "../provider/aggregate";
import type { FilterParam } from "../provider/types";
import { resourceKeys } from "../query-keys";
import type { ResourceContract } from "../schema/types";
import type { ResourceView } from "../resource-view/types";
import { useViewer } from "./viewer-scope";

/**
 * Each segment's row count for a view's list (ADR 0017), for the segments that ask for one
 * (`count: true`): the list's other filters (scope, the screen's, the declared filters) plus the
 * segment's own, counted through the provider (estimated). A segment without a count, or one not
 * counted yet, maps to undefined. The web's segment strip, the inbox rail and the phone's segment
 * chips all read it.
 *
 * @stability Beta
 */
export function useSegmentCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract and row
  view: ResourceView<ResourceContract<any>, any>,
  baseFilters: readonly FilterParam[],
  options: { enabled?: boolean } = {},
): Readonly<Record<string, number | undefined>> {
  const provider = useDataProvider();
  const viewer = useViewer();
  const segments = view.segments();
  const counted = useQueries({
    queries: segments.map((s) => {
      const params = { metrics: { n: { fn: "count" as const } }, filters: [...baseFilters, ...view.segmentFilters(s.id, viewer)], count: "estimated" as const };
      return {
        queryKey: resourceKeys(view.resource).aggregate(params),
        queryFn: () => resolveAggregate(provider, view.resource, params),
        enabled: !!s.count && options.enabled !== false,
      };
    }),
  });
  const out: Record<string, number | undefined> = {};
  segments.forEach((s, i) => {
    const n = counted[i]?.data?.values["n"];
    out[s.id] = typeof n === "number" ? n : undefined;
  });
  return out;
}
