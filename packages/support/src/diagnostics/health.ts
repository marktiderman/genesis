/**
 * Health checks (support-features 5.7, 4.2.10): a small registry where packages and the app
 * register named checks. Each answers ok, warn or fail with a message. The devtools overlay runs
 * them and shows the results (genesis-native's `createDevtools({ checks })`), and
 * `healthChecksSection(checks)` puts the latest results in the context dump as `checks`.
 *
 *   import { healthChecks, supabaseHealthChecks } from "@marktiderman/genesis-support";
 *   healthChecks.register(...supabaseHealthChecks(supabase));
 *   healthChecks.register({ name: "socket", run: () => (socket.connected ? { status: "ok" } : { status: "fail", message: "not connected" }) });
 *
 * Platform-neutral. A check that throws, or takes longer than its timeout (5 s), fails.
 */
import { DIAGNOSTICS_DEFAULTS, defineDiagnosticSection, type DiagnosticCheck, type DiagnosticSection } from "./report";

export type HealthStatus = "ok" | "warn" | "fail";

export const HEALTH_STATUSES: readonly HealthStatus[] = ["ok", "warn", "fail"];

/** What a check answers. */
export interface HealthAnswer {
  status: HealthStatus;
  message?: string | null;
}

export interface HealthCheck {
  /** Unique in the registry (`supabase.reachable`). Registering a name again replaces it. */
  name: string;
  run: () => HealthAnswer | Promise<HealthAnswer>;
  /** Default 5000 ms. */
  timeoutMs?: number;
}

/** One check's latest result. */
export interface HealthResult {
  name: string;
  status: HealthStatus;
  message: string | null;
  /** How long it took. */
  ms: number;
  /** ISO time it finished. */
  at: string;
}

export interface HealthChecks {
  /** Add checks (or replace ones with the same name). Returns a function that removes them. */
  register(...checks: HealthCheck[]): () => void;
  /** The registered checks, in the order they were added. */
  list(): readonly HealthCheck[];
  /** Run every check at once and keep the results. */
  run(): Promise<HealthResult[]>;
  /** Run one check again (a devtools "Try again") and keep its result with the others. Null when no check has that name. `createHealthChecks` has it; a registry of your own may leave it out. */
  runCheck?(name: string): Promise<HealthResult | null>;
  /** The last results, empty before the first run. */
  latest(): readonly HealthResult[];
  /** Called after each run. */
  subscribe(listener: () => void): () => void;
}

export const HEALTH_CHECK_TIMEOUT_MS = 5000;

/** Results older than this are run again before they go in a dump. */
export const HEALTH_RESULTS_MAX_AGE_MS = 5 * 60_000;

const statusOf = (value: unknown): HealthStatus => (HEALTH_STATUSES.includes(value as HealthStatus) ? (value as HealthStatus) : "fail");

/** A registry of its own (tests, a second app in one process). Most apps use `healthChecks`. */
export function createHealthChecks(options: { now?: () => number } = {}): HealthChecks & Required<Pick<HealthChecks, "runCheck">> {
  const now = options.now ?? Date.now;
  const checks = new Map<string, HealthCheck>();
  const listeners = new Set<() => void>();
  let results: HealthResult[] = [];

  async function runOne(check: HealthCheck): Promise<HealthResult> {
    const started = now();
    const timeoutMs = check.timeoutMs ?? HEALTH_CHECK_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let answer: HealthAnswer;
    try {
      answer = await Promise.race([
        Promise.resolve().then(check.run),
        new Promise<HealthAnswer>((resolve) => {
          timer = setTimeout(() => resolve({ status: "fail", message: `timed out after ${timeoutMs} ms` }), timeoutMs);
        }),
      ]);
    } catch (error) {
      answer = { status: "fail", message: error instanceof Error ? error.message : "the check threw" };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    const finished = now();
    return { name: check.name, status: statusOf(answer?.status), message: answer?.message ?? null, ms: Math.max(0, finished - started), at: new Date(finished).toISOString() };
  }

  return {
    register(...added) {
      for (const check of added) checks.set(check.name, check);
      return () => {
        for (const check of added) if (checks.get(check.name) === check) checks.delete(check.name);
      };
    },
    list: () => [...checks.values()],
    async run() {
      results = await Promise.all([...checks.values()].map(runOne));
      listeners.forEach((listener) => listener());
      return results;
    },
    async runCheck(name) {
      const check = checks.get(name);
      if (!check) return null;
      const result = await runOne(check);
      results = results.some((r) => r.name === name) ? results.map((r) => (r.name === name ? result : r)) : [...results, result];
      listeners.forEach((listener) => listener());
      return result;
    },
    latest: () => results,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The app's registry: packages and the app register into it. */
export const healthChecks = /* @__PURE__ */ createHealthChecks();

/** A result as the dump keeps it. */
export function toDiagnosticCheck(result: HealthResult): DiagnosticCheck {
  return { name: result.name, status: result.status, ok: result.status !== "fail", ms: result.ms, detail: result.message, at: result.at };
}

/**
 * The dump's `checks` section: the latest results, each with when it ran. When nothing has run yet,
 * or the last run is over 5 minutes old, it runs the checks first (within its timeout). No checks
 * registered: nothing.
 */
export function healthChecksSection(checks: HealthChecks = healthChecks, options: { now?: () => number } = {}): DiagnosticSection {
  const now = options.now ?? Date.now;
  return defineDiagnosticSection(
    "checks",
    async () => {
      if (!checks.list().length) return null;
      const latest = checks.latest();
      const stale = !latest.length || latest.some((r) => !(now() - Date.parse(r.at) <= HEALTH_RESULTS_MAX_AGE_MS));
      const results = stale ? await checks.run() : latest;
      return results.slice(0, DIAGNOSTICS_DEFAULTS.maxChecks).map(toDiagnosticCheck);
    },
    { timeoutMs: HEALTH_CHECK_TIMEOUT_MS + 1000 },
  );
}

/** Just what the two checks below read from a Supabase client. */
export interface HealthSupabaseLike {
  auth: { getSession(): Promise<{ data: { session: unknown | null }; error: unknown }> };
  from(table: string): {
    select(columns: string, options: { head: boolean; count?: "exact" }): { limit(n: number): PromiseLike<{ status: number; error: { message: string } | null }> };
  };
}

/**
 * Two checks every Genesis app with Supabase can make:
 *
 * - `supabase.reachable`: a one-row read of `table` (default `support_reports`). Any answer from
 *   the server is ok (a refusal still means it's there); a server error warns; no answer fails.
 * - `auth.session`: a signed-in session on this device is ok; none warns.
 */
export function supabaseHealthChecks(supabase: HealthSupabaseLike, options: { table?: string } = {}): HealthCheck[] {
  const table = options.table ?? "support_reports";
  return [
    {
      name: "supabase.reachable",
      async run() {
        const { status, error } = await supabase.from(table).select("id", { head: true }).limit(1);
        if (!status) return { status: "fail", message: error?.message ?? "no answer" };
        if (status >= 500) return { status: "warn", message: `the server answered ${status}` };
        return { status: "ok", message: `answered ${status}` };
      },
    },
    {
      name: "auth.session",
      async run() {
        const { data, error } = await supabase.auth.getSession();
        if (error) return { status: "fail", message: error instanceof Error ? error.message : "the session couldn't be read" };
        return data.session ? { status: "ok", message: "signed in" } : { status: "warn", message: "signed out" };
      },
    },
  ];
}
