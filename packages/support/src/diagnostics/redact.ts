/**
 * `redactReport`: the privacy rules for a dump, applied on the device before it
 * is sent and again on the server before it is stored (support-platform §3.5):
 *
 * 1. The person is an id and a role, nothing else.
 * 2. Every string goes through the scrubber (`scrubString`): emails, phone
 *    numbers, JWTs, bearer and API tokens, long hex runs and query strings are
 *    removed, and values under a key that names a secret (`password`, `token`,
 *    `authorization`, `cookie`, `email`, …) become `[Filtered]`.
 * 3. Routes are paths only, with private-looking segments replaced
 *    (`cleanRoute`).
 * 4. The ids the dump needs to be useful (its own, the feedback's, Sentry's
 *    event and replay ids, a commit) are kept when they have their exact shape,
 *    and scrubbed like any text when they don't.
 *
 * Fails closed: a section that can't be scrubbed is written as null.
 */
import { cleanRoute } from "../contract";
import { FILTERED, isSecretKey, scrubString, scrubUrl, scrubValue } from "./scrub";
import {
  DIAGNOSTIC_TRIGGERS,
  DIAGNOSTICS_SCHEMA,
  isUuid,
  type DiagnosticBreadcrumb,
  type DiagnosticCheck,
  type DiagnosticConsoleLine,
  type DiagnosticError,
  type DiagnosticReport,
  type DiagnosticTrigger,
} from "./report";

export interface RedactOptions {
  /**
   * App sections declared `pii: "none"` (numbers and counts): only their keys are checked, so a
   * hex id in one isn't rewritten. The server never passes this; it applies every rule.
   */
  trustedSections?: readonly string[];
}

const HEX_ID = /^[0-9a-f]{32}$/i;
const COMMIT = /^[0-9a-f]{7,40}$/i;
const SAFE_PATH = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;

const str = (value: unknown): string | null => (typeof value === "string" ? scrubString(value) : value === null || value === undefined ? null : scrubString(String(value)));
const bool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** An id kept only in its exact shape; anything else is scrubbed as text. */
const keepId = (value: unknown, shape: RegExp): string | null => {
  if (typeof value !== "string" || !value) return null;
  return shape.test(value) ? value : scrubString(value);
};

