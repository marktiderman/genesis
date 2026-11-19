/**
 * Where a dump goes, and where the feedback that goes with it goes:
 *
 * - `supabaseTransport(supabase)`: the app's own Supabase. Dumps go to
 *   `public.support_diagnostics` (migration 0019), feedback and its
 *   screenshots to the tickets and the private `genesis-support` bucket, as
 *   the support client always sent them.
 * - `httpTransport({ url, auth })`: the app's own API, served by
 *   `createDiagnosticsHandler` from `@marktiderman/genesis-support/server`.
 *   A dump is a JSON POST; feedback is a multipart POST that carries its
 *   screenshots as files (the intake function takes none).
 *
 * A transport throws `DiagnosticsSendError`: `retryable` when trying again
 * later may work, so the offline queue keeps it.
 */
import { createSupabaseSink, type SupportClientOptions, type SupportSupabase } from "../client";
import { attachmentBytes, type FeedbackDelivery, type FeedbackRecord, type FeedbackSink } from "../record";
import { DiagnosticsSendError } from "./queue";
import { diagnosticsShortId, type DiagnosticReport } from "./report";

/** What a destination answers for a stored dump. */
export interface DiagnosticsReceipt {
  id: string;
  shortId: string;
}

export interface DiagnosticsTransport {
  /** For logs and errors. */
  readonly name: string;
  /** Store one dump (already scrubbed and capped). */
  send(report: DiagnosticReport): Promise<DiagnosticsReceipt>;
  /** The feedback sink for the same destination, screenshots included. */
  readonly feedbackSink?: FeedbackSink;
  /**
   * Feedback and its dump in one request, where the destination takes both (HTTP): the server
   * stores the dump linked to the new report and alerts staff with both. Without it, the feedback
   * goes first and the dump after it, with the report's id.
   */
  submitFeedback?(record: FeedbackRecord, report: DiagnosticReport): Promise<FeedbackDelivery & { diagnostics: DiagnosticsReceipt | null }>;
}

/** The table migration 0019 creates. */
export const DIAGNOSTICS_TABLE = "support_diagnostics";

/** A short line for the row's `app_version`: `1.4.0 (37)`, or null. */
export function reportVersionLine(report: DiagnosticReport): string | null {
  const b = report.build;
  if (!b || (!b.version && !b.build)) return null;
  return `${b.version ?? "unknown"} (${b.build ?? "unknown"})`.slice(0, 200);
}

const RETRY_CODES = new Set(["GS429", "57014", "PGRST301", "08000", "08003", "08006"]);

/**
 * Dumps into the app's own Supabase (migration 0019 applied). The person comes from the session;
 * the database refuses more than 10 dumps an hour (`GS429`, kept by the offline queue to try later).
 */
export function supabaseTransport(supabase: SupportSupabase, options: SupportClientOptions & { table?: string } = {}): DiagnosticsTransport {
  const table = options.table ?? DIAGNOSTICS_TABLE;
  return {
    name: "supabase",
    feedbackSink: createSupabaseSink(supabase, options),
    async send(report) {
      let result: { error: { message: string; code?: string } | null };
      try {
        result = await supabase.from(table).insert({
          id: report.id,
          feedback_id: report.feedbackId,
          trigger: report.trigger,
          app_version: reportVersionLine(report),
          platform: report.app.platform?.slice(0, 40) ?? null,
          report,
        });
      } catch (error) {
        throw new DiagnosticsSendError(error instanceof Error ? error.message : "network request failed", 0, true);
      }
      const error = result.error;
      // 23505: this dump is already stored (an earlier try arrived, its answer didn't).
      if (error && error.code !== "23505") {
        const status = error.code === "GS429" ? 429 : error.code === "42501" ? 403 : error.code ? 400 : 0;
        throw new DiagnosticsSendError(error.message, status, !error.code || RETRY_CODES.has(error.code), error.code);
      }
      return { id: report.id, shortId: diagnosticsShortId(report.id) };
    },
  };
}

export interface HttpTransportOptions {
  /** The handler's URL (`https://api.example.com/support/diagnostics`). Dumps and feedback both go here. */
  url: string;
  /**
   * The `Authorization` header's value, read per request (`() => \`Bearer ${token}\``), or a bare
   * token, sent as `Bearer <token>`. Null sends none.
   */
  auth?: () => string | null | undefined | Promise<string | null | undefined>;
  /** More headers (an API key, a tenant). */
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  /** Abort a request after this many ms. Default 20000. */
  timeoutMs?: number;
}

