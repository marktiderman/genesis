/**
 * The email destination: one notification per submission, through any
 * provider that implements `EmailProvider`. `resendProvider` is built in.
 *
 * The body is built from the definition: each answered field's label (recall
 * filled in) and its value, in form order, after the app's meta columns.
 * Every value is HTML-escaped. Subjects and addresses are stripped of line
 * breaks and checked, so an answer can never add a header. Sensitive fields
 * are masked unless `sensitive: "include"` is set: an inbox is not a vault.
 */
import { isEmailAddress } from "../fields";
import { own } from "../logic";
import type { FormDefinition } from "../types";
import { responseRow, type ResponseRow, type RowOptions } from "./row";
import {
  configString,
  deliveryFailure,
  DeliveryError,
  discard,
  httpError,

  sha256Hex,
  timedFetch,
  type Cell,
  type DeliveryOptions,
  type DeliveryResult,
  type DeliverySubmission,
  type Destination,
  type DestinationConfig,
  type HttpDeps,
} from "./types";

/** One message, ready to send. Addresses are already checked. */
export interface EmailMessage {
  from: string;
  to: string[];
  replyTo?: string | undefined;
  subject: string;
  text: string;
  html: string;
  /** Stable across retries of one delivery: a provider that supports it sends once. */
  idempotencyKey: string;
}

/** Sends one message. Throws a `DeliveryError` (or any error) on failure. */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage, options: { signal?: AbortSignal | undefined }): Promise<void>;
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface EmailRenderInput {
  submission: DeliverySubmission;
  definition: FormDefinition;
  config: DestinationConfig;
  /** The submission as a row (sensitive values masked unless `sensitive: "include"`). */
  row: ResponseRow;
}

/** What the email destination reads from a destination's config. */
export interface EmailConfig {
  /** One address or a list (at most 50). */
  to: string | string[];
  /** Overrides the default subject (still stripped of line breaks). */
  subject?: string;
}

export interface EmailDestinationOptions {
  provider: EmailProvider;
  /** `"Feedback <feedback@send.example.com>"` or a bare address. */
  from: string;
  /**
   * The Reply-To address: the key of an email field whose answer is used, or
   * a function returning an address (or null for none). Only a valid single
   * address is ever used.
   */
  replyTo?: string | ((input: EmailRenderInput) => string | null | undefined) | undefined;
  /** Builds the subject and bodies. Defaults to `renderEmail`. The subject is sanitized afterwards either way. */
  render?: ((input: EmailRenderInput) => EmailContent) | undefined;
  /** Sensitive fields: `"mask"` (default), `"omit"` or `"include"`. */
  sensitive?: RowOptions["sensitive"];
}

/** Resend allows 50 recipients per email. */
export const MAX_RECIPIENTS = 50;
const MAX_SUBJECT_LENGTH = 200;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A header value on one line: control characters (CR, LF, NUL…) and Unicode
 * line separators become spaces, runs of spaces collapse, and it is cut to
 * `max` characters.
 */
