/**
 * The feature registry in the database: the client half of
 * `migrations/0008_genesis_feature_registry.sql`. The server syncs the code
 * registry on deploy; anyone building the gate's snapshot reads a tenant's
 * runtime state in one call.
 */
// A cycle with ./index, used only inside the functions.
import { must, type PostgrestErrorLike } from "./index";

/** The parts of a Supabase client these helpers use. A `SupabaseClient` fits. */
export interface FeatureRegistryClient {
  // Loose on purpose, as in tenant-features: an app's generated types may not list these yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (
    fn: any,
    ...rest: any[]
  ) => PromiseLike<{ data: unknown; error: PostgrestErrorLike | null }>;
}

type RpcResult =
  { data: unknown; error: null } | { data: null; error: PostgrestErrorLike };

/**
 * A tenant's runtime state for the gate, shaped to spread into a
 * `GateContext`: `{ platform, ...await featureGateState(client, tenantId) }`.
 *
 * @stability Beta
 */
export interface FeatureGateState {
  /** Feature ids the tenant switched off. */
  off: string[];
  /** Feature ids the tenant holds an active entitlement for. */
  entitlements: string[];
  /** Flag values set for the tenant, by flag name. */
  flags: Record<string, unknown>;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];

/**
 * A tenant's switches, entitlements and flag values: `feature_gate_state`.
 * Works with a signed-in person's client (for tenants they belong to) or the
 * service key. Throws a `SupabaseQueryError` (`42501`) for anyone else, so a
 * refusal is never mistaken for "nothing set".
 *
 * @stability Beta
 */
export async function featureGateState(
  client: FeatureRegistryClient,
  tenantId: string,
): Promise<FeatureGateState> {
  const data = must(
    (await client.rpc("feature_gate_state", { tenant: tenantId })) as RpcResult,
  ) as Record<string, unknown> | null;
  const flags = data?.flags;
  return {
    off: strings(data?.off),
    entitlements: strings(data?.entitled),
    flags:
      flags && typeof flags === "object" && !Array.isArray(flags)
        ? { ...(flags as Record<string, unknown>) }
        : {},
  };
}

/** `features.json` as `genesis features build` writes it. @stability Beta */
export interface FeatureRegistryDocument {
  features: readonly ({ id: string } & Record<string, unknown>)[];
  flags?: Readonly<Record<string, Record<string, unknown>>>;
}

/** @stability Beta */
export interface SyncFeatureRegistryOptions {
  /**
   * When this deployment started serving, in milliseconds (`Date.now()` at server start), not its
   * build time: an instant rollback to an older build then syncs as the newest. Older versions
   * than the last sync are refused.
   */
  version: number;
  /** Allow a registry that drops more than a fifth of the features (at least 3). Default false. */
  allowShrink?: boolean;
}

/** JSON with object keys sorted, so the hash doesn't depend on key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    return `{${entries
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Copy the registry into the database: `sync_feature_registry`. Call it with
 * the service key when a production deployment starts serving, never from a
 * preview. Returns false when the database already has this registry or a
 * newer one; throws (`22023`) for an empty registry or one that drops most
 * features, unless `allowShrink`.
 *
 * ```ts
 * import registry from "../features.json";
 * if (process.env.VERCEL_ENV === "production") await syncFeatureRegistry(admin, registry, { version: Date.now() });
 * ```
 *
 * @stability Beta
 */
export async function syncFeatureRegistry(
  client: FeatureRegistryClient,
  document: FeatureRegistryDocument,
  options: SyncFeatureRegistryOptions,
): Promise<boolean> {
  if (!Number.isSafeInteger(options.version) || options.version < 0) {
    throw new TypeError(
      "syncFeatureRegistry: version must be a non-negative integer",
    );
  }
  const features = [...document.features];
  const flags = Object.entries(document.flags ?? {}).map(([key, flag]) => ({
    key,
    ...flag,
  }));
  const hash = await sha256(canonical({ features, flags }));
  return (
    must(
      (await client.rpc("sync_feature_registry", {
        version: options.version,
        hash,
        features,
        flags,
        allow_shrink: options.allowShrink ?? false,
      })) as RpcResult,
    ) === true
  );
}
