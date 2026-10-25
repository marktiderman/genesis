/**
 * `createNotificationRunner`: sends what `notify()` queued, on the shared
 * runner (`@marktiderman/genesis-notifications/runner`). Run `run()` every
 * minute and `checkReceipts()` every 15 minutes (pg_cron with pg_net calling
 * the handler, or any scheduler).
 *
 * Push: every claimed job's devices in Expo batches of 100, with `threadId`,
 * `categoryId`, `badge`, a `collapseId` (the collapse key, else the
 * notification id, so a resend after a timeout replaces rather than repeats),
 * and neutral text when the person hides previews or the type says so. The
 * payload's `data` is the link, the notification id and the type, never the
 * notification's own `data`. Tickets are recorded per device; a
 * `DeviceNotRegistered` forgets the device.
 *
 * Email: rendered once at first claim and stored, so every retry sends the
 * same bytes with the same idempotency key. From the tenant's verified
 * domain, or the app's shared one with the tenant's name and reply-to;
 * transactional and other mail from separate domains; RFC 8058 unsubscribe
 * headers on everything that isn't transactional; a secret link swapped in
 * at send time.
 */
import type { NotificationRegistry } from "../core/registry";
import type { NotificationBrand } from "../core/types";
import { createRunner, failureOf, type JobOutcome, type JobResult, type RunReport } from "../runner/index";
import { canonicalJson, defaultEmailTemplate, displayName, escapeHtml, headerSafe, isSafeAddress, type EmailTemplate } from "./email-render";
import { SendError } from "./errors";
import { EXPO_RECEIPTS_BATCH, EXPO_SEND_BATCH, refusedOutright, type PushMessage, type PushProvider, type PushTicket } from "./expo";
import type { EmailProvider } from "./resend";
import { SECRET_LINK_PLACEHOLDER, resolveSecretLink, type SecretLinks } from "./secret-links";
import { sha256Hex } from "./crypto";
import type { ClaimedJob, NotificationStore, PushTicketRow, RenderedEmail, SettleOutcome } from "./store";
import { createUnsubscribeToken, unsubscribeHeaders } from "./unsubscribe";

export interface EmailOptions {
  provider: EmailProvider;
  /** The from name when a tenant has none ("Example"). */
  appName: string;
  /**
   * The app's shared sending domains, verified in Resend: transactional mail
   * and other mail go from separate ones, so one's reputation never holds up
   * the other. `other` defaults to `transactional`.
   */
  domains: { transactional: string; other?: string };
  /** The address's local part. Default `notifications`. */
  localPart?: string;
  /** Type key → template. A type without one gets `defaultEmailTemplate`. */
  templates?: Readonly<Record<string, EmailTemplate>>;
  defaultTemplate?: EmailTemplate;
  /** How each secret-link type's link is built (`resolveSecretLink`). */
  secretLinks?: SecretLinks;
  /** Required when any type sends email that isn't transactional. */
  unsubscribe?: { url: string; secret: string };
  /**
   * The provider for one job. Default the app's `provider`. The seam for a
   * tenant-owned key later (read from Vault by id); not built in v1.
   */
  providerFor?: (job: ClaimedJob) => EmailProvider;
}

export interface NotificationRunnerOptions {
  store: NotificationStore;
  registry: NotificationRegistry;
  push?: { provider: PushProvider };
  email?: EmailOptions;
  /** The app's origin, for absolute links in emails (`https://app.example.com`). */
  appUrl?: string;
  /** Jobs claimed per channel per run. Default 100. */
  batchSize?: number;
  /** How long a claim holds a job. Default 300 seconds. */
  leaseSeconds?: number;
  maxAttempts?: number;
  maxDeferrals?: number;
  /** Safe lines only (ids, statuses, error codes). */
  log?: (message: string) => void;
  now?: () => number;
}

export interface NotificationRunner {
  /** Sends what is due on every configured channel. */
  run(options?: { signal?: AbortSignal }): Promise<{ push: RunReport | null; email: RunReport | null }>;
  runPush(options?: { signal?: AbortSignal }): Promise<RunReport>;
  runEmail(options?: { signal?: AbortSignal }): Promise<RunReport>;
  /** Asks Expo for the receipts that are due and records them. */
  checkReceipts(options?: { signal?: AbortSignal; budgetMs?: number }): Promise<{ checked: number; settled: number }>;
}

type Job = ClaimedJob & { attempt: number };

