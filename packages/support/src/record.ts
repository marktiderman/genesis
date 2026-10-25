/**
 * The feedback record and its two seams: a collector assembles the context
 * (everything except what the person typed), a sink delivers the finished
 * record. Platform-neutral; one default of each ships (`createContextCollector`,
 * `createSupabaseSink`), and an app can swap either.
 */
import { cleanRoute, type FeedbackReportType } from "./contract";

/** What kind of feedback: a bug, an idea, a question or praise. */
export type FeedbackType = FeedbackReportType;

export const FEEDBACK_TYPES: readonly FeedbackType[] = ["bug", "idea", "question", "praise"];

/** Where the person was and what they were running when they sent it. */
export interface FeedbackContext {
  /** The version signature, `1.4.0 (37) · preview · 3f2a9c1b`. */
  appVersion?: string;
  /** The screen, as a path. Query strings and fragments are always dropped. */
  route?: string;
  /** `ios`, `android`, `web`. */
  platform?: string;
  /** Model, OS version, locale, screen size, update id… At most 4 KB as JSON. */
  device?: Record<string, unknown>;
  /**
   * Who sent it, for sinks that need it. The Supabase sink ignores it: the
   * database takes the person from the session, never from the request.
   */
  userId?: string;
  /** Anything else small (breadcrumbs, a pin on the page). At most 16 KB as JSON. */
  extra?: Record<string, unknown>;
}

export type ScreenshotContentType = "image/png" | "image/jpeg" | "image/webp";

/**
 * A screenshot to attach. The record carries the bytes (or base64) and no
 * URL: the destination stores it and keeps its own key, so nothing in the
 * record expires.
 */
export interface FeedbackAttachment {
  kind: "screenshot";
  contentType: ScreenshotContentType;
  /** The image, base64 (no `data:` prefix; a data URI is accepted and stripped). */
  base64?: string;
  /** Or the bytes. */
  bytes?: Uint8Array;
  width?: number;
  height?: number;
}

export interface FeedbackRecord {
  type: FeedbackType;
  /** What the person wrote. */
  message: string;
  title?: string;
  context: FeedbackContext;
  attachments?: FeedbackAttachment[];
}

/** Everything but what the person typed. */
export interface ContextCollector {
  collect(): Promise<FeedbackContext> | FeedbackContext;
}

/** What the destination kept. */
export interface FeedbackDelivery {
  /** The saved report's id. */
  id: string;
  /** How many attachments the destination saved the report without (an upload failed, or it takes none). */
  attachmentsDropped: number;
}

/** Takes a finished record to its destination. */
export interface FeedbackSink {
  submit(record: FeedbackRecord): Promise<FeedbackDelivery>;
}

export const DEVICE_MAX_BYTES = 4096;
export const EXTRA_MAX_BYTES = 16384;

const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** A value given as itself or as a function that reads it now. */
export type Lazy<T> = T | (() => T);
const read = <T,>(value: Lazy<T> | undefined): T | undefined => (typeof value === "function" ? (value as () => T)() : value);

export interface ContextCollectorOptions {
  appVersion?: Lazy<string | undefined>;
  route?: Lazy<string | undefined>;
  platform?: Lazy<string | undefined>;
  device?: Lazy<Record<string, unknown> | undefined>;
  userId?: Lazy<string | undefined>;
  extra?: Lazy<Record<string, unknown> | undefined>;
}

/**
 * The default collector: reads each value when feedback is sent, cleans the
 * route, and drops a device or extra bag over its size cap rather than
 * sending a report the database would refuse.
 */
export function createContextCollector(options: ContextCollectorOptions): ContextCollector {
  return {
    collect() {
      return sanitizeContext({
        appVersion: read(options.appVersion),
        route: read(options.route),
        platform: read(options.platform),
        device: read(options.device),
        userId: read(options.userId),
        extra: read(options.extra),
      });
    },
  };
}

/** Collectors merged left to right (a later one's values win; `device` and `extra` merge by key). */
export function composeCollectors(...collectors: ContextCollector[]): ContextCollector {
  return {
    async collect() {
      let out: FeedbackContext = {};
      for (const c of collectors) {
        const next = await c.collect();
        out = {
          ...out,
          ...dropUndefined(next),
          device: next.device || out.device ? { ...out.device, ...next.device } : undefined,
          extra: next.extra || out.extra ? { ...out.extra, ...next.extra } : undefined,
        };
      }
      return sanitizeContext(out);
    },
  };
}

function dropUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** The context as the database takes it: a clean route, short strings, bags under their caps. */
export function sanitizeContext(context: FeedbackContext): FeedbackContext {
  const out: FeedbackContext = {};
  const route = cleanRoute(context.route);
  if (route) out.route = route;
  if (context.appVersion) out.appVersion = String(context.appVersion).slice(0, 200);
  if (context.platform) out.platform = String(context.platform).slice(0, 40);
  if (context.userId) out.userId = context.userId;
  if (context.device && typeof context.device === "object" && jsonBytes(context.device) <= DEVICE_MAX_BYTES) out.device = context.device;
  if (context.extra && typeof context.extra === "object" && jsonBytes(context.extra) <= EXTRA_MAX_BYTES) out.extra = context.extra;
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) table[B64.charCodeAt(i)] = i;
  table["-".charCodeAt(0)] = 62;
  table["_".charCodeAt(0)] = 63;
  return table;
})();

/** Base64 (or a `data:` URI) to bytes, without `atob` (Hermes, workers, Node all agree). */
export function base64ToBytes(input: string): Uint8Array {
  const comma = input.startsWith("data:") ? input.indexOf(",") : -1;
  const clean = (comma >= 0 ? input.slice(comma + 1) : input).replace(/[\s=]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = LOOKUP[clean.charCodeAt(i)] ?? -1;
    if (v < 0) throw new Error("base64ToBytes: not base64");
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

/** The bytes of an attachment, from `bytes` or `base64`. */
export function attachmentBytes(attachment: FeedbackAttachment): Uint8Array | null {
  if (attachment.bytes?.length) return attachment.bytes;
  if (attachment.base64) return base64ToBytes(attachment.base64);
  return null;
}
