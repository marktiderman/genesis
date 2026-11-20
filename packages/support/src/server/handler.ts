/**
 * `createDiagnosticsHandler(options)`: one server endpoint for dumps and for
 * feedback with screenshots, as a framework-neutral Fetch handler
 * (`Request → Promise<Response>`). Mount it in a NestJS controller, a Supabase
 * Edge Function or a TanStack Start server route (README, "Diagnostics on your
 * own server").
 *
 *   POST application/json          a dump (`genesis.diagnostics/1`)       → 201 { id, shortId }
 *   POST multipart/form-data       `feedback` (the record as JSON),
 *                                  `diagnostics` (its dump, optional),
 *                                  `screenshot` files (up to 5)            → 201 { id, attachmentsDropped, diagnostics }
 *
 * Every request is authenticated (`authenticate` names the person, or the
 * answer is 401), rate limited (per IP, and per person: 10 dumps and 20
 * reports an hour), size checked (a dump over 512 KB is refused with 413;
 * anything smaller is capped to 256 KB), scrubbed again and stored through the
 * app's adapters. Notifiers run after the answer is decided; one that fails
 * never fails the request.
 */
import { cleanRoute, LIMITS, type FindingSeverity } from "../contract";
import { supportSettingValues, type SupportSettingsInput } from "../settings";
import { diagnosticsShortId, DIAGNOSTICS_DEFAULTS, isUuid, randomUuid, type DiagnosticReport } from "../diagnostics/report";
import { FEEDBACK_FORM_FIELDS } from "../diagnostics/transports";
import { scrubString, scrubValueStrict } from "../diagnostics/scrub";
import { DEVICE_MAX_BYTES, EXTRA_MAX_BYTES, FEEDBACK_TYPES, type FeedbackType, type ScreenshotContentType } from "../record";
import type { SupportEvent, SupportNotifier } from "./events";
import { parseDiagnosticReport } from "./parse";

/** Who is calling, from `authenticate`. */
export interface DiagnosticsCaller {
  userId: string;
  role?: string | null;
}

/** Feedback as the handler stores it: checked, the route cleaned, the bags under their caps. */
export interface FeedbackSubmission {
  type: FeedbackType;
  title: string | null;
  message: string;
  severity: FindingSeverity | null;
  route: string | null;
  appVersion: string | null;
  platform: string | null;
  device: Record<string, unknown>;
  extra: Record<string, unknown>;
  tenantId: string | null;
  diagnosticsId: string | null;
}

/** A screenshot as stored. */
export interface StoredFile {
  feedbackId: string;
  userId: string;
  path: string;
  contentType: ScreenshotContentType;
  byteSize: number;
  width: number | null;
  height: number | null;
}

/** A refusal from the store the handler passes on (`429` for the database's rate limit). */
export class DiagnosticsStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DiagnosticsStoreError";
  }
}

/**
 * Where dumps and feedback are kept: the app's database (Supabase, Drizzle, anything). The store
 * writes with the server's own rights, so it holds the checks the database's row rules would:
 *
 * - `saveReport`'s `feedbackId` must be one of `userId`'s own reports. The handler asks
 *   `ownsFeedback` first when the store has it; without it, the store checks (or its database
 *   refuses: migration 0019 does). A dump already stored (same id, same person) is not an error.
 * - `saveFeedback`'s `feedback.tenantId` (a help desk other than the app's own) must be a tenant
 *   `userId` belongs to, with its help desk on; refuse with `DiagnosticsStoreError(…, 403)`.
 */
export interface DiagnosticsStore {
  saveReport(input: { report: DiagnosticReport; userId: string; feedbackId: string | null }): Promise<{ id: string; shortId?: string }>;
  /** Store feedback. Without it, the handler answers feedback with 501. */
  saveFeedback?(input: { feedback: FeedbackSubmission; userId: string }): Promise<{ id: string }>;
  /** Record a screenshot stored by `files`. Without it, screenshots are dropped. */
  attachFile?(file: StoredFile): Promise<void>;
  /** Is `feedbackId` one of `userId`'s own reports? Asked before a dump is linked to it. */
  ownsFeedback?(userId: string, feedbackId: string): Promise<boolean>;
  /** Is `reportId` one of `userId`'s own dumps? Without it, feedback naming a dump it didn't bring drops the name. */
  ownsReport?(userId: string, reportId: string): Promise<boolean>;
}

