/**
 * `createDiagnostics(options)`: the context dump for one app. Build it once,
 * at module scope:
 *
 *   export const diagnostics = createDiagnostics({
 *     app: { id: "acme", name: "Acme" },
 *     transport: supabaseTransport(supabase),          // or httpTransport({ url, auth })
 *     sections: [...nativeSections({ … }), observabilitySection(observability)],
 *     user: () => ({ id: session?.user.id, role }),     // an id and a role only
 *   });
 *   await diagnostics.send({ trigger: "manual" });     // → { id, shortId }
 *
 * `collect` reads every section now (each within its timeout; one that throws
 * or is late is written as null), keeps the session (uptime, the route and the
 * routes before it), scrubs the result and caps it. `send` sends it; a send
 * that fails for a reason that may pass is kept by the offline queue (with
 * `offline: { storage }`) and tried again with backoff.
 */
import { cleanRoute } from "../contract";
import type { FeedbackDelivery, FeedbackRecord, FeedbackSink } from "../record";
import { capReport, type CapLimits } from "./cap";
import { createOfflineQueue, DEFAULT_QUEUE_KEY, DiagnosticsSendError, isRetryableError, type OfflineQueue, type QueueFlushResult, type QueueStorage } from "./queue";
import { redactReport } from "./redact";
import {
  CORE_SECTIONS,
  DIAGNOSTICS_DEFAULTS,
  diagnosticsShortId,
  emptyReport,
  randomUuid,
  type CoreSectionName,
  type DiagnosticReport,
  type DiagnosticSection,
  type DiagnosticTrigger,
} from "./report";
import type { DiagnosticsTransport } from "./transports";
import { supportSettingValues, type SupportSettingsInput } from "../settings";

export interface DiagnosticsUser {
  id?: string | null;
  role?: string | null;
}

export interface DiagnosticsOptions {
  /** The app, as the dump names it. `platform` defaults to what a section says (`device.os`). */
  app: { id: string; name?: string; platform?: string; environment?: string };
  /** Where dumps go: `supabaseTransport(supabase)` or `httpTransport({ url, auth })`. */
  transport: DiagnosticsTransport;
  /** The sections: `nativeSections(…)`, `webSections(…)`, `observabilitySection(…)`, the app's own. */
  sections?: readonly (DiagnosticSection | null | undefined | false)[];
  /** The signed-in person: an id and a role, read when a dump is made. Anything else is dropped. */
  user?: () => DiagnosticsUser | null | undefined | Promise<DiagnosticsUser | null | undefined>;
  /** The size table, if the app needs other caps (the defaults are `DIAGNOSTICS_DEFAULTS`). */
  limits?: CapLimits;
  /** Keep failed sends and try again with backoff. Without it a failed send throws. */
  /**
   * Keep failed sends and try again with backoff (and at once, when created). Each queued dump
   * remembers who was signed in: it is dropped, not sent, if someone else is signed in by then.
   * Call `clearQueue()` on sign-out.
   */
  offline?: { storage: QueueStorage; key?: string; maxItems?: number; maxBytes?: number; autoRetry?: boolean };
  /** Default `Date.now`. */
  now?: () => number;
  /** Default a random UUID v4. */
  randomId?: () => string;
  /** A section failed, the queue had a problem: for the app's own logging. Never a crash. */
  onProblem?: (problem: string, error?: unknown) => void;
  /**
   * Genesis settings (`resolveSettings`' result, or the values alone): `diagnostics.enabled` (off,
   * `send` and `submitFeedback` send no dump), `diagnostics.maxBytes` and `diagnostics.offlineQueue`.
   * `limits.maxBytes` and leaving out `offline` still win. Without it, the `max` preset.
   */
  appSettings?: SupportSettingsInput;
}

export interface CollectOptions {
  trigger?: DiagnosticTrigger;
  feedbackId?: string | null;
}

