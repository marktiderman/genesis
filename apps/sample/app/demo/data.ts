/**
 * The demo's named reads and writes, so screens never call the provider
 * themselves. Each read is scoped to the current workspace, the same way
 * the views are (`scope: ["org_id"]`).
 */
import { useResource, useViewerScope } from "@marktiderman/genesis-core/hooks";
import type { FilterParam } from "@marktiderman/genesis-core/provider";
import type { Booking, Client } from "./seed";

function useOrgFilter(): FilterParam[] {
  const orgId = useViewerScope().scope?.orgId;
  if (orgId === undefined) return [];
  return [Array.isArray(orgId) ? { field: "org_id", operator: "in", value: [...orgId] } : { field: "org_id", operator: "eq", value: orgId as string }];
}

/** The workspace's clients (all of them, for counts and pickers). */
export function useClients(extra: FilterParam[] = []) {
  const { list, create } = useResource<Client>("clients", { defaultFilters: [...useOrgFilter(), ...extra], defaultPerPage: 500 });
  return { rows: list.data?.data ?? [], loading: list.isLoading, create };
}

/** The workspace's bookings. */
export function useBookings(extra: FilterParam[] = []) {
  const { list } = useResource<Booking>("bookings", { defaultFilters: [...useOrgFilter(), ...extra], defaultPerPage: 500 });
  return { rows: list.data?.data ?? [], loading: list.isLoading };
}
