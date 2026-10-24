/**
 * The release policy: the oldest store version each platform may run, a
 * maintenance switch, and release notes. It comes from an
 * `UpdatePolicySource` (a static object, Supabase, or your own), is cached on
 * the phone, and **fails open**: no answer, a timeout, a malformed value or
 * an untrusted cache never blocks anyone.
 *
 * What may block, and from where:
 * - Force upgrade: a policy fetched this session, or a cached one no older
 *   than `cacheMaxAgeMs` (7 days) by the phone's clock. A cache whose time is
 *   in the future (the clock moved back) is not trusted. A minimum without a
 *   store link for the platform forces nothing (there would be no way out).
 * - Maintenance: only a policy fetched from the network this session. A
 *   cached maintenance flag never blocks a cold start.
 */
import { createStore, delay, type Store } from "./store";
import { isBelowMinimum } from "./version";
import { toError, type UpdatesOnError, type UpdatesStorageLike } from "./modules";

export type UpdatePlatform = "ios" | "android";

export interface ReleaseNote {
  /** The store version these notes describe, e.g. `"1.4.0"`. */
  version: string;
  title?: string;
  body: string;
}

export interface UpdatePolicy {
  /** The oldest store version still supported, per platform. Missing or malformed: no minimum. */
  minimumVersion?: Partial<Record<UpdatePlatform, string>>;
  /** Where "Update" goes (`https://apps.apple.com/…`, `itms-apps://…`, `market://…`, `https://play.google.com/…`). */
  storeUrl?: Partial<Record<UpdatePlatform, string>>;
  maintenance?: { active: boolean; message: string | null };
  notes?: readonly ReleaseNote[];
}

/** Where the policy comes from. `load` throws (or rejects) when it can't answer; resolving `null` means "no policy". */
export interface UpdatePolicySource {
  load(): Promise<UpdatePolicy | null | undefined>;
}

/** A policy written in the app (or a test). */
export function staticPolicySource(policy: UpdatePolicy): UpdatePolicySource {
  return { load: async () => policy };
}

/** A Supabase client: anything with `from(table)` (a real `SupabaseClient` fits without a cast). */
export interface PolicyClientLike {
  from(table: string): unknown;
}

interface PolicyQuery {
  select(columns: string): { eq(column: string, value: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> } };
}

export interface SupabasePolicySourceOptions {
  /** The `app_id` row to read. Default `"default"`. */
  appId?: string;
  /** Default `"app_release_policy"` (migration `0002_genesis_app_release_policy.sql` in `@marktiderman/genesis-supabase`). */
  table?: string;
}

const COLUMNS = "min_version_ios,min_version_android,store_url_ios,store_url_android,maintenance,maintenance_message,notes";

/**
 * Reads one row of `public.app_release_policy` (readable by anon and
 * authenticated, written only with the service role). No row is no policy.
 */
export function supabasePolicySource(client: PolicyClientLike, options: SupabasePolicySourceOptions = {}): UpdatePolicySource {
  const { appId = "default", table = "app_release_policy" } = options;
  return {
    async load() {
      const query = client.from(table) as PolicyQuery;
      const { data, error } = await query.select(COLUMNS).eq("app_id", appId).maybeSingle();
      if (error) throw toError(error instanceof Error ? error : (error as { message?: unknown }).message ?? error);
      if (!data || typeof data !== "object") return {};
      const row = data as Record<string, unknown>;
      return {
        minimumVersion: pick({ ios: row.min_version_ios, android: row.min_version_android }),
        storeUrl: pick({ ios: row.store_url_ios, android: row.store_url_android }),
        maintenance: { active: row.maintenance === true, message: typeof row.maintenance_message === "string" ? row.maintenance_message : null },
        notes: Array.isArray(row.notes) ? (row.notes as ReleaseNote[]) : [],
      };
    },
  };
}

function pick(values: Record<UpdatePlatform, unknown>): Partial<Record<UpdatePlatform, string>> {
  const out: Partial<Record<UpdatePlatform, string>> = {};
  for (const platform of ["ios", "android"] as const) {
    const value = values[platform];
    if (typeof value === "string" && value.trim() !== "") out[platform] = value.trim();
  }
  return out;
}

const STORE_URL = /^(https:\/\/|itms-apps:\/\/|market:\/\/)/i;