/** A scrubbed object, or null when it isn't one or scrubbing threw (fail closed). */
function scrubObject(value: unknown): Record<string, unknown> | null {
  const obj = record(value);
  if (!obj) return null;
  try {
    return scrubValue(obj) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Keys only: a value under a secret key is filtered; strings are cut to 4 KB but not rewritten. */
function filterKeys(value: unknown, key = "", depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (key && isSecretKey(key)) return value === undefined || value === null || value === "" ? value : FILTERED;
  if (typeof value === "string") return value.length > 4096 ? `${value.slice(0, 4096)}…[truncated]` : value;
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  if (depth >= 8) return "[Truncated]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => filterKeys(item, "", depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = filterKeys(v, k, depth + 1, seen);
  return out;
}

function redactError(value: unknown): DiagnosticError | null {
  const e = record(value);
  if (!e) return null;
  return { at: str(e["at"]), name: str(e["name"]), message: str(e["message"]), source: str(e["source"]), fatal: bool(e["fatal"]) };
}

function redactCrumb(value: unknown): DiagnosticBreadcrumb | null {
  const c = record(value);
  if (!c) return null;
  const category = str(c["category"]);
  // A navigation breadcrumb's message is a route: a path only.
  const message = category === "navigation" && typeof c["message"] === "string" ? (cleanRoute(c["message"]) ?? null) : str(c["message"]);
  return { at: str(c["at"]), category, message, level: str(c["level"]), data: scrubObject(c["data"]) };
}

function redactLine(value: unknown): DiagnosticConsoleLine | null {
  const l = record(value);
  if (!l || typeof l["text"] !== "string") return null;
  return { at: str(l["at"]), level: str(l["level"]) ?? "log", text: scrubString(l["text"]) };
}

function redactCheck(value: unknown): DiagnosticCheck | null {
  const c = record(value);
  if (!c || typeof c["name"] !== "string") return null;
  return { name: scrubString(c["name"]), ok: c["ok"] === true, ms: num(c["ms"]), detail: str(c["detail"]) };
}

const list = <T,>(value: unknown, each: (item: unknown) => T | null): T[] => (Array.isArray(value) ? value.map(each).filter((x): x is T => x !== null) : []);

/**
 * The report with every rule applied. Accepts any object (the server passes what arrived) and
 * returns the report's exact shape: unknown top-level keys are dropped, missing sections are null.
 */
export function redactReport(input: DiagnosticReport, options: RedactOptions = {}): DiagnosticReport {
  const r = input as unknown as Record<string, unknown>;
  const trusted = new Set(options.trustedSections ?? []);
  const app = record(r["app"]) ?? {};
  const user = record(r["user"]);
  const session = record(r["session"]);
  const server = record(r["server"]);
  const build = record(r["build"]);
  const sentry = record(r["sentry"]);
  const logs = record(r["logs"]) ?? {};

  const sections: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(record(r["sections"]) ?? {})) {
    if (!SAFE_PATH.test(name)) continue;
    try {
      sections[name] = trusted.has(name) ? filterKeys(value) : scrubValue(value);
    } catch {
      sections[name] = null;
    }
  }

  let redactedSession: DiagnosticReport["session"] = null;
  if (session) {
    const rest = scrubObject(Object.fromEntries(Object.entries(session).filter(([k]) => !["route", "recentRoutes", "uptimeMs", "foreground"].includes(k)))) ?? {};
    redactedSession = {
      ...rest,
      uptimeMs: num(session["uptimeMs"]),
      route: typeof session["route"] === "string" ? (cleanRoute(session["route"]) ?? null) : null,
      recentRoutes: Array.isArray(session["recentRoutes"])
        ? session["recentRoutes"].map((x) => (typeof x === "string" ? cleanRoute(x) : undefined)).filter((x): x is string => Boolean(x))
        : [],
      foreground: bool(session["foreground"]),
    };
  }

  let redactedBuild: DiagnosticReport["build"] = null;
  if (build) {
    const scrubbed = scrubObject(build) ?? {};
    redactedBuild = {
      ...scrubbed,
      version: str(build["version"]),
      build: str(build["build"]),
      runtimeVersion: str(build["runtimeVersion"]),
      channel: str(build["channel"]),
      requestedChannel: str(build["requestedChannel"]),
      updateId: str(build["updateId"]),
      launch: str(build["launch"]),
      emergency: bool(build["emergency"]),
      commit: keepId(build["commit"], COMMIT),
      otaNumber: str(build["otaNumber"]),
      release: str(build["release"]),
      releasePublishedAt: str(build["releasePublishedAt"]),
      jsBundle: str(build["jsBundle"]),
    };
  }

  let redactedServer: DiagnosticReport["server"] = null;
  if (server) {
    redactedServer = {
      ...(scrubObject(server) ?? {}),
      baseUrl: typeof server["baseUrl"] === "string" ? scrubUrl(server["baseUrl"]) : null,
      apiCommit: keepId(server["apiCommit"], COMMIT),
    };
  }

  const device = scrubObject(r["device"]);
  // Permission states by name: the names are the app's own (`microphone` reads as a contact
  // detail to the key rule), and a state is one short word, so both are kept only in that shape.
  const rawPermissions = record(record(r["device"])?.["permissions"]);
  if (device && rawPermissions) {
    device["permissions"] = Object.fromEntries(
      Object.entries(rawPermissions).filter(([k, v]) => SAFE_PATH.test(k) && typeof v === "string" && /^[A-Za-z_-]{1,32}$/.test(v)),
    );
  }
  const trigger = DIAGNOSTIC_TRIGGERS.includes(r["trigger"] as DiagnosticTrigger) ? (r["trigger"] as DiagnosticTrigger) : "manual";
  const flags = scrubObject(r["flags"]);
  const blocks = Array.isArray(r["blocks"]) ? r["blocks"].filter((b): b is string => typeof b === "string").map(scrubString) : null;
  const checks = Array.isArray(r["checks"]) ? list(r["checks"], redactCheck) : null;

  return {
    schema: DIAGNOSTICS_SCHEMA,
    id: isUuid(r["id"]) ? r["id"] : "00000000-0000-0000-0000-000000000000",
    createdAt: typeof r["createdAt"] === "string" && !Number.isNaN(Date.parse(r["createdAt"])) ? new Date(r["createdAt"]).toISOString() : new Date(0).toISOString(),
    trigger,
    feedbackId: isUuid(r["feedbackId"]) ? r["feedbackId"] : null,
    app: { id: str(app["id"]), name: str(app["name"]), platform: str(app["platform"]), environment: str(app["environment"]) },
    build: redactedBuild,
    server: redactedServer,
    device: device as DiagnosticReport["device"],
    // D5: an id and a role, whatever else was sent.
    user: user ? { id: str(user["id"]), role: str(user["role"]) } : null,
    session: redactedSession,
    flags,
    blocks,
    logs: { errors: list(logs["errors"], redactError), breadcrumbs: list(logs["breadcrumbs"], redactCrumb), console: list(logs["console"], redactLine) },
    sentry: sentry ? { lastEventId: keepId(sentry["lastEventId"], HEX_ID), replayId: keepId(sentry["replayId"], HEX_ID) } : null,
    checks,
    sections,
    truncated: Array.isArray(r["truncated"]) ? [...new Set(r["truncated"].filter((t): t is string => typeof t === "string" && SAFE_PATH.test(t)))] : [],
  };
}
