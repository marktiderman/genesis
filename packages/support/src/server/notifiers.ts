/**
 * Notifiers for `createDiagnosticsHandler`:
 *
 * - `githubIssueNotifier`: an issue per report. The summary only by default
 *   (D8), safe for a public repository. `detail: "full"` adds the build,
 *   device, route and scrubbed logs from the dump, and only when GitHub says
 *   the repository is private; on a public one it falls back to the summary.
 * - `webhookNotifier`: a signed POST (`x-genesis-signature: sha256=<hex>`,
 *   HMAC of the body), as `genesis-support-notify` signs.
 * - `messengerNotifier`: the app's own email or push, through `SupportMessenger`
 *   (a staff alert, and thanks to the person). genesis-notifications fills it
 *   later; until then the app implements the two calls.
 */
import type { DiagnosticReport } from "../diagnostics/report";
import { eventSummaryLines, eventTitle, fenceSafe, type SupportEvent, type SupportMessenger, type SupportNotifier } from "./events";

type Kinds = readonly SupportEvent["kind"][];

export interface GithubIssueNotifierOptions {
  /** A fine-grained token with Issues: write on the one repository. */
  token: string;
  /** `owner/name`. */
  repo: string;
  /** Labels on every issue; the feedback's type is added. Default `["feedback"]`. */
  labels?: readonly string[];
  /** `summary` (default, D8) or `full` (private repositories only: checked with GitHub first). */
  detail?: "summary" | "full";
  /** Which events open an issue. Default feedback only. */
  on?: Kinds;
  /** The report in the app's admin view, linked from the issue. */
  adminUrl?: (event: SupportEvent) => string | null | undefined;
  fetch?: typeof fetch;
  /** GitHub's API. Default `https://api.github.com`. */
  apiUrl?: string;
  onProblem?: (problem: string) => void;
}

/** Markdown for one fenced block; the content can't break out of the fence or mention anyone. */
const fenced = (lang: string, text: string) => ["````" + lang, fenceSafe(text), "````"].join("\n");

/** The dump's detail for a private repository's issue: build, device, route, recent errors and breadcrumbs. */
export function issueDetail(report: DiagnosticReport): string {
  const pick = {
    build: report.build,
    device: report.device,
    session: report.session ? { route: report.session.route, recentRoutes: report.session.recentRoutes } : null,
    sentry: report.sentry,
    errors: report.logs.errors.slice(-20),
    breadcrumbs: report.logs.breadcrumbs.slice(-30),
    truncated: report.truncated,
  };
  return ["<details><summary>Diagnostics</summary>", "", fenced("json", JSON.stringify(pick, null, 2).slice(0, 50_000)), "", "</details>"].join("\n");
}

/** The issue's body: the summary, fenced so the person's text can't mention or link anyone. */
export function issueBody(event: SupportEvent, options: { detail: boolean; url?: string | null }): string {
  const lines = eventSummaryLines(event);
  const parts = [`**${eventTitle(event).replaceAll("`", "")}**`, "", fenced("", lines.join("\n"))];
  if (options.url) parts.push("", `[Open in the admin view](${options.url.replace(/[()\s]/g, encodeURIComponent)})`);
  if (options.detail && event.report) parts.push("", issueDetail(event.report));
  return parts.join("\n");
}

export function githubIssueNotifier(options: GithubIssueNotifierOptions): SupportNotifier {
  if (!/^[\w.-]+\/[\w.-]+$/.test(options.repo)) throw new Error("githubIssueNotifier: repo must be owner/name.");
  const f = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const api = (options.apiUrl ?? "https://api.github.com").replace(/\/$/, "");
  const on = new Set(options.on ?? ["feedback"]);
  const headers = { authorization: `Bearer ${options.token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "genesis-support" };
  let privateRepo: Promise<boolean> | null = null;

  // Detail goes only to a repository GitHub says is private. Asked once; an error counts as public.
  const isPrivate = () =>
    (privateRepo ??= f(`${api}/repos/${options.repo}`, { headers })
      .then(async (res) => res.ok && ((await res.json()) as { private?: boolean }).private === true)
      .catch(() => false)
      .then((yes) => {
        if (!yes) options.onProblem?.(`githubIssueNotifier: ${options.repo} isn't private (or couldn't be checked); issues carry the summary only.`);
        return yes;
      }));

  return {
    name: "github",
    async notify(event) {
      if (!on.has(event.kind)) return;
      const detail = options.detail === "full" && (await isPrivate());
      const labels = [...(options.labels ?? ["feedback"]), ...(event.kind === "feedback" ? [event.feedback.type] : ["diagnostics"])];
      const res = await f(`${api}/repos/${options.repo}/issues`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title: eventTitle(event), body: issueBody(event, { detail, url: options.adminUrl?.(event) ?? null }), labels }),
      });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    },
  };
}

export interface WebhookNotifierOptions {
  /** https only. */
  url: string;
  /** Signs the body: `x-genesis-signature: sha256=<hex>`. */
  secret?: string;
  /** Which events are posted. Default both. */
  on?: Kinds;
  /** Include the dump in the body. Default false (the summary only). */
  includeReport?: boolean;
  fetch?: typeof fetch;
}

/** HMAC-SHA256 of `body` with `secret`, as hex (Web Crypto: Node 18+, Deno, workers). */
export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function webhookNotifier(options: WebhookNotifierOptions): SupportNotifier {
  if (!options.url.startsWith("https://")) throw new Error("webhookNotifier: the URL must be https.");
  const f = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const on = new Set(options.on ?? ["feedback", "diagnostics"]);
  return {
    name: "webhook",
    async notify(event) {
      if (!on.has(event.kind)) return;
      const { report, ...rest } = event as SupportEvent & { report: DiagnosticReport | null };
      const payload = { event: event.kind === "feedback" ? "support.feedback.created" : "support.diagnostics.created", ...rest, ...(options.includeReport ? { report } : {}) };
      const body = JSON.stringify(payload);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (options.secret) headers["x-genesis-signature"] = `sha256=${await hmacSha256Hex(options.secret, body)}`;
      const res = await f(options.url, { method: "POST", headers, body });
      if (!res.ok) throw new Error(`the webhook answered ${res.status}`);
    },
  };
}

export interface MessengerNotifierOptions {
  /** Which events alert staff. Default feedback only. */
  on?: Kinds;
  /** The report in the app's admin view, for the alert. */
  adminUrl?: (event: SupportEvent) => string | null | undefined;
}

/** Staff alerts and reporter thanks through the app's own email or push. */
export function messengerNotifier(messenger: SupportMessenger, options: MessengerNotifierOptions = {}): SupportNotifier {
  const on = new Set(options.on ?? ["feedback"]);
  return {
    name: "messenger",
    async notify(event) {
      if (!on.has(event.kind)) return;
      const work: Promise<void>[] = [];
      if (messenger.staffAlert) {
        work.push(
          Promise.resolve(
            messenger.staffAlert({
              kind: event.kind,
              id: event.id,
              shortId: event.kind === "diagnostics" ? event.shortId : event.diagnosticsShortId,
              title: eventTitle(event),
              body: eventSummaryLines(event).join("\n"),
              url: options.adminUrl?.(event) ?? null,
              userId: event.userId,
            }),
          ),
        );
      }
      if (messenger.thankReporter && event.kind === "feedback") {
        work.push(Promise.resolve(messenger.thankReporter({ userId: event.userId, feedbackId: event.id, type: event.feedback.type, shortId: event.diagnosticsShortId })));
      }
      const results = await Promise.allSettled(work);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) throw failed.reason;
    },
  };
}