/** Keeps only well-formed fields; throws when `raw` isn't an object at all (so the cache answers instead). */
export function sanitizePolicy(raw: unknown): UpdatePolicy {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("The release policy is not an object");
  const value = raw as Record<string, unknown>;
  const policy: UpdatePolicy = {};
  const minimum = value.minimumVersion && typeof value.minimumVersion === "object" ? (value.minimumVersion as Record<UpdatePlatform, unknown>) : null;
  if (minimum) policy.minimumVersion = pick(minimum);
  const store = value.storeUrl && typeof value.storeUrl === "object" ? pick(value.storeUrl as Record<UpdatePlatform, unknown>) : null;
  if (store) {
    for (const platform of ["ios", "android"] as const) if (store[platform] && !STORE_URL.test(store[platform])) delete store[platform];
    policy.storeUrl = store;
  }
  const maintenance = value.maintenance as { active?: unknown; message?: unknown } | null | undefined;
  if (maintenance && typeof maintenance === "object") {
    policy.maintenance = {
      active: maintenance.active === true,
      message: typeof maintenance.message === "string" && maintenance.message.trim() !== "" ? maintenance.message : null,
    };
  }
  if (Array.isArray(value.notes)) {
    policy.notes = value.notes.flatMap((note): ReleaseNote[] => {
      if (!note || typeof note !== "object") return [];
      const { version, title, body } = note as Record<string, unknown>;
      if (typeof version !== "string" || typeof body !== "string") return [];
      return [{ version: version.trim(), body, ...(typeof title === "string" ? { title } : {}) }];
    });
  }
  return policy;
}

export type PolicyOrigin = "network" | "cache" | "none";

export interface PolicyState {
  /** `loading` until the first answer (or the timeout); then `ready`, with or without a policy. */
  status: "loading" | "ready";
  policy: UpdatePolicy | null;
  /** `network`: fetched this session. `cache`: read from the phone. `none`: no answer yet (fail open). */
  origin: PolicyOrigin;
  /** When it was fetched, by the phone's clock (ms). */
  fetchedAt: number | null;
  /** The last failed fetch, if the most recent one failed. */
  error: Error | null;
  /** A fetch is in flight. */
  refreshing: boolean;
}

export interface PolicyStoreOptions {
  source: UpdatePolicySource;
  storage?: UpdatesStorageLike;
  /** Default `"genesis:updates:policy"`. */
  cacheKey?: string;
  /** The longest `load()` waits before carrying on without an answer. Default 3000 ms. */
  timeoutMs?: number;
  now?: () => number;
  onError?: UpdatesOnError;
}

export interface PolicyStore extends Pick<Store<PolicyState>, "getState" | "subscribe"> {
  /** The first load: the cache and the network together, for at most `timeoutMs`. Never rejects; runs once. */
  load(): Promise<void>;
  /** Fetch again (maintenance "Try again", the app coming to the front). Never rejects; resolves true on an answer. */
  refresh(): Promise<boolean>;
  /** `refresh()` unless one ran less than `minIntervalMs` ago. */
  refreshIfDue(minIntervalMs: number): Promise<boolean>;
}

interface CacheEntry {
  v: 1;
  savedAt: number;
  policy: UpdatePolicy;
}

