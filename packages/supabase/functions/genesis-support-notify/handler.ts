/**
 * The genesis-support-notify Edge Function's request handling, with its
 * dependencies passed in, so it is tested without Deno.
 *
 * A Supabase Database Webhook calls it on INSERT into public.support_reports
 * (Dashboard → Database → Webhooks, or `supabase_functions.http_request` in a
 * migration of your own), with the header `x-genesis-support-secret: <secret>`.
 * It forwards a summary to the sinks that are configured:
 *
 *   - a GitHub issue per report: GITHUB_TOKEN (fine-grained, Issues: write on
 *     one repository) and GITHUB_REPO ("owner/name"); GITHUB_LABELS optional;
 *   - a webhook: SUPPORT_WEBHOOK_URL, the body signed with
 *     SUPPORT_WEBHOOK_SIGNING_SECRET as `x-genesis-signature: sha256=<hex>`.
 *
 * What leaves the database is the summary only: the report id, type, title,
 * message (cut to 2000 characters), route, app version, platform and time.
 * Never the person's id or email, the device or context bags, or a
 * screenshot. The message is what the person typed and may still name
 * someone, so point the GitHub sink at a private repository.
 */

export interface ReportRecord {
  id: string;
  type?: string;
  title?: string | null;
  message?: string;
  route?: string | null;
  app_version?: string | null;
  platform?: string | null;
  created_at?: string;
}

export interface ReportSummary {
  id: string;
  type: string;
  title: string;
  message: string;
  route: string | null;
  appVersion: string | null;
  platform: string | null;
  createdAt: string | null;
}

export interface NotifyDeps {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  log: (message: string) => void;
}

const MESSAGE_CAP = 2000;

/** The only fields a sink ever sees. */
export function summarize(record: ReportRecord): ReportSummary {
  const message = String(record.message ?? "");
  return {
    id: String(record.id),
    type: String(record.type ?? "bug"),
    title: (record.title ?? "").trim() || message.slice(0, 120),
    message: message.length > MESSAGE_CAP ? `${message.slice(0, MESSAGE_CAP)}…` : message,
    route: record.route ?? null,
    appVersion: record.app_version ?? null,
    platform: record.platform ?? null,
    createdAt: record.created_at ?? null,
  };
}

/** A constant-time comparison, so the secret can't be guessed a byte at a time. */
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/** Markdown for the issue body; the person's text is fenced so it can't mention or link anyone. */
export function issueBody(s: ReportSummary): string {
  const fence = "````";
  return [
    `**${s.type}** from the app${s.platform ? ` (${s.platform})` : ""}`,
    "",
    fence,
    s.message.replaceAll(fence, "``` `"),
    fence,
    "",
    `- Route: ${s.route ? `\`${s.route.replaceAll("`", "")}\`` : "none"}`,
    `- Version: ${s.appVersion ? `\`${s.appVersion.replaceAll("`", "")}\`` : "unknown"}`,
    `- Report: \`${s.id}\``,
  ].join("\n");
}

export async function handle(req: Request, deps: NotifyDeps): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const secret = deps.env("GENESIS_SUPPORT_WEBHOOK_SECRET") ?? "";
  if (!secret) {
    deps.log("[genesis-support-notify] GENESIS_SUPPORT_WEBHOOK_SECRET is not set; refusing every call");
    return json(500, { error: "not_configured" });
  }
  if (!sameSecret(req.headers.get("x-genesis-support-secret") ?? "", secret)) return json(401, { error: "unauthorized" });

  let payload: { type?: string; table?: string; schema?: string; record?: ReportRecord };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (payload.type !== "INSERT" || payload.table !== "support_reports" || !payload.record?.id) {
    return json(200, { ok: true, skipped: true });
  }
  const summary = summarize(payload.record);
  const sent: string[] = [];
  const failed: string[] = [];

  const repo = deps.env("GITHUB_REPO");
  const token = deps.env("GITHUB_TOKEN");
  if (repo && token) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      deps.log("[genesis-support-notify] GITHUB_REPO must be owner/name");
      failed.push("github");
    } else {
      const labels = (deps.env("GITHUB_LABELS") ?? "feedback").split(",").map((l) => l.trim()).filter(Boolean);
      const res = await deps.fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "genesis-support-notify" },
        body: JSON.stringify({ title: `[${summary.type}] ${summary.title}`.slice(0, 256), body: issueBody(summary), labels: [...labels, summary.type] }),
      });
      if (res.ok) sent.push("github");
      else {
        deps.log(`[genesis-support-notify] GitHub answered ${res.status}`);
        failed.push("github");
      }
    }
  }

  const hook = deps.env("SUPPORT_WEBHOOK_URL");
  if (hook) {
    if (!hook.startsWith("https://")) {
      deps.log("[genesis-support-notify] SUPPORT_WEBHOOK_URL must be https");
      failed.push("webhook");
    } else {
      const body = JSON.stringify({ event: "support.report.created", report: summary });
      const signing = deps.env("SUPPORT_WEBHOOK_SIGNING_SECRET");
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (signing) headers["x-genesis-signature"] = `sha256=${await hmacHex(signing, body)}`;
      const res = await deps.fetch(hook, { method: "POST", headers, body });
      if (res.ok) sent.push("webhook");
      else {
        deps.log(`[genesis-support-notify] the webhook answered ${res.status}`);
        failed.push("webhook");
      }
    }
  }

  if (!sent.length && !failed.length) deps.log("[genesis-support-notify] no sink is configured (GITHUB_REPO + GITHUB_TOKEN, or SUPPORT_WEBHOOK_URL)");
  // 502 when a sink failed, so the database webhook's log shows it.
  return json(failed.length ? 502 : 200, { ok: failed.length === 0, sent, failed });
}