const isReactNative = () => typeof navigator !== "undefined" && (navigator as { product?: string }).product === "ReactNative";

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** The multipart field names `createDiagnosticsHandler` reads. */
export const FEEDBACK_FORM_FIELDS = { feedback: "feedback", diagnostics: "diagnostics", screenshot: "screenshot" } as const;

/**
 * Dumps and feedback over HTTP to the app's own API. Feedback is `multipart/form-data`: a
 * `feedback` part (the record as JSON, without the images) and one `screenshot` part per image,
 * so a server that isn't Supabase stores the screenshots too.
 */
export function httpTransport(options: HttpTransportOptions): DiagnosticsTransport {
  const f = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 20_000;

  async function headers(): Promise<Record<string, string>> {
    const auth = await options.auth?.();
    return { ...(options.headers ?? {}), ...(auth ? { authorization: /\s/.test(auth) ? auth : `Bearer ${auth}` } : {}) };
  }

  async function post<T>(body: BodyInit, contentType: string | null): Promise<T> {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    let res: Response;
    try {
      res = await f(options.url, {
        method: "POST",
        headers: { ...(await headers()), ...(contentType ? { "content-type": contentType } : {}) },
        body,
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch (error) {
      throw new DiagnosticsSendError(error instanceof Error ? error.message : "network request failed", 0, true);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = (await res.json()) as Record<string, unknown>;
    } catch {
      // not JSON
    }
    if (!res.ok) {
      const code = typeof payload["error"] === "string" ? payload["error"] : undefined;
      throw new DiagnosticsSendError(code ?? `${res.status} ${res.statusText}`, res.status, res.status === 408 || res.status === 429 || res.status >= 500, code);
    }
    return payload as T;
  }

  async function submitMultipart(record: FeedbackRecord, report: DiagnosticReport | null) {
    const form = new FormData();
    const { attachments = [], ...rest } = record;
    const kept: FeedbackRecord["attachments"] = [];
    let dropped = 0;
    for (const attachment of attachments.slice(0, 5)) {
      try {
        const name = `screenshot-${kept.length + 1}.${EXTENSIONS[attachment.contentType] ?? "png"}`;
        if (isReactNative() && attachment.base64) {
          // React Native's FormData takes a file as { uri, type, name } (it can't make a Blob from bytes).
          const uri = attachment.base64.startsWith("data:") ? attachment.base64 : `data:${attachment.contentType};base64,${attachment.base64}`;
          form.append(FEEDBACK_FORM_FIELDS.screenshot, { uri, type: attachment.contentType, name } as unknown as Blob);
        } else {
          const bytes = attachmentBytes(attachment);
          if (!bytes) throw new Error("no image data");
          form.append(FEEDBACK_FORM_FIELDS.screenshot, new Blob([bytes as BlobPart], { type: attachment.contentType }), name);
        }
        kept.push({ kind: "screenshot", contentType: attachment.contentType, ...(attachment.width ? { width: attachment.width } : {}), ...(attachment.height ? { height: attachment.height } : {}) });
      } catch {
        dropped += 1;
      }
    }
    dropped += Math.max(0, attachments.length - 5);
    form.append(FEEDBACK_FORM_FIELDS.feedback, JSON.stringify({ ...rest, ...(report ? { diagnosticsId: report.id } : {}), attachments: kept }));
    if (report) form.append(FEEDBACK_FORM_FIELDS.diagnostics, JSON.stringify(report));
    // The browser (or React Native) sets the multipart boundary itself.
    const answer = await post<{ id?: string; attachmentsDropped?: number; diagnostics?: { id?: string; shortId?: string } | null }>(form, null);
    if (typeof answer.id !== "string") throw new DiagnosticsSendError("the server answered without an id", 502, true);
    const d = answer.diagnostics;
    return {
      id: answer.id,
      attachmentsDropped: dropped + (typeof answer.attachmentsDropped === "number" ? answer.attachmentsDropped : 0),
      diagnostics: d && typeof d.id === "string" ? { id: d.id, shortId: typeof d.shortId === "string" ? d.shortId : diagnosticsShortId(d.id) } : null,
    };
  }

  const feedbackSink: FeedbackSink = {
    async submit(record) {
      const { diagnostics: _ignored, ...delivery } = await submitMultipart(record, null);
      return delivery;
    },
  };

  return {
    name: "http",
    feedbackSink,
    submitFeedback: (record, report) => submitMultipart(record, report),
    async send(report) {
      const answer = await post<{ id?: string; shortId?: string }>(JSON.stringify(report), "application/json");
      const id = typeof answer.id === "string" ? answer.id : report.id;
      return { id, shortId: typeof answer.shortId === "string" ? answer.shortId : diagnosticsShortId(id) };
    },
  };
}
