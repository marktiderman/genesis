/**
 * Tenant features: the client half of `migrations/0004_genesis_tenant_features.sql`.
 * A tenant's admins turn a shipped feature off (or back on) for their tenant,
 * with a reason; its members read which ids are off and hide them.
 *
 * Exposure only: a switch hides a feature, it never grants or denies access
 * to data (that is RLS) and never sells it (that is an entitlement).
 */
// A cycle with ./index, used only inside the functions.
import { must, type PostgrestErrorLike } from "./index";

/** The parts of a Supabase client these helpers use. A `SupabaseClient` fits. */
export interface TenantFeaturesClient {
  // Loose on purpose: a client typed by an app's Database narrows `rpc`'s
  // function names, and the app's generated types may not list these yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, ...rest: any[]) => PromiseLike<{ data: unknown; error: PostgrestErrorLike | null }>;
}

type RpcResult = { data: unknown; error: null } | { data: null; error: PostgrestErrorLike };

/** Which features a tenant has turned off. A feature not in `off` is on. @stability Beta */
export interface TenantFeatures {
  readonly tenantId: string;
  readonly off: ReadonlySet<string>;
  isOn(featureId: string): boolean;
}

/**
 * The features `tenantId` has turned off, for one of its members (or
 * admins): `tenant_features_off`. Throws a `SupabaseQueryError` (`42501`)
 * for anyone else, so a refusal is never mistaken for "everything on".
 *
 * ```ts
 * const features = await tenantFeatures(supabase, teamId);
 * if (features.isOn("chat")) showChatTab();
 * ```
 *
 * @stability Beta
 */
export async function tenantFeatures(client: TenantFeaturesClient, tenantId: string): Promise<TenantFeatures> {
  const data = must((await client.rpc("tenant_features_off", { tenant: tenantId })) as RpcResult);
  const off = new Set(Array.isArray(data) ? data.filter((id): id is string => typeof id === "string") : []);
  return Object.freeze({ tenantId, off, isOn: (featureId: string) => !off.has(featureId) });
}

/** @stability Beta */
export interface SetTenantFeatureInput {
  tenantId: string;
  featureId: string;
  enabled: boolean;
  /** Why, in at most 500 characters. Required: it goes in the history. */
  reason: string;
}

/**
 * Turn a feature on or off for a tenant: `set_tenant_feature`. Only the
 * tenant's admins (the app's `private.genesis_tenant_admin` hook); throws a
 * `SupabaseQueryError` otherwise (`42501`), for a blank reason (`22023`) or
 * a malformed feature id (`23514`).
 *
 * @stability Beta
 */
export async function setTenantFeature(client: TenantFeaturesClient, input: SetTenantFeatureInput): Promise<void> {
  must(
    (await client.rpc("set_tenant_feature", {
      tenant: input.tenantId,
      feature: input.featureId,
      enabled: input.enabled,
      reason: input.reason,
    })) as RpcResult,
  );
}

/** One switch a tenant has set. @stability Beta */
export interface TenantFeatureSetting {
  feature_id: string;
  enabled: boolean;
  reason: string;
  updated_by: string | null;
  updated_at: string;
}

/** Every switch a tenant has set, with its reason, for its admins: `tenant_feature_settings`. @stability Beta */
export async function tenantFeatureSettings(client: TenantFeaturesClient, tenantId: string): Promise<TenantFeatureSetting[]> {
  return (must((await client.rpc("tenant_feature_settings", { tenant: tenantId })) as RpcResult) ?? []) as TenantFeatureSetting[];
}

/** One change to a tenant's switches. `enabled` is null when a switch row was deleted (back to on). @stability Beta */
export interface TenantFeatureChange {
  feature_id: string;
  enabled: boolean | null;
  reason: string | null;
  /** The person, or null for the service role, a migration, or a person since deleted. */
  changed_by: string | null;
  changed_role: string;
  changed_at: string;
}

/** A tenant's history of changes, newest first (at most `maxRows`, 1 to 1000, default 100), for its admins. @stability Beta */
export async function tenantFeatureHistory(
  client: TenantFeaturesClient,
  tenantId: string,
  options: { maxRows?: number } = {},
): Promise<TenantFeatureChange[]> {
  const args = options.maxRows === undefined ? { tenant: tenantId } : { tenant: tenantId, max_rows: options.maxRows };
  return (must((await client.rpc("tenant_feature_history", args)) as RpcResult) ?? []) as TenantFeatureChange[];
}
