/**
 * The tenant a web screen is for, as a value it can key on: the prop, or the client's `tenantId`
 * option as it is now (a function can change when the viewer changes workspace), so another tenant
 * is a fresh screen with its own cache.
 */
import { useEffect } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupportClient } from "../client";

const clientIds = new WeakMap<object, number>();
let nextClientId = 1;

/** A client's id, so two clients never share a cache. */
function idOf(client: object): number {
  let id = clientIds.get(client);
  if (id === undefined) {
    id = nextClientId++;
    clientIds.set(client, id);
  }
  return id;
}

/** A support client and a tenant, for a screen's query keys and its React key. It doesn't name the login: see `useLoginScope`. */
export function scopeOf(client: object, tenantId: string | null): string {
  return `${idOf(client)}:${tenantId ?? "app"}`;
}

/** What reads that differ by who asks are keyed by: `scope` is null until the login is known. */
export interface LoginScope {
  scope: string | null;
  /** The login couldn't be read: show that, not a placeholder for ever. */
  failed: boolean;
  error: unknown;
}

/**
 * The client, the signed-in login and the tenant, for the keys of reads that differ by who asks:
 * another login on the same client never reads the last one's cache. It reads the login again when
 * someone signs in or out (`onSignedInChange`). A client without `signedInId` serves one login, and
 * keys by the client alone.
 */
export function useLoginScope(client: Pick<SupportClient, "signedInId" | "onSignedInChange">, tenantId: string | null): LoginScope {
  const queryClient = useQueryClient();
  const id = idOf(client);
  useEffect(() => client.onSignedInChange?.(() => void queryClient.invalidateQueries({ queryKey: ["genesis-support", "login", id] })), [client, queryClient, id]);
  const signedInId = client.signedInId?.bind(client);
  const login = useQuery({
    queryKey: ["genesis-support", "login", id],
    queryFn: signedInId ?? skipToken,
    staleTime: Infinity,
    retry: false,
  });
  if (!signedInId) return { scope: `${scopeOf(client, tenantId)}:-`, failed: false, error: null };
  if (login.isError) return { scope: null, failed: true, error: login.error };
  return { scope: login.isSuccess ? `${scopeOf(client, tenantId)}:${login.data ?? "signed-out"}` : null, failed: false, error: null };
}

/** `ready` is false until it's known: a screen doesn't read or write until then, or it could use the wrong tenant. */
export function useResolvedTenant(client: SupportClient, tenantId: string | null | undefined): { ready: boolean; failed: boolean; tenantId: string | null } {
  const option = useQuery({
    queryKey: ["genesis-support", "tenant-option", idOf(client)],
    queryFn: async () => (client.currentTenant ? await client.currentTenant() : null),
    enabled: tenantId === undefined,
    staleTime: 0,
    refetchInterval: 30_000,
    retry: false,
  });
  if (tenantId !== undefined) return { ready: true, failed: false, tenantId };
  const ready = option.data !== undefined;
  return { ready, failed: !ready && option.isError, tenantId: option.data ?? null };
}
