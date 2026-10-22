import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import type { ProviderCapabilities } from "../schema/types";

export interface UseCapabilitiesOptions {
  /** Default true. */
  enabled?: boolean;
}

/**
 * What the mounted provider can do, for one resource or overall
 * (`DataProvider.capabilities`), fetched once and cached. `data` stays
 * undefined for a provider without `capabilities`, and a failed call is not
 * retried: a UI falls back to its defaults.
 *
 * The key (`["genesis", "capabilities", resource]`) sits outside a
 * resource's own `[resource]` keys, so a write's invalidation never
 * refetches it.
 */
export function useCapabilities(
  resource?: string,
  options: UseCapabilitiesOptions = {},
): UseQueryResult<ProviderCapabilities> {
  const provider = useDataProvider();
  return useQuery<ProviderCapabilities>({
    queryKey: ["genesis", "capabilities", resource ?? null],
    queryFn: () => provider.capabilities!(resource),
    enabled: (options.enabled ?? true) && typeof provider.capabilities === "function",
    staleTime: Infinity,
    retry: false,
  });
}