export function createPolicyStore(options: PolicyStoreOptions): PolicyStore {
  const { source, storage, cacheKey = "genesis:updates:policy", now = Date.now, onError } = options;
  const timeoutMs = validTimeout(options.timeoutMs, 3000);
  const store = createStore<PolicyState>({ status: "loading", policy: null, origin: "none", fetchedAt: null, error: null, refreshing: false });
  let inflight: Promise<boolean> | null = null;
  let firstLoad: Promise<void> | null = null;
  let lastAttempt: number | null = null;
  const report = (error: unknown, from: "policy" | "storage") => {
    try {
      onError?.(toError(error), from);
    } catch {
      // A failing reporter must not change the answer.
    }
  };

  const fetchNetwork = (): Promise<boolean> => {
    if (inflight) return inflight;
    lastAttempt = now();
    store.setState({ refreshing: true });
    // eslint-disable-next-line prefer-const -- read in `finally`, after the assignment below
    let run!: Promise<boolean>;
    run = (async () => {
      // Never settle synchronously: a source that throws before its first await must not leave a settled `inflight` behind.
      await null;
      try {
        const policy = sanitizePolicy(await source.load());
        const fetchedAt = now();
        store.setState({ status: "ready", policy, origin: "network", fetchedAt, error: null });
        if (storage) {
          const entry: CacheEntry = { v: 1, savedAt: fetchedAt, policy };
          Promise.resolve()
            .then(() => storage.setItem(cacheKey, JSON.stringify(entry)))
            .catch((error) => report(error, "storage"));
        }
        return true;
      } catch (error) {
        report(error, "policy");
        // A network answer from earlier this session stays; the cache (if any) was already applied.
        store.setState({ error: toError(error) });
        return false;
      } finally {
        if (inflight === run) inflight = null;
        store.setState({ refreshing: false });
      }
    })();
    inflight = run;
    return run;
  };

  const readCache = async () => {
    if (!storage) return;
    try {
      const entry = parseCache(await storage.getItem(cacheKey));
      if (entry && store.getState().origin !== "network") {
        store.setState({ policy: entry.policy, origin: "cache", fetchedAt: entry.savedAt });
      }
    } catch (error) {
      report(error, "storage");
    }
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    load() {
      firstLoad ??= (async () => {
        const cache = readCache();
        const network = fetchNetwork();
        const answered = network.then(async (ok) => {
          if (!ok) await cache;
        });
        await Promise.race([answered, delay(timeoutMs)]);
        store.setState({ status: "ready" });
      })();
      return firstLoad;
    },
    refresh: fetchNetwork,
    refreshIfDue(minIntervalMs) {
      const at = now();
      // A clock that moved back makes the last attempt look in the future: refresh.
      if (lastAttempt !== null && at >= lastAttempt && at - lastAttempt < minIntervalMs) return Promise.resolve(false);
      return fetchNetwork();
    },
  };
}

/** A finite, non-negative timeout, or `fallback` (a NaN or Infinity would wait forever). */
export function validTimeout(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseCache(raw: string | null): CacheEntry | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as Partial<CacheEntry>;
    if (entry?.v !== 1 || typeof entry.savedAt !== "number" || !Number.isFinite(entry.savedAt)) return null;
    return { v: 1, savedAt: entry.savedAt, policy: sanitizePolicy(entry.policy) };
  } catch {
    return null;
  }
}

/** What the policy says this install must do. */
export type UpdateVerdict =
  | { kind: "ok" }
  | { kind: "forceUpgrade"; minimumVersion: string; installedVersion: string; storeUrl: string }
  | { kind: "maintenance"; message: string | null };

export interface EvaluatePolicyOptions {
  /** `Platform.OS`. Only `ios` and `android` can be forced to upgrade. */
  platform: string;
  /** The installed store version (`Application.nativeApplicationVersion`). `null`: never forced. */
  installedVersion: string | null;
  now: number;
  /** How old a cached policy may be and still force an upgrade. Default 7 days. */
  cacheMaxAgeMs?: number;
}

/** How far in the future a cache's time may be (clocks drift) before it isn't trusted. */
export const CLOCK_SKEW_MS = 5 * 60_000;
export const WEEK_MS = 7 * 24 * 60 * 60_000;

/** Force upgrade first (the store is the way out), then maintenance, else ok. Fails open. */
export function evaluatePolicy(state: PolicyState, options: EvaluatePolicyOptions): UpdateVerdict {
  const { policy, origin, fetchedAt } = state;
  if (!policy) return { kind: "ok" };
  const { platform, installedVersion, now, cacheMaxAgeMs = WEEK_MS } = options;
  const age = fetchedAt === null ? null : now - fetchedAt;
  const trusted = origin === "network" || (origin === "cache" && age !== null && age >= -CLOCK_SKEW_MS && age <= cacheMaxAgeMs);
  if (trusted && (platform === "ios" || platform === "android")) {
    const minimum = policy.minimumVersion?.[platform];
    const storeUrl = policy.storeUrl?.[platform];
    // Without a store link there is no way out of the screen, so no store link means no force upgrade.
    if (minimum && storeUrl && installedVersion && isBelowMinimum(installedVersion, minimum)) {
      return { kind: "forceUpgrade", minimumVersion: minimum.trim(), installedVersion, storeUrl };
    }
  }
  if (origin === "network" && policy.maintenance?.active === true) {
    return { kind: "maintenance", message: policy.maintenance.message };
  }
  return { kind: "ok" };
}