export interface SendDiagnosticsOptions {
  trigger: DiagnosticTrigger;
  /** The feedback this dump goes with. */
  feedbackId?: string | null;
  /** A dump made earlier with `collect` (its id already given to the feedback). Default: collect one now. */
  report?: DiagnosticReport;
}

export interface DiagnosticsDelivery {
  id: string;
  /** The id a person quotes to support (`3F2A9C1B`). */
  shortId: string;
  /** Kept by the offline queue: it goes when the network is back. */
  queued: boolean;
}

export interface Diagnostics {
  readonly options: DiagnosticsOptions;
  /** False when `diagnostics.enabled` is off: nothing is sent (`send` throws, `submitFeedback` sends the feedback alone). */
  readonly enabled: boolean;
  /** The transport's feedback sink (screenshots included), for `createSupport` and `FeedbackPanel`. */
  readonly feedbackSink: FeedbackSink | undefined;
  /** Read every section now and return the dump, scrubbed and capped. Nothing is sent. */
  collect(options?: CollectOptions): Promise<DiagnosticReport>;
  /** Make a dump (or take `report`) and send it. */
  send(options: SendDiagnosticsOptions): Promise<DiagnosticsDelivery>;
  /** The route the person is on now; kept, with the ones before it, for `session`. */
  recordRoute(route: string | null | undefined): void;
  /** Whether the app is in the foreground, for `session.foreground`. */
  setForeground(foreground: boolean): void;
  /**
   * Send feedback with a dump (D2: linked by `diagnosticsId` and `feedbackId`). The dump is made
   * first, so the feedback names it; then, where the transport takes both at once (HTTP), they go
   * in one request, else the feedback goes through `sink` (default the transport's) and the dump
   * after it, with the new report's id. A dump that fails never fails the feedback: it is queued
   * (with `offline`) or reported through `onProblem`, and `diagnostics` is null.
   */
  submitFeedback(record: FeedbackRecord, options?: { sink?: FeedbackSink }): Promise<FeedbackDelivery & { diagnostics: DiagnosticsDelivery | null }>;
  /** Try the queued sends now (on reconnect, on foreground). */
  flush(): Promise<QueueFlushResult>;
  /** Forget every queued send (on sign-out). */
  clearQueue(): Promise<void>;
  /** How many sends are waiting in the queue. */
  pending(): Promise<number>;
}

/** A dump waiting in the queue, with who was signed in when it was made. */
interface QueuedDump {
  report: DiagnosticReport;
  userId: string | null;
}

const isCore = (name: string): name is CoreSectionName => (CORE_SECTIONS as readonly string[]).includes(name);

function withTimeout<T>(work: () => T | Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    Promise.resolve()
      .then(work)
      .then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}

/** One section's value into the report: a core name fills (or merges into) that key, any other is an app section. */
function place(report: DiagnosticReport, name: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (!isCore(name)) {
    report.sections[name] = value;
    return;
  }
  const target = report as unknown as Record<string, unknown>;
  if (name === "logs") {
    const logs = value as Partial<DiagnosticReport["logs"]>;
    report.logs = {
      errors: [...report.logs.errors, ...(Array.isArray(logs.errors) ? logs.errors : [])],
      breadcrumbs: [...report.logs.breadcrumbs, ...(Array.isArray(logs.breadcrumbs) ? logs.breadcrumbs : [])],
      console: [...report.logs.console, ...(Array.isArray(logs.console) ? logs.console : [])],
    };
    return;
  }
  if (Array.isArray(value)) {
    target[name] = [...((Array.isArray(target[name]) ? target[name] : []) as unknown[]), ...value];
    return;
  }
  if (typeof value === "object") {
    target[name] = { ...((target[name] && typeof target[name] === "object" ? target[name] : {}) as object), ...(value as object) };
  }
}

