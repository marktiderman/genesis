import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import type { ProviderCapabilities } from "../schema/types";

/**
 * What the data provider can do for `resource` (`provider.capabilities`),
 * cached per resource. `data` stays undefined for a provider that doesn't
 * report capabilities, so a UI keeps its defaults.
 */
export function useCapabilities(
  resource: string | undefined,
  options: { enabled?: boolean } = {},
): UseQueryResult<ProviderCapabilities> {
  const provider = useDataProvider();
  return useQuery<ProviderCapabilities>({
    queryKey: ["__capabilities", resource ?? ""],
    queryFn: () => provider.capabilities!(resource),
    enabled: (options.enabled ?? true) && !!provider.capabilities,
    staleTime: Infinity,
  });
}