export function headerSafe(text: string, max = MAX_SUBJECT_LENGTH): string {
  // eslint-disable-next-line no-control-regex
  const flat = text.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** A bare address that is safe as a header value: valid, one line, no display name. */
export function isSafeAddress(value: unknown): value is string {
  return typeof value === "string" && isEmailAddress(value) && !/[\u0000-\u001f\u007f<>,;:"()[\]\\]/.test(value);
}

/**
 * A From value: a bare address, or `Name <address>` where the name has no
 * quotes, angle brackets or line breaks.
 */
export function isSafeFrom(value: string): boolean {
  const named = /^([^"<>\u0000-\u001f\u007f]{1,100}) <([^<>]+)>$/.exec(value);
  return named ? isSafeAddress(named[2]) : isSafeAddress(value);
}

/** Plain text and HTML bodies from label/value lines, every value escaped. */
export function emailBody(lines: readonly (readonly [string, Cell])[], footer?: string): { text: string; html: string } {
  const text = lines.map(([k, v]) => `${k}: ${v}`).join("\n") + (footer ? `\n\n${footer}` : "");
  // Paragraphs rather than a table: email clients render them alike everywhere.
  const font = "font-family:sans-serif;font-size:14px;margin:0 0 12px";
  const html =
    lines
      .map(
        ([k, v]) =>
          `<p style="${font}"><span style="color:#666">${escapeHtml(k)}</span><br>` +
          `<span style="white-space:pre-wrap">${escapeHtml(String(v))}</span></p>`,
      )
      .join("") +
    (footer ? `<p style="font-family:sans-serif;font-size:12px;color:#666">${escapeHtml(footer)}</p>` : "");
  return { text, html };
}

/**
 * The default notification: subject `"<form title>: new response"` (or
 * `config.subject`), then the meta columns, each answered field by label,
 * the ending's title when the form has several, and the response id.
 */
export function renderEmail(input: EmailRenderInput): EmailContent {
  const { submission, definition, config, row } = input;
  const lines: [string, Cell][] = [];
  const fieldKeys = new Set(Object.keys(row.labels));
  for (const key of row.columns) {
    if (key === "id") continue;
    const value = row.row[key];
    if (value === undefined || value === "") continue;
    const label = fieldKeys.has(key) ? row.labels[key]! : key === "submitted_at" ? "Submitted" : key;
    lines.push([label, value]);
  }
  const endings = definition.endings ?? [];
  if (submission.ending && endings.length > 1) {
    const ending = endings.find((e) => e.id === submission.ending);
    if (ending) lines.push(["Ending", ending.title]);
  }
  if (!lines.length) lines.push(["Answers", "(none)"]);
  const subject = configString(config, "subject") || `${definition.title || definition.id}: new response`;
  return { subject, ...emailBody(lines, `Response ${submission.id}`) };
}

/** Recipients from config: a string or a list, each checked. Throws when there are none or too many. */
function recipients(config: DestinationConfig): string[] {
  const raw = config["to"];
  const list = (Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : []).map((t) =>
    typeof t === "string" ? t.trim() : t,
  );
  const to = [...new Set(list.filter(isSafeAddress))];
  if (to.length !== list.filter((t) => t !== "").length) {
    throw new DeliveryError("The email destination has an invalid recipient");
  }
  if (!to.length) throw new DeliveryError("The email destination has no recipients");
  if (to.length > MAX_RECIPIENTS) throw new DeliveryError(`The email destination has more than ${MAX_RECIPIENTS} recipients`);
  return to;
}

function replyToAddress(option: EmailDestinationOptions["replyTo"], input: EmailRenderInput): string | undefined {
  if (!option) return undefined;
  let value: unknown;
  if (typeof option === "function") value = option(input);
  else {
    const field = input.definition.blocks.find((b) => b.kind === "field" && b.key === option);
    value = field ? own(input.submission.answers, field.id) : undefined;
    // An anonymous form never gives away an identifying answer, not even as Reply-To.
    if (field?.kind === "field" && field.identifying && input.definition.settings?.anonymous) value = undefined;
  }
  const trimmed = typeof value === "string" ? value.trim() : value;
  return isSafeAddress(trimmed) ? trimmed : undefined;
}

/**
 * The idempotency key: the delivery id and the first 16 hex digits of
 * SHA-256 of the sorted recipients, so a retried delivery never sends twice
 * and one whose recipients changed meanwhile is a new send.
 */
export async function idempotencyKey(deliveryId: string, to: readonly string[]): Promise<string> {
  const hex = await sha256Hex([...to].sort().join(","));
  return `${deliveryId.slice(0, 200)}:${hex.slice(0, 16)}`;
}

export function emailDestination(options: EmailDestinationOptions): Destination {
  return {
    kind: "email",
    async deliver(submission, definition, config, deliveryOptions: DeliveryOptions = {}): Promise<DeliveryResult> {
      try {
        if (!isSafeFrom(options.from)) throw new DeliveryError("The email destination's from address is invalid");
        const to = recipients(config);
        const row = responseRow(submission, definition, { sensitive: options.sensitive ?? "mask" });
        const input: EmailRenderInput = { submission, definition, config, row };
        const content = (options.render ?? renderEmail)(input);
        const replyTo = replyToAddress(options.replyTo, input);
        await options.provider.send(
          {
            from: options.from,
            to,
            ...(replyTo ? { replyTo } : {}),
            subject: headerSafe(content.subject) || "New response",
            text: content.text,
            html: content.html,
            idempotencyKey: await idempotencyKey(deliveryOptions.deliveryId ?? submission.id, to),
          },
          { signal: deliveryOptions.signal },
        );
        return { ok: true };
      } catch (error) {
        return deliveryFailure(error);
      }
    },
  };
}

export const RESEND_API = "https://api.resend.com/emails";

export interface ResendOptions extends HttpDeps {
  apiKey: string;
  /** Default `RESEND_API`. */
  endpoint?: string | undefined;
}

/**
 * Resend's REST API. Sends the idempotency key, so a retry within Resend's
 * 24-hour window never sends twice. A 409 for a concurrent request with the
 * same key is retried; one for a key reused with a different body is not.
 */
export function resendProvider(options: ResendOptions): EmailProvider {
  return {
    name: "resend",
    async send(message, { signal }) {
      if (!options.apiKey) throw new DeliveryError("The Resend API key is not set");
      const response = await timedFetch(
        options,
        options.endpoint ?? RESEND_API,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
            "idempotency-key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from: message.from,
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          }),
        },
        signal,
      );
      if (response.ok) {
        discard(response);
        return;
      }
      // Resend's error `name` (such as "validation_error") is safe to keep; its message may echo input.
      let name: string | undefined;
      try {
        const body = (await response.json()) as { name?: unknown };
        if (typeof body.name === "string" && /^[a-z_]{1,64}$/.test(body.name)) name = body.name;
      } catch {
        // Not JSON.
      }
      if (response.status === 409 && name === "concurrent_idempotent_requests") {
        throw new DeliveryError("Resend answered 409 (concurrent_idempotent_requests)", {
          retryable: true,
          retryAfterSeconds: 5,
          status: 409,
        });
      }
      throw httpError("Resend", response, name);
    },
  };
}