/** Where screenshots go: Supabase Storage, S3, a disk. */
export interface DiagnosticsFiles {
  put(path: string, bytes: Uint8Array, contentType: ScreenshotContentType): Promise<void>;
  /** Remove a file whose record couldn't be written, so nothing is left behind. */
  remove?(path: string): Promise<void>;
}

/** Cross-origin calls (a web app on another origin than its API). */
export interface DiagnosticsCors {
  /** Allowed origins, exactly as the browser sends them (`https://app.example.com`). */
  origins: readonly string[];
  /** Extra request headers to allow beside `authorization` and `content-type`. */
  headers?: readonly string[];
  /** Preflight cache, in seconds. Default 600. */
  maxAge?: number;
}

/** Counts hits; `true` while under the limit. */
export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number): boolean | Promise<boolean>;
}

/**
 * A rate limiter in memory: enough for one server process. Behind several instances (or on an
 * Edge Function, which starts fresh), pass one backed by a shared store, or rely on the database's
 * own limit (migration 0019 holds 10 dumps an hour per person).
 */
export function memoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key, limit, windowMs) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => at > t - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((at) => at > t - windowMs)) hits.delete(k);
      return true;
    },
  };
}

export interface DiagnosticsHandlerOptions {
  /** Who is calling: verify the token your way (`supabaseAuthenticate(admin)` for Supabase Auth). Null answers 401. */
  authenticate: (request: Request) => DiagnosticsCaller | null | Promise<DiagnosticsCaller | null>;
  store: DiagnosticsStore;
  /** Where screenshots go. Without it, feedback is stored without them (`attachmentsDropped`). */
  files?: DiagnosticsFiles;
  notify?: readonly (SupportNotifier | null | undefined | false)[];
  /** Default `memoryRateLimiter()`; `false` leaves limiting to the database. */
  rateLimit?: RateLimiter | false;
  limits?: {
    /** Dumps per person per hour. Default 10. */
    diagnosticsPerHour?: number;
    /** Reports per person per hour. Default 20, as the database's. */
    feedbackPerHour?: number;
    /** Requests per IP per minute, when `clientIp` is given. Default 5. */
    ipPerMinute?: number;
    /** A dump's body. Default 512 KB. */
    maxBodyBytes?: number;
  };
  /**
   * The caller's IP, for the per-IP limit. There is no default: a header such as
   * `x-forwarded-for` is whatever the client sent unless your proxy overwrites it, so a default
   * would let anyone dodge the limit or lock out someone else's network. Pass what your platform
   * vouches for (the socket's address, or the hop your own proxy appends). Without it, there is no
   * per-IP limit; the per-person limits still hold.
   */
  clientIp?: (request: Request) => string | null;
  /**
   * Answer cross-origin calls: the preflight (`OPTIONS`) and the CORS headers on every answer.
   * Without it, `OPTIONS` is refused and the mounting framework owns CORS.
   */
  cors?: DiagnosticsCors;
  /**
   * Keep notifiers running after the answer (Cloudflare's and Vercel's `waitUntil`, Supabase's
   * `EdgeRuntime.waitUntil`). Without it, the handler waits for them before answering.
   */
  waitUntil?: (work: Promise<unknown>) => void;
  /** A store, file or notifier failed. Default `console.error`. */
  onError?: (error: unknown, where: string) => void;
  now?: () => number;
  /**
   * Genesis settings (`resolveSettings`' result, or the values alone): `diagnostics.perHour` is the
   * dumps-per-person limit unless `limits.diagnosticsPerHour` is given. Without either, 10.
   */
  appSettings?: SupportSettingsInput;
}

const SCREENSHOT_TYPES: Record<string, ScreenshotContentType> = { "image/png": "image/png", "image/jpeg": "image/jpeg", "image/jpg": "image/jpeg", "image/webp": "image/webp" };
const EXT: Record<ScreenshotContentType, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const MAX_SCREENSHOTS = 5;
const SEVERITIES: readonly FindingSeverity[] = ["low", "medium", "high", "critical"];

/** The file starts like the image type it says it is. */
export function looksLikeImage(bytes: Uint8Array, type: ScreenshotContentType): boolean {
  const at = (i: number) => bytes[i] ?? -1;
  if (type === "image/png") return at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47;
  if (type === "image/jpeg") return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
  return at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const optionalText = (value: unknown, max: number): string | null => (typeof value === "string" && value.trim() ? scrubString(value.trim()).slice(0, max) : null);
const objectOf = (value: unknown, maxBytes: number): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const scrubbed = scrubValueStrict(value) as Record<string, unknown>;
  return jsonBytes(scrubbed) <= maxBytes ? scrubbed : {};
};

