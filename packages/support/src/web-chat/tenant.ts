/**
 * The tenant a web screen is for, as a value it can key on: the prop, or the client's `tenantId`
 * option as it is now (a function can change when the viewer changes workspace), so another tenant
 * is a fresh screen with its own cache.
 */
import { useQuery } from "@tanstack/react-query";
import type { SupportClient } from "../client";

const clientIds = new WeakMap<SupportClient, number>();
let nextClientId = 1;

/** A client's id, so two clients never share a cache. */
function idOf(client: SupportClient): number {
  let id = clientIds.get(client);
  if (id === undefined) {
    id = nextClientId++;
    clientIds.set(client, id);
  }
  return id;
}

/** What a screen's data belongs to, for its query keys and its React key. */
export function scopeOf(client: SupportClient, tenantId: string | null): string {
  return `${idOf(client)}:${tenantId ?? "app"}`;
}

/** `ready` is false until it's known: a screen doesn't read or write until then, or it could use the wrong tenant. */
export function useResolvedTenant(client: SupportClient, tenantId: string | null | undefined): { ready: boolean; tenantId: string | null } {
  const option = useQuery({
    queryKey: ["genesis-support", "tenant-option", idOf(client)],
    queryFn: async () => (client.currentTenant ? await client.currentTenant() : null),
    enabled: tenantId === undefined,
    staleTime: 0,
    refetchInterval: 30_000,
  });
  if (tenantId !== undefined) return { ready: true, tenantId };
  return { ready: option.data !== undefined, tenantId: option.data ?? null };
}
