/**
 * What an email says, and the checks every one passes: subjects and names on
 * one line, addresses well formed, every value escaped in the default body.
 */
import type { RenderedText } from "../core/registry";
import type { NotificationBrand } from "../core/types";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface EmailTemplateContext {
  type: string;
  category: string;
  /** The notification's `data`. */
  data: Record<string, unknown>;
  /** What the registry's render says (title, body, url): a starting point. */
  text: RenderedText;
  recipient: { email: string; name: string | null };
  /** The caller's brand over the tenant's default. */
  brand: NotificationBrand;
  tenantId: string | null;
  transactional: boolean;
  /**
   * Put this where the secret link goes (`href={secretLink}`): the runner
   * swaps in the real link at send time, so the stored render never holds it.
   * Null when the type has none.
   */
  secretLink: string | null;
  /** The signed one-click unsubscribe link, for the footer. Null for transactional mail. */
  unsubscribeUrl: string | null;
  /** The app's absolute link for `text.url`, when `appUrl` is set. */
  url: string | null;
}

/** A type's email: React Email (`@marktiderman/genesis-notifications/email`), or any HTML. */
export type EmailTemplate = (context: EmailTemplateContext) => EmailContent | Promise<EmailContent>;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A header value on one line: control characters and line separators become spaces; cut to `max`. */
export function headerSafe(text: string, max = 200): string {
  // eslint-disable-next-line no-control-regex
  const flat = text.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** A bare address safe as a header value. */
export function isSafeAddress(value: unknown): value is string {
  // eslint-disable-next-line no-control-regex
  return typeof value === "string" && value.length <= 254 && /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/.test(value) && !/[\u0000-\u001f\u007f]/.test(value);
}

/** A display name with nothing that could break out of the From header (or need quoting): no quotes, brackets, ":", ";", "@", "," or "\\". */
export function displayName(name: string): string {
  return headerSafe(name.replace(/["<>()[\]:;@,\\]/g, ""), 100);
}

/** The default email when a type has no template: its title, body and a button, every value escaped. */
export const defaultEmailTemplate: EmailTemplate = (ctx) => {
  const title = ctx.text.title;
  const body = ctx.text.body ?? "";
  const link = ctx.secretLink ?? ctx.url;
  const accent = typeof ctx.brand.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(ctx.brand.color) ? ctx.brand.color : "#111827";
  const from = ctx.brand.name ? escapeHtml(ctx.brand.name) : "";
  const p = "font-family:sans-serif;font-size:15px;line-height:1.5;margin:0 0 16px;color:#111827";
  const html =
    `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb">` +
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">` +
    (from ? `<p style="${p};font-weight:600;color:${accent}">${from}</p>` : "") +
    `<p style="${p};font-size:18px;font-weight:600">${escapeHtml(title)}</p>` +
    (body ? `<p style="${p};white-space:pre-wrap">${escapeHtml(body)}</p>` : "") +
    (link ? `<p style="${p}"><a href="${escapeHtml(link)}" style="display:inline-block;background:${accent};color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">Open</a></p>` : "") +
    (ctx.unsubscribeUrl ? `<p style="${p};font-size:12px;color:#6b7280"><a href="${escapeHtml(ctx.unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a> from these emails.</p>` : "") +
    `</div></body></html>`;
  const text = [from, title, body, link ?? "", ctx.unsubscribeUrl ? `Unsubscribe: ${ctx.unsubscribeUrl}` : ""].filter(Boolean).join("\n\n");
  return { subject: title, html, text };
};

/** JSON with sorted keys: the same bytes however a database reordered them. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}