/**
 * The feedback part, checked the way the database checks it. The message and title are what the
 * person typed and are kept as typed (staff read them); everything else is scrubbed.
 */
export function parseFeedbackSubmission(raw: unknown): { ok: true; value: FeedbackSubmission } | { ok: false; field: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, field: "feedback" };
  const r = raw as Record<string, unknown>;
  const type = (r["type"] ?? "bug") as FeedbackType;
  if (!FEEDBACK_TYPES.includes(type)) return { ok: false, field: "type" };
  if (typeof r["message"] !== "string" || !r["message"].trim() || r["message"].length > LIMITS.body) return { ok: false, field: "message" };
  if (r["title"] != null && (typeof r["title"] !== "string" || r["title"].length > LIMITS.title)) return { ok: false, field: "title" };
  if (r["severity"] != null && !SEVERITIES.includes(r["severity"] as FindingSeverity)) return { ok: false, field: "severity" };
  if (r["tenantId"] != null && !isUuid(r["tenantId"])) return { ok: false, field: "tenantId" };
  if (r["diagnosticsId"] != null && !isUuid(r["diagnosticsId"])) return { ok: false, field: "diagnosticsId" };
  const context = (r["context"] && typeof r["context"] === "object" ? r["context"] : {}) as Record<string, unknown>;
  return {
    ok: true,
    value: {
      type,
      title: typeof r["title"] === "string" && r["title"].trim() ? r["title"].trim() : null,
      message: r["message"],
      severity: (r["severity"] as FindingSeverity | undefined) ?? null,
      route: cleanRoute(typeof context["route"] === "string" ? context["route"] : undefined) ?? null,
      appVersion: optionalText(context["appVersion"], LIMITS.appVersion),
      platform: optionalText(context["platform"], 40),
      device: objectOf(context["device"], DEVICE_MAX_BYTES),
      extra: objectOf(context["extra"], EXTRA_MAX_BYTES),
      tenantId: (r["tenantId"] as string | undefined) ?? null,
      diagnosticsId: (r["diagnosticsId"] as string | undefined) ?? null,
    },
  };
}

