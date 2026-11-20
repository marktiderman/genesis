/**
 * Notifiers for `createDiagnosticsHandler`:
 *
 * - `githubIssueNotifier`: an issue per report. The summary only by default
 *   (D8), safe for a public repository. `detail: "full"` adds the build,
 *   device, route and scrubbed logs from the dump, and only when GitHub says
 *   the repository is private; on a public one it falls back to the summary.
 * - `webhookNotifier`: a signed POST: `x-genesis-timestamp` (Unix seconds) and
 *   `x-genesis-signature: sha256=<hex>`, the HMAC of `<timestamp>.<body>`, so a captured call
 *   can't be replayed later. `verifyWebhookSignature` checks one on the receiving end.
 * - `messengerNotifier`: the app's own email or push, through `SupportMessenger`
 *   (a staff alert, and thanks to the person). genesis-notifications fills it
 *   later; until then the app implements the two calls.
 */
import type { DiagnosticReport } from "../diagnostics/report";
import { eventSummaryLines, eventTitle, fenced, neutralise, type SupportEvent, type SupportMessenger, type SupportNotifier } from "./events";

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
  /** How long GitHub's "this repository is private" answer is trusted. Default 10 minutes. */
  privateCheckTtlMs?: number;
  now?: () => number;
  onProblem?: (problem: string) => void;
}


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
  return ["<details><summary>Diagnostics</summary>", "", fenced(JSON.stringify(pick, null, 2).slice(0, 50_000), "json"), "", "</details>"].join("\n");
}

const LINK_UNSAFE: Readonly<Record<string, string>> = { "(": "%28", ")": "%29", "<": "%3C", ">": "%3E" };
const percentEncode = (c: string): string => LINK_UNSAFE[c] ?? encodeURIComponent(c);

/**
 * The issue's body: the title and summary inside one fence, so nothing the person typed can
 * mention, link or embed anything.
 */
export function issueBody(event: SupportEvent, options: { detail: boolean; url?: string | null }): string {
  const lines = eventSummaryLines(event);
  const parts = [fenced([eventTitle(event), "", ...lines].join("\n"))];
  // encodeURIComponent leaves `(` and `)` alone: written out, so the URL can't close the link.
  if (options.url) parts.push("", `[Open in the admin view](${options.url.replace(/[()<>\s]/g, percentEncode)})`);
  if (options.detail && event.report) parts.push("", issueDetail(event.report));
  return parts.join("\n");
}

/** GitHub refuses a title over 256 characters (422) and the issue is lost: cut it, after neutralising. */
const GITHUB_TITLE_MAX = 256;
function githubIssueTitle(event: SupportEvent): string {
  const chars = Array.from(neutralise(eventTitle(event)));
  return chars.length <= GITHUB_TITLE_MAX ? chars.join("") : `${chars.slice(0, GITHUB_TITLE_MAX - 1).join("")}…`;
}

export function githubIssueNotifier(options: GithubIssueNotifierOptions): SupportNotifier {
  if (!/^[\w.-]+\/[\w.-]+$/.test(options.repo)) throw new Error("githubIssueNotifier: repo must be owner/name.");
  const f = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const api = (options.apiUrl ?? "https://api.github.com").replace(/\/$/, "");
  const on = new Set(options.on ?? ["feedback"]);
  const headers = { authorization: `Bearer ${options.token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "genesis-support" };
  const ttl = options.privateCheckTtlMs ?? 600_000;
  const now = options.now ?? Date.now;
  let privateRepo: { at: number; answer: Promise<boolean> } | null = null;

  // Detail goes only to a repository GitHub says is private. Asked again after `privateCheckTtlMs`
  // (a repository made public stops getting detail within minutes); an error counts as public.
  const isPrivate = () => {
    if (!privateRepo || now() - privateRepo.at >= ttl) {
      privateRepo = {
        at: now(),
        answer: f(`${api}/repos/${options.repo}`, { headers })
          .then(async (res) => res.ok && ((await res.json()) as { private?: boolean }).private === true)
          .catch(() => false)
          .then((yes) => {
            if (!yes) options.onProblem?.(`githubIssueNotifier: ${options.repo} isn't private (or couldn't be checked); issues carry the summary only.`);
            return yes;
          }),
      };
    }
    return privateRepo.answer;
  };

  return {
    name: "github",
    async notify(event) {
      if (!on.has(event.kind)) return;
      const detail = options.detail === "full" && (await isPrivate());
      const labels = [...(options.labels ?? ["feedback"]), ...(event.kind === "feedback" ? [event.feedback.type] : ["diagnostics"])];
      const res = await f(`${api}/repos/${options.repo}/issues`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title: githubIssueTitle(event), body: issueBody(event, { detail, url: options.adminUrl?.(event) ?? null }), labels }),
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
  now?: () => number;
}

/** HMAC-SHA256 of `body` with `secret`, as hex (Web Crypto: Node 18+, Deno, workers). */
export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The headers a signed webhook carries. */
export const WEBHOOK_HEADERS = { signature: "x-genesis-signature", timestamp: "x-genesis-timestamp" } as const;

/** What is signed: the timestamp, a dot, the body. A replayed body with a new timestamp fails. */
const signedText = (timestamp: string, body: string) => `${timestamp}.${body}`;

function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * For the receiving end of `webhookNotifier`: true when `signature` (`sha256=<hex>`) is the HMAC
 * of `<timestamp>.<body>` with `secret` (compared in constant time) and the timestamp (Unix
 * seconds) is within `toleranceSec` (default 300) of now. Pass the raw body, as received.
 */
export async function verifyWebhookSignature(input: {
  secret: string;
  body: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  toleranceSec?: number;
  now?: () => number;
}): Promise<boolean> {
  if (!input.secret || !input.signature || !input.timestamp || !/^\d{1,12}$/.test(input.timestamp)) return false;
  const age = Math.abs((input.now ?? Date.now)() / 1000 - Number(input.timestamp));
  if (age > (input.toleranceSec ?? 300)) return false;
  const expected = `sha256=${await hmacSha256Hex(input.secret, signedText(input.timestamp, input.body))}`;
  return sameText(expected, input.signature);
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
      if (options.secret) {
        const timestamp = String(Math.floor((options.now ?? Date.now)() / 1000));
        headers[WEBHOOK_HEADERS.timestamp] = timestamp;
        headers[WEBHOOK_HEADERS.signature] = `sha256=${await hmacSha256Hex(options.secret, signedText(timestamp, body))}`;
      }
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

/**
 * Staff alerts and reporter thanks through the app's own email or push. `notificationsNotifier`
 * is the same function, under the name the design uses for the genesis-notifications hookup.
 */
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

/** The same as `messengerNotifier`: staff alerts and reporter thanks, through `SupportMessenger`. */
export const notificationsNotifier = messengerNotifier;
