import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import type { ProviderCapabilities } from "../schema/types";

// A stable id per provider object, so capabilities cached for one provider
// are never served for another that shares the same QueryClient.
const providerIds = new WeakMap<object, number>();
let nextProviderId = 1;

function providerId(provider: object): number {
  let id = providerIds.get(provider);
  if (id === undefined) {
    id = nextProviderId++;
    providerIds.set(provider, id);
  }
  return id;
}

/**
 * The query key for `provider`'s capabilities for `resource`. It includes
 * the provider's identity: swapping the provider (another tenant, a
 * different store) asks the new one instead of reusing the old answer.
 * @internal
 */
export function capabilitiesQueryKey(provider: object, resource: string | undefined): readonly unknown[] {
  return ["__capabilities", providerId(provider), resource ?? ""];
}

/**
 * What the data provider can do for `resource` (`provider.capabilities`),
 * cached per provider and resource. `data` stays undefined for a provider
 * that doesn't report capabilities, so a UI keeps its defaults.
 */
export function useCapabilities(
  resource: string | undefined,
  options: { enabled?: boolean } = {},
): UseQueryResult<ProviderCapabilities> {
  const provider = useDataProvider();
  return useQuery<ProviderCapabilities>({
    queryKey: capabilitiesQueryKey(provider, resource),
    queryFn: () => provider.capabilities!(resource),
    enabled: (options.enabled ?? true) && !!provider.capabilities,
    // Fresh for as long as this provider is in use; a swapped-out provider's
    // entry has no observers and is collected after the usual gcTime.
    staleTime: Infinity,
  });
}