function settleOf(outcome: JobOutcome, providerId: string | undefined): SettleOutcome {
  switch (outcome.status) {
    case "sent":
      return { status: "sent", provider_id: providerId ?? null };
    case "filtered":
      return { status: "filtered" };
    case "skipped":
      return { status: "skipped", reason: /^[a-z_]{1,64}$/.test(outcome.reason) ? outcome.reason : "not_sent" };
    case "failed":
      return { status: "failed", error: outcome.error };
    case "retry":
      return { status: "retry", error: outcome.error, retry_at: outcome.retryAt.toISOString(), counted: outcome.counted };
  }
}

/**
 * The runner.
 *
 * @stability Beta
 */
export function createNotificationRunner(options: NotificationRunnerOptions): NotificationRunner {
  const { store, registry } = options;
  const log = (m: string) => {
    try {
      options.log?.(m);
    } catch {
      // ignored
    }
  };
  const batch = options.batchSize ?? 100;
  const lease = options.leaseSeconds ?? 300;
  const email = options.email;
  if (email) {
    const needsUnsubscribe = Object.keys(registry.types).some((key) => registry.type(key).channels.email !== undefined && !registry.type(key).transactional && !registry.isCritical(key));
    if (needsUnsubscribe && !email.unsubscribe) {
      throw new Error("createNotificationRunner: a type sends email that isn't transactional, so email.unsubscribe ({ url, secret }) is required");
    }
    for (const [key, t] of Object.entries(registry.types)) {
      if (t.secretLink && !email.secretLinks?.[key]) throw new Error(`createNotificationRunner: type ${key} needs a secret link builder in email.secretLinks`);
    }
  }
  const providerIds = new Map<string, string>();

  const record = async (job: Job, outcome: JobOutcome) => {
    const providerId = providerIds.get(job.id);
    providerIds.delete(job.id);
    return store.settle(job.id, job.claim_id, settleOf(outcome, providerId));
  };
  const common = {
    record,
    now: options.now,
    log: options.log,
    maxAttempts: options.maxAttempts,
    maxDeferrals: options.maxDeferrals,
    recordLabel: (job: Job) => `${job.channel} job ${job.id}`,
  };

  // Push ---------------------------------------------------------------------
  const pushRunner = options.push
    ? createRunner<Job>({
        ...common,
        label: (job) => `Push ${job.id}`,
        claim: ({ limit }) => store.claim("push", limit, lease, options.maxAttempts ?? 8) as Promise<Job[]>,
        group: () => "push",
        send: (jobs, { signal }) => sendPush(jobs, options.push!.provider, signal),
        batchSize: batch,
      })
    : null;

  function pushMessage(job: Job, token: string): PushMessage {
    const hidden = job.hide_previews || job.push_privacy === "generic";
    const text = hidden ? { title: registry.hiddenPreview.title, body: registry.hiddenPreview.body } : registry.render(job.type, job.data);
    const url = registry.render(job.type, job.data).url;
    return {
      to: token,
      title: text.title,
      ...(text.body ? { body: text.body } : {}),
      data: { notification_id: job.notification_id, type: job.type, ...(url ? { url } : {}), ...(job.thread_key ? { thread_key: job.thread_key } : {}) },
      sound: "default",
      ...(job.badge !== null && job.badge !== undefined ? { badge: job.badge } : {}),
      channelId: job.category,
      ...(job.ios_category ? { categoryId: job.ios_category } : {}),
      ...(job.thread_key ? { threadId: job.thread_key } : {}),
      collapseId: (job.collapse_key ?? job.notification_id).slice(0, 64),
      tag: (job.collapse_key ?? job.notification_id).slice(0, 64),
      priority: "high",
    };
  }

  async function sendPush(jobs: readonly Job[], provider: PushProvider, signal?: AbortSignal): Promise<JobResult[]> {
    const slots: { job: number; device: string; message: PushMessage }[] = [];
    const results: (JobResult | null)[] = jobs.map((job) => (registry.has(job.type) ? null : { ok: false, retryable: false, error: "unknown_type" }));
    jobs.forEach((job, j) => {
      if (results[j]) return;
      for (const d of job.devices ?? []) slots.push({ job: j, device: d.id, message: pushMessage(job, d.token) });
    });
    const tickets: (PushTicket | SendError)[] = new Array(slots.length);
    for (let start = 0; start < slots.length; start += EXPO_SEND_BATCH) {
      const chunk = slots.slice(start, start + EXPO_SEND_BATCH);
      try {
        const got = await provider.send(chunk.map((s) => s.message), { signal });
        got.forEach((t, i) => (tickets[start + i] = t));
      } catch (error) {
        if (refusedOutright(error) && chunk.length > 1) {
          // One bad message can't hold up the rest: each on its own.
          for (let i = 0; i < chunk.length; i++) {
            try {
              tickets[start + i] = (await provider.send([chunk[i]!.message], { signal }))[0] ?? { status: "error", code: "NoTicket" };
            } catch (one) {
              tickets[start + i] = one instanceof SendError ? one : new SendError("Push failed", { retryable: true });
            }
          }
        } else {
          const e = error instanceof SendError ? error : new SendError("Push failed", { retryable: true });
          for (let i = 0; i < chunk.length; i++) tickets[start + i] = e;
        }
      }
    }
    // Per job: its tickets recorded, and one result.
    await Promise.all(
      jobs.map(async (job, j) => {
        if (results[j]) return;
        const mine = slots.map((s, i) => ({ s, t: tickets[i]! })).filter((x) => x.s.job === j);
        const rows: PushTicketRow[] = mine
          .filter((x) => !(x.t instanceof SendError))
          .map(({ s, t }) => {
            const ticket = t as PushTicket;
            return ticket.status === "ok"
              ? { device_id: s.device, ticket_id: ticket.id, status: "sent" as const, error: null }
              : { device_id: s.device, ticket_id: null, status: "failed" as const, error: ticket.code };
          });
        if (rows.length) {
          try {
            await store.pushTickets(job.id, rows);
          } catch {
            log(`Recording push ${job.id}'s tickets failed`);
          }
        }
        if (rows.some((r) => r.status === "sent")) {
          results[j] = { ok: true };
          return;
        }
        const httpError = mine.find((x) => x.t instanceof SendError)?.t as SendError | undefined;
        if (httpError) {
          results[j] = failureOf(httpError);
          return;
        }
        const codes = rows.map((r) => r.error);
        if (codes.length && codes.every((c) => c === "DeviceNotRegistered")) results[j] = { ok: true, notSent: "device_not_registered" };
        else if (codes.includes("MessageRateExceeded")) results[j] = { ok: false, retryable: true, retryAfterSeconds: 60, error: "Expo: MessageRateExceeded" };
        else if (!codes.length) results[j] = { ok: true, notSent: "no_devices" };
        else results[j] = { ok: false, retryable: false, error: `Expo: ${codes.find((c) => c !== "DeviceNotRegistered") ?? "Unknown"}` };
      }),
    );
    return results as JobResult[];
  }

  // Email --------------------------------------------------------------------
  const emailRunner = email
    ? createRunner<Job>({
        ...common,
        label: (job) => `Email ${job.id}`,
        claim: ({ limit }) => store.claim("email", limit, lease, options.maxAttempts ?? 8) as Promise<Job[]>,
        send: async ([job], { signal }) => [await sendEmail(job!, email, signal)],
        batchSize: batch,
      })
    : null;

  function fromAddress(job: Job, e: EmailOptions): string {
    const local = e.localPart ?? "notifications";
    const shared = job.transactional ? e.domains.transactional : (e.domains.other ?? e.domains.transactional);
    const domain = job.sender?.domain_verified && job.sender.domain ? job.sender.domain : shared;
    const brandName = typeof job.brand?.["name"] === "string" ? (job.brand["name"] as string) : null;
    const name = displayName(job.sender?.from_name ?? brandName ?? e.appName) || displayName(e.appName);
    return `${name} <${local}@${domain}>`;
  }

  async function render(job: Job, e: EmailOptions): Promise<RenderedEmail> {
    const to = job.email;
    if (!isSafeAddress(to)) throw new SendError("no_valid_address");
    const t = registry.type(job.type);
    let unsubscribeUrl: string | null = null;
    let headers: Record<string, string> | undefined;
    // Transactional mail has no unsubscribe, and nor does a critical type's (preferences can't turn it off).
    if (!job.transactional && !job.critical && e.unsubscribe) {
      const token = await createUnsubscribeToken(e.unsubscribe.secret, {
        ...(job.user_id ? { userId: job.user_id } : { email: to }),
        category: job.category,
        ...(job.tenant_id ? { tenantId: job.tenant_id } : {}),
      });
      headers = unsubscribeHeaders(e.unsubscribe.url, token);
      unsubscribeUrl = headers["List-Unsubscribe"]!.slice(1, -1);
    }
    const text = registry.render(job.type, job.data);
    const url = text.url && options.appUrl ? new URL(text.url, options.appUrl).toString() : null;
    const template = e.templates?.[job.type] ?? e.defaultTemplate ?? defaultEmailTemplate;
    const content = await template({
      type: job.type,
      category: job.category,
      data: job.data,
      text,
      recipient: { email: to, name: job.recipient_name },
      brand: (job.brand ?? {}) as NotificationBrand,
      tenantId: job.tenant_id,
      transactional: job.transactional,
      secretLink: t.secretLink ? SECRET_LINK_PLACEHOLDER : null,
      unsubscribeUrl,
      url,
    });
    const replyTo = job.sender?.reply_to;
    return {
      from: fromAddress(job, e),
      to: [to],
      ...(isSafeAddress(replyTo) ? { reply_to: replyTo } : {}),
      subject: headerSafe(content.subject) || headerSafe(text.title) || "Notification",
      html: content.html,
      text: content.text,
      ...(headers ? { headers } : {}),
      tags: [
        { name: "category", value: job.category.replace(/[^A-Za-z0-9_-]/g, "_") },
        { name: "stream", value: job.transactional ? "transactional" : "other" },
      ],
    };
  }

  async function sendEmail(job: Job, e: EmailOptions, signal?: AbortSignal): Promise<JobResult> {
    try {
      if (!registry.has(job.type)) return { ok: false, retryable: false, error: "unknown_type" };
      let rendered = job.rendered;
      if (rendered) {
        if (!job.rendered_hash || (await sha256Hex(canonicalJson(rendered))) !== job.rendered_hash) {
          // Never send something other than the first render under its key.
          return { ok: false, retryable: false, error: "rendered_email_changed" };
        }
      } else {
        const fresh = await render(job, e);
        const hash = await sha256Hex(canonicalJson(fresh));
        const kept = await store.storeRendered(job.id, job.claim_id, fresh, hash);
        if (!kept) return { ok: false, retryable: true, error: "claim_lost" };
        rendered = kept.rendered;
      }
      let html = rendered.html;
      let text = rendered.text;
      if (registry.type(job.type).secretLink) {
        const link = await resolveSecretLink(e.secretLinks ?? {}, job.type, {
          data: job.data,
          secret: job.secret,
          notificationId: job.notification_id,
          tenantId: job.tenant_id,
        });
        html = html.split(SECRET_LINK_PLACEHOLDER).join(escapeHtml(link));
        text = text.split(SECRET_LINK_PLACEHOLDER).join(link);
      }
      const provider = e.providerFor?.(job) ?? e.provider;
      const result = await provider.send(
        {
          from: rendered.from,
          to: rendered.to,
          ...(rendered.reply_to ? { replyTo: rendered.reply_to } : {}),
          subject: rendered.subject,
          html,
          text,
          ...(rendered.headers ? { headers: rendered.headers } : {}),
          ...(rendered.tags ? { tags: rendered.tags } : {}),
          idempotencyKey: `genesis-notification-${job.id}`,
        },
        { signal },
      );
      if (result.id) providerIds.set(job.id, result.id);
      return result.alreadySent ? { ok: true, alreadyThere: true } : { ok: true };
    } catch (error) {
      if (error instanceof SendError && error.message === "no_valid_address") return { ok: true, notSent: "no_address" };
      if (error instanceof Error && error.name === "SecretLinkError") return { ok: false, retryable: false, error: "secret_link_unavailable" };
      return failureOf(error);
    }
  }

  const none = async (): Promise<RunReport> => {
    throw new Error("This channel isn't configured");
  };

  return {
    async run({ signal } = {}) {
      const [push, mail] = await Promise.all([pushRunner?.run({ signal }) ?? null, emailRunner?.run({ signal }) ?? null]);
      return { push, email: mail };
    },
    runPush: ({ signal } = {}) => (pushRunner ? pushRunner.run({ signal }) : none()),
    runEmail: ({ signal } = {}) => (emailRunner ? emailRunner.run({ signal }) : none()),
    async checkReceipts({ signal, budgetMs = 60_000 } = {}) {
      const provider = options.push?.provider;
      if (!provider) return { checked: 0, settled: 0 };
      const started = Date.now();
      let checked = 0;
      let settled = 0;
      for (;;) {
        const due = await store.receiptsClaim(EXPO_RECEIPTS_BATCH);
        if (!due.length) break;
        checked += due.length;
        let receipts;
        try {
          receipts = await provider.receipts(due.map((d) => d.ticket_id), { signal });
        } catch (error) {
          log(`Push receipts failed: ${error instanceof Error ? error.message : "unknown"}`);
          break;
        }
        const results = due.flatMap((d) => {
          const r = receipts[d.ticket_id];
          if (!r) return [];
          return [{ id: d.id, status: r.status === "ok" ? ("delivered" as const) : ("failed" as const), error: r.status === "error" ? r.code : null }];
        });
        if (results.some((r) => r.error === "InvalidCredentials")) log("Push receipts: InvalidCredentials (the APNs or FCM credentials in EAS are wrong)");
        if (results.length) await store.receiptsSettle(results);
        settled += results.length;
        if (due.length < EXPO_RECEIPTS_BATCH || Date.now() - started > budgetMs) break;
      }
      return { checked, settled };
    },
  };
}
