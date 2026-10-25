/**
 * The genesis-support-intake Edge Function's request handling, with its
 * dependencies passed in (index.ts wires the real ones), so it is tested
 * without Deno or a database.
 *
 *   GET                       the boot handshake: a public BootConfig
 *   POST { op: "submit", … }  opens a report (SubmitFeedbackInput) as the caller
 *   POST { op: "list" }       the caller's own reports (FeedbackReportSummary[])
 *     Authorization: Bearer <the person's access token>
 *
 * Every database call runs as the caller (a client made with their token), so
 * row level security decides, exactly as for the app's own Supabase client:
 * this function never holds the service role. It exists for clients that
 * don't run supabase-js (a script-tag loader, another backend).
 *
 * Browser origins: only those in GENESIS_SUPPORT_ORIGINS (comma-separated)
 * get CORS headers, and a request from any other origin is refused. Native
 * apps send no Origin. Responses carry an `error` code, never a database
 * message.
 */
import {
  CONTRACT_VERSION,
  WIDGET_HEADERS,
  validateSubmitInput,
  type BootConfig,
  type FeedbackReportSummary,
  type FeedbackStatus,
  type FeedbackReportType,
  type SubmitFeedbackResult,
} from "./contract.ts";

/** The slice of a supabase-js client (made with the caller's token) the handler uses. */
export interface CallerClient {
  insertReport(row: Record<string, unknown>): Promise<{ id: string; status: string } | { error: string }>;
  listReports(limit: number): Promise<Array<Record<string, unknown>> | { error: string }>;
}

export interface IntakeDeps {
  env: (name: string) => string | undefined;
  /** A client acting as the person behind this access token. */
  clientFor(accessToken: string): CallerClient;
  log: (message: string) => void;
}

const MAX_BODY_BYTES = 64 * 1024;

function allowedOrigins(env: IntakeDeps["env"]): string[] {
  return (env("GENESIS_SUPPORT_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = ["authorization", "content-type", "apikey", ...Object.values(WIDGET_HEADERS)].join(", ");
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

function json(status: number, body: unknown, cors: Record<string, string>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store", ...extra },
  });
}

/** The public boot projection. Nothing here is secret: it is readable by anyone. */
export function bootConfig(env: IntakeDeps["env"]): BootConfig {
  const widgets = (env("GENESIS_SUPPORT_WIDGETS") ?? "feedback,roadmap")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean)
    .map((type) => ({ type, config: {} }));
  return {
    contractVersion: CONTRACT_VERSION,
    project: { id: env("GENESIS_SUPPORT_APP_ID") ?? "app", name: env("GENESIS_SUPPORT_APP_NAME") ?? "" },
    identityMode: "genesis-session",
    theme: {},
    widgets,
    flags: {},
  };
}

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

export async function handle(req: Request, deps: IntakeDeps): Promise<Response> {
  const origin = req.headers.get("origin");
  const allowed = allowedOrigins(deps.env);
  const cors = corsHeaders(origin, allowed);
  if (origin && !allowed.includes(origin)) return json(403, { error: "origin_not_allowed" }, cors);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method === "GET") return json(200, bootConfig(deps.env), cors, { "cache-control": "public, max-age=60" });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, cors);

  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(413, { error: "payload_too_large", field: "body" }, cors);
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    raw = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid_json" }, cors);
  }
  const { op, ...args } = raw;

  const token = bearer(req);
  if (!token) return json(401, { error: "identity_required" }, cors);
  const client = deps.clientFor(token);

  try {
    if (op === "submit") {
      const checked = validateSubmitInput(args);
      if (!checked.ok) return json(checked.error === "payload_too_large" ? 413 : 400, { error: checked.error, field: checked.field }, cors);
      const a = checked.value;
      const context: Record<string, unknown> = { ...(a.context ?? {}) };
      if (a.envType) context.envType = a.envType;
      if (a.severity) context.severity = a.severity;
      if (a.tags?.length) context.tags = a.tags;
      const created = await client.insertReport({
        type: a.type ?? "bug",
        title: a.title ?? a.body.slice(0, 120),
        message: a.body,
        route: a.route ?? null,
        app_version: a.appVersion ?? null,
        context,
      });
      if ("error" in created) return refusal(created.error, cors, deps);
      const result: SubmitFeedbackResult = { reportId: created.id, findingId: created.id, status: created.status as FeedbackStatus };
      return json(200, result, cors);
    }
    if (op === "list") {
      const limit = typeof args.limit === "number" && Number.isInteger(args.limit) ? Math.min(Math.max(args.limit, 1), 100) : 30;
      const rows = await client.listReports(limit);
      if (!Array.isArray(rows)) return refusal(rows.error, cors, deps);
      const summaries: FeedbackReportSummary[] = rows.map((r) => ({
        id: String(r.id),
        type: (r.type as FeedbackReportType) ?? "bug",
        title: typeof r.title === "string" && r.title ? r.title : String(r.message ?? "").slice(0, 120),
        status: (r.status as FeedbackStatus) ?? "open",
        route: (r.route as string | null) ?? null,
        createdAt: String(r.created_at),
        findingCount: 1,
      }));
      return json(200, summaries, cors);
    }
    return json(400, { error: "unknown_op" }, cors);
  } catch (error) {
    deps.log(`[genesis-support-intake] ${error instanceof Error ? error.message : String(error)}`);
    return json(500, { error: "internal" }, cors);
  }
}

/** A database refusal as a code the client can act on. The database's message is logged, never returned. */
function refusal(code: string, cors: Record<string, string>, deps: IntakeDeps): Response {
  if (code === "GS429") return json(429, { error: "rate_limited" }, cors);
  if (code === "42501" || code === "PGRST301" || code === "PGRST303") return json(401, { error: "identity_required" }, cors);
  if (code === "23514") return json(400, { error: "invalid_args" }, cors);
  deps.log(`[genesis-support-intake] database refused: ${code}`);
  return json(500, { error: "submit_failed" }, cors);
}