export function createDiagnostics(options: DiagnosticsOptions): Diagnostics {
  const now = options.now ?? Date.now;
  const randomId = options.randomId ?? randomUuid;
  const startedAt = now();
  const maxRoutes = options.limits?.maxRecentRoutes ?? DIAGNOSTICS_DEFAULTS.maxRecentRoutes;
  const settings = supportSettingValues(options.appSettings).diagnostics;
  const enabled = settings.enabled;
  const sections = (options.sections ?? []).filter((s): s is DiagnosticSection => Boolean(s));
  const trusted = sections.filter((s) => s.options.pii === "none" && !isCore(s.name)).map((s) => s.name);
  const limits: CapLimits = {
    maxBytes: settings.maxBytes,
    ...options.limits,
    sectionLimits: {
      ...Object.fromEntries(sections.filter((s) => s.options.maxBytes && !isCore(s.name)).map((s) => [s.name, s.options.maxBytes as number])),
      ...options.limits?.sectionLimits,
    },
  };
  const problem = (message: string, error?: unknown) => {
    try {
      options.onProblem?.(message, error);
    } catch {
      // never let a reporter break a dump
    }
  };

  let route: string | null = null;
  let recentRoutes: string[] = [];
  let foreground: boolean | null = null;

  const transport = options.transport;
  const currentUserId = async (): Promise<string | null> => {
    if (!options.user) return null;
    try {
      return (await withTimeout(options.user, DIAGNOSTICS_DEFAULTS.sectionTimeoutMs))?.id ?? null;
    } catch {
      return null;
    }
  };

  const queue: OfflineQueue<QueuedDump> | null = options.offline && enabled && settings.offlineQueue
    ? createOfflineQueue<QueuedDump>({
        storage: options.offline.storage,
        ...(options.offline.key ? { key: options.offline.key } : {}),
        ...(options.offline.maxItems ? { maxItems: options.offline.maxItems } : {}),
        ...(options.offline.maxBytes ? { maxBytes: options.offline.maxBytes } : {}),
        ...(options.offline.autoRetry !== undefined ? { autoRetry: options.offline.autoRetry } : {}),
        send: async ({ report, userId }) => {
          if (userId) {
            const current = await currentUserId();
            // Nobody signed in yet (the session is still being restored at launch): keep it for later.
            if (!current) throw new DiagnosticsSendError("waiting for the person who made it to be signed in", 0, true);
            // A shared device, someone else signed in: it goes nowhere. clearQueue() covers sign-out.
            if (current !== userId) throw new DiagnosticsSendError("queued for someone who isn't signed in", 0, false);
          }
          return transport.send(report);
        },
        now,
        onProblem: problem,
      })
    : null;
  // Diagnostics (or the queue) switched off: what an earlier run queued is dropped, never sent later.
  if (options.offline && !queue) {
    const storage = options.offline.storage;
    const key = options.offline.key ?? DEFAULT_QUEUE_KEY;
    void Promise.resolve()
      .then(() => storage.removeItem(key))
      .catch((error: unknown) => problem("diagnostics: clearing the queue failed", error));
  }
  // Anything left from the last run goes as soon as it can.
  if (queue) void Promise.resolve().then(() => queue.flush().catch((error: unknown) => problem("diagnostics: flushing the queue failed", error)));

  async function collect({ trigger = "manual", feedbackId = null }: CollectOptions = {}): Promise<DiagnosticReport> {
    const report = emptyReport({
      id: randomId(),
      createdAt: new Date(now()).toISOString(),
      trigger,
      feedbackId,
      app: { id: options.app.id, name: options.app.name ?? null, platform: options.app.platform ?? null, environment: options.app.environment ?? null },
    });
    report.session = { uptimeMs: Math.max(0, now() - startedAt), route, recentRoutes: [...recentRoutes], foreground };

    const values = await Promise.all(
      sections.map(async (section) => {
        try {
          return await withTimeout(section.collect, section.options.timeoutMs ?? DIAGNOSTICS_DEFAULTS.sectionTimeoutMs);
        } catch (error) {
          problem(`diagnostics: the "${section.name}" section failed`, error);
          return null;
        }
      }),
    );
    sections.forEach((section, i) => {
      const value = values[i];
      if (section.options.merge) {
        if (value && typeof value === "object") for (const [key, part] of Object.entries(value)) if (isCore(key)) place(report, key, part);
        return;
      }
      place(report, section.name, value);
    });

    if (options.user) {
      try {
        const user = await withTimeout(options.user, DIAGNOSTICS_DEFAULTS.sectionTimeoutMs);
        report.user = user ? { id: user.id ?? null, role: user.role ?? null } : null;
      } catch (error) {
        problem("diagnostics: reading the user failed", error);
      }
    }
    if (!report.app.platform && typeof report.device?.os === "string") report.app.platform = report.device.os;

    // Scrub first (the scrubber cuts long strings, and cap names them), then cap.
    return capReport(redactReport(report, { trustedSections: trusted }), limits);
  }

  const diagnostics: Diagnostics = {
    options,
    enabled,
    feedbackSink: transport.feedbackSink,
    collect,
    async send({ trigger, feedbackId, report: given }) {
      if (!enabled) throw new DiagnosticsSendError("diagnostics are off (the diagnostics.enabled setting)", 0, false, "disabled");
      const report = given ? { ...given, trigger, feedbackId: feedbackId === undefined ? given.feedbackId : feedbackId } : await collect({ trigger, feedbackId: feedbackId ?? null });
      // Anything waiting goes first (oldest first), without holding this one up.
      if (queue) void queue.flush().catch((error: unknown) => problem("diagnostics: flushing the queue failed", error));
      try {
        const receipt = await transport.send(report);
        return { id: receipt.id, shortId: receipt.shortId, queued: false };
      } catch (error) {
        if (queue && isRetryableError(error)) {
          // The raw id from `user`, not the dump's (scrubbed: a long hex id reads `[hex]` there).
          await queue.add({ report, userId: await currentUserId() });
          return { id: report.id, shortId: diagnosticsShortId(report.id), queued: true };
        }
        throw error;
      }
    },
    async submitFeedback(record, { sink } = {}) {
      if (!enabled) {
        const target = sink ?? transport.feedbackSink;
        if (!target) throw new Error("submitFeedback: this transport has no feedback sink; pass `sink`.");
        return { ...(await target.submit(record)), diagnostics: null };
      }
      let report: DiagnosticReport | null = null;
      try {
        report = await collect({ trigger: "feedback" });
      } catch (error) {
        problem("diagnostics: the dump for this feedback could not be made", error);
      }
      if (report && transport.submitFeedback && (!sink || sink === transport.feedbackSink)) {
        const { diagnostics: receipt, ...delivery } = await transport.submitFeedback(record, report);
        return { ...delivery, diagnostics: receipt ? { ...receipt, queued: false } : null };
      }
      const target = sink ?? transport.feedbackSink;
      if (!target) throw new Error("submitFeedback: this transport has no feedback sink; pass `sink`.");
      const delivery = await target.submit(report ? { ...record, diagnosticsId: report.id } : record);
      if (!report) return { ...delivery, diagnostics: null };
      try {
        return { ...delivery, diagnostics: await diagnostics.send({ trigger: "feedback", report, feedbackId: delivery.id }) };
      } catch (error) {
        problem("diagnostics: the dump for this feedback was not sent", error);
        return { ...delivery, diagnostics: null };
      }
    },
    recordRoute(next) {
      const clean = cleanRoute(next ?? undefined) ?? null;
      if (!clean || clean === route) return;
      route = clean;
      recentRoutes = [...recentRoutes, clean].slice(-maxRoutes);
    },
    setForeground(value) {
      foreground = value;
    },
    flush: () => (queue ? queue.flush() : Promise.resolve({ sent: 0, kept: 0, dropped: 0 })),
    pending: () => (queue ? queue.size() : Promise.resolve(0)),
    clearQueue: () => (queue ? queue.clear() : Promise.resolve()),
  };
  return diagnostics;
}