/** The body, read through a byte counter: null when it passes `max` (the read stops there). */
export async function readBodyLimited(request: Request, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

export type DiagnosticsHandler = (request: Request) => Promise<Response>;

export function createDiagnosticsHandler(options: DiagnosticsHandlerOptions): DiagnosticsHandler {
  const limiter = options.rateLimit === false ? null : (options.rateLimit ?? memoryRateLimiter(options.now));
  const perHour = options.limits?.diagnosticsPerHour ?? supportSettingValues(options.appSettings).diagnostics.perHour;
  const feedbackPerHour = options.limits?.feedbackPerHour ?? 20;
  const ipPerMinute = options.limits?.ipPerMinute ?? DIAGNOSTICS_DEFAULTS.ipRatePerMinute;
  const maxBody = options.limits?.maxBodyBytes ?? DIAGNOSTICS_DEFAULTS.serverMaxBytes;
  const maxMultipart = maxBody + MAX_SCREENSHOTS * MAX_SCREENSHOT_BYTES + 64 * 1024;
  const notifiers = (options.notify ?? []).filter((n): n is SupportNotifier => Boolean(n));
  const now = options.now ?? Date.now;
  const corsFor = (request: Request): Record<string, string> => {
    const origin = request.headers.get("origin");
    if (!options.cors || !origin || !options.cors.origins.includes(origin)) return {};
    return { "access-control-allow-origin": origin, vary: "origin" };
  };
  const fail = (error: unknown, where: string) => {
    try {
      // genesis-allow-console: a server handler's default error log; apps pass onError.
      (options.onError ?? ((e, w) => console.error(`[genesis-support/server] ${w}:`, e instanceof Error ? e.message : e)))(error, where);
    } catch {
      // never let a logger break a request
    }
  };

  async function allowed(key: string, limit: number, windowMs: number): Promise<boolean> {
    if (!limiter) return true;
    try {
      return await limiter.hit(key, limit, windowMs);
    } catch (error) {
      // A limiter that's down doesn't take support down with it; the database still limits.
      fail(error, "rateLimit");
      return true;
    }
  }

  function announce(event: SupportEvent): Promise<void> {
    const work = Promise.allSettled(
      notifiers.map(async (n) => {
        try {
          await n.notify(event);
        } catch (error) {
          fail(error, `notify:${n.name}`);
        }
      }),
    ).then(() => undefined);
    if (options.waitUntil) {
      options.waitUntil(work);
      return Promise.resolve();
    }
    return work;
  }

  const storeFailure = (error: unknown, where: string): Response => {
    if (error instanceof DiagnosticsStoreError) return json(error.status, { error: error.code ?? error.message });
    fail(error, where);
    return json(500, { error: "store_failed" });
  };

  async function saveReport(report: DiagnosticReport, caller: DiagnosticsCaller, feedbackId: string | null) {
    const stored = await options.store.saveReport({ report: { ...report, feedbackId }, userId: caller.userId, feedbackId });
    return { id: stored.id, shortId: stored.shortId ?? diagnosticsShortId(stored.id) };
  }

  async function owns(check: ((userId: string, id: string) => Promise<boolean>) | undefined, userId: string, id: string, where: string): Promise<boolean | null> {
    if (!check) return null;
    try {
      return await check.call(options.store, userId, id);
    } catch (error) {
      fail(error, where);
      return false;
    }
  }

  async function onDump(body: Uint8Array, caller: DiagnosticsCaller): Promise<Response> {
    const text = new TextDecoder().decode(body);
    const parsed = parseDiagnosticReport(text, { maxBodyBytes: maxBody });
    if (!parsed.ok) return json(parsed.status, { error: parsed.error, ...(parsed.field ? { field: parsed.field } : {}) });
    if (!(await allowed(`diagnostics:${caller.userId}`, perHour, 3_600_000))) return json(429, { error: "rate_limited" });
    if (parsed.report.feedbackId && (await owns(options.store.ownsFeedback, caller.userId, parsed.report.feedbackId, "store.ownsFeedback")) === false) {
      return json(403, { error: "not_your_feedback" });
    }
    // The person is whoever signed the request, never what the dump says, and so is the role.
    const report: DiagnosticReport = { ...parsed.report, user: { id: caller.userId, role: caller.role ?? null } };
    let stored: { id: string; shortId: string };
    try {
      stored = await saveReport(report, caller, report.feedbackId);
    } catch (error) {
      return storeFailure(error, "store.saveReport");
    }
    await announce({ kind: "diagnostics", id: stored.id, shortId: stored.shortId, userId: caller.userId, createdAt: new Date(now()).toISOString(), feedbackId: report.feedbackId, report });
    return json(201, stored);
  }

  async function onFeedback(body: Uint8Array, contentType: string, caller: DiagnosticsCaller): Promise<Response> {
    if (!options.store.saveFeedback) return json(501, { error: "feedback_not_supported" });
    let form: FormData;
    try {
      form = (await new Response(body as BodyInit, { headers: { "content-type": contentType } }).formData()) as unknown as FormData;
    } catch {
      return json(400, { error: "invalid_form" });
    }
    let raw: unknown;
    try {
      raw = JSON.parse(String(form.get(FEEDBACK_FORM_FIELDS.feedback) ?? ""));
    } catch {
      return json(400, { error: "invalid_json", field: "feedback" });
    }
    const feedback = parseFeedbackSubmission(raw);
    if (!feedback.ok) return json(400, { error: "invalid_feedback", field: feedback.field });

    let report: DiagnosticReport | null = null;
    const dumpPart = form.get(FEEDBACK_FORM_FIELDS.diagnostics);
    if (typeof dumpPart === "string" && dumpPart) {
      const parsed = parseDiagnosticReport(dumpPart, { maxBodyBytes: maxBody });
      if (!parsed.ok) return json(parsed.status, { error: parsed.error, field: `diagnostics${parsed.field ? `.${parsed.field}` : ""}` });
      report = { ...parsed.report, trigger: "feedback", user: { id: caller.userId, role: caller.role ?? null } };
    }
    if (!(await allowed(`feedback:${caller.userId}`, feedbackPerHour, 3_600_000))) return json(429, { error: "rate_limited" });

    // A dump named without being brought: kept only if it is the caller's own.
    let named = feedback.value.diagnosticsId;
    if (!report && named && (await owns(options.store.ownsReport, caller.userId, named, "store.ownsReport")) !== true) named = null;
    const submission: FeedbackSubmission = { ...feedback.value, diagnosticsId: report?.id ?? named };
    let id: string;
    try {
      id = (await options.store.saveFeedback({ feedback: submission, userId: caller.userId })).id;
    } catch (error) {
      return storeFailure(error, "store.saveFeedback");
    }

    // Screenshots: the declared images only, checked by their first bytes, 5 MiB each, 5 at most.
    const parts = form.getAll(FEEDBACK_FORM_FIELDS.screenshot);
    let dropped = Math.max(0, parts.length - MAX_SCREENSHOTS);
    let saved = 0;
    const declared = Array.isArray((raw as { attachments?: unknown }).attachments) ? ((raw as { attachments: Array<{ width?: unknown; height?: unknown }> }).attachments) : [];
    for (const [i, part] of parts.slice(0, MAX_SCREENSHOTS).entries()) {
      const file = part as Blob;
      const type = typeof file === "object" && file && "type" in file ? SCREENSHOT_TYPES[file.type] : undefined;
      if (!type || !options.files || !options.store.attachFile || file.size > MAX_SCREENSHOT_BYTES) {
        dropped += 1;
        continue;
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!looksLikeImage(bytes, type)) throw new Error("not the image type it says it is");
        const path = `${caller.userId}/${id}/${randomUuid().replace(/-/g, "")}.${EXT[type]}`;
        await options.files.put(path, bytes, type);
        const dims = declared[i] ?? {};
        try {
          await options.store.attachFile({
            feedbackId: id,
            userId: caller.userId,
            path,
            contentType: type,
            byteSize: bytes.byteLength,
            width: typeof dims.width === "number" ? Math.round(dims.width) : null,
            height: typeof dims.height === "number" ? Math.round(dims.height) : null,
          });
        } catch (error) {
          // The record wasn't written: take the file back, so nothing is left without one.
          await options.files.remove?.(path).catch((removeError: unknown) => fail(removeError, "files.remove"));
          throw error;
        }
        saved += 1;
      } catch (error) {
        fail(error, "files.put");
        dropped += 1;
      }
    }

    let diagnostics: { id: string; shortId: string } | null = null;
    if (report) {
      try {
        diagnostics = await saveReport(report, caller, id);
      } catch (error) {
        // The feedback is stored: a dump the store refused (its own rate limit) doesn't undo it.
        fail(error, "store.saveReport");
      }
    }

    await announce({
      kind: "feedback",
      id,
      userId: caller.userId,
      createdAt: new Date(now()).toISOString(),
      feedback: {
        type: submission.type,
        title: submission.title ?? submission.message.slice(0, 120),
        message: submission.message.length > 2000 ? `${submission.message.slice(0, 2000)}…` : submission.message,
        severity: submission.severity,
        route: submission.route,
        appVersion: submission.appVersion,
        platform: submission.platform,
      },
      screenshots: saved,
      diagnosticsId: diagnostics?.id ?? submission.diagnosticsId,
      diagnosticsShortId: diagnostics?.shortId ?? (submission.diagnosticsId ? diagnosticsShortId(submission.diagnosticsId) : null),
      report: diagnostics && report ? { ...report, feedbackId: id } : null,
    });
    return json(201, { id, attachmentsDropped: dropped, diagnostics });
  }

  async function respond(request: Request): Promise<Response> {
    if (request.method === "OPTIONS" && options.cors) {
      const origin = request.headers.get("origin");
      if (!origin || !options.cors.origins.includes(origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": ["authorization", "content-type", ...(options.cors.headers ?? [])].join(", "),
          "access-control-max-age": String(options.cors.maxAge ?? 600),
        },
      });
    }
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
    const contentType = request.headers.get("content-type") ?? "";
    const type = contentType.toLowerCase();
    const multipart = type.startsWith("multipart/form-data");
    if (!multipart && !type.startsWith("application/json")) return json(415, { error: "unsupported_media_type" });
    const limit = multipart ? maxMultipart : maxBody;
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > limit) return json(413, { error: "payload_too_large" });

    const ip = options.clientIp?.(request) ?? null;
    if (ip && !(await allowed(`ip:${ip}`, ipPerMinute, 60_000))) return json(429, { error: "rate_limited" });

    let caller: DiagnosticsCaller | null;
    try {
      caller = await options.authenticate(request);
    } catch (error) {
      fail(error, "authenticate");
      caller = null;
    }
    if (!caller?.userId) return json(401, { error: "unauthorized" });

    try {
      // Counted as it arrives: a chunked body with no length (or a false one) stops at the limit.
      const body = await readBodyLimited(request, limit);
      if (!body) return json(413, { error: "payload_too_large" });
      return multipart ? await onFeedback(body, contentType, caller) : await onDump(body, caller);
    } catch (error) {
      fail(error, "handler");
      return json(500, { error: "internal_error" });
    }
  }

  return async function handle(request: Request): Promise<Response> {
    const response = await respond(request);
    const cors = corsFor(request);
    if (!Object.keys(cors).length) return response;
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}
