/**
 * Support's emails (the notifications of migration 0024, sent by genesis-notifications' runner):
 * genesis-notifications' default email (heading, body, Open button, unsubscribe link) with the
 * message itself as the body (the notification's `body`, its whole text up to 4,000 characters), a
 * subject a ticket's emails share so mail apps keep one thread, and, when replies by email are set up,
 * `REPLY_MARKER` at the top and a hint under the message. Everything from the marker down is what a
 * reply quotes, and `stripReply` drops it. Deterministic: a retried email sends the same bytes.
 *
 * Server only.
 *
 * @stability Beta
 */
import { defaultEmailTemplate, escapeHtml, type EmailTemplate } from "@marktiderman/genesis-notifications/server";
import { REPLY_MARKER } from "./email-reply";
import { SUPPORT_NOTIFICATION_TYPES } from "./notifications";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export interface SupportEmailTemplateOptions {
  /** Replies by email are set up (a reply domain and the inbound route): say so, and mark where the quote starts. */
  replies: boolean;
  /** The words, in English by default. */
  copy?: Partial<SupportEmailCopy>;
}

export interface SupportEmailCopy {
  /** The subject of the person's emails: `{title}`. */
  personSubject: string;
  /** The subject of the agents' emails: `{title}`. */
  staffSubject: string;
  /** No title. */
  untitled: string;
  personHint: string;
  staffHint: string;
}

const COPY: SupportEmailCopy = {
  personSubject: "Re: {title}",
  staffSubject: "[Support] {title}",
  untitled: "Your support conversation",
  personHint: "You can reply to this email: your answer goes straight into the conversation.",
  staffHint: "Reply to this email to answer here: the person sees your reply in the conversation.",
};

/** One template for support's emails. */
export function supportEmailTemplate(options: SupportEmailTemplateOptions): EmailTemplate {
  const copy = { ...COPY, ...options.copy };
  return async (ctx) => {
    const message = text(ctx.data["body"]) || text(ctx.data["excerpt"]) || text(ctx.text.body);
    const toStaff = ctx.type === "support.message";
    const hint = options.replies && ctx.type !== "support.verify" ? (toStaff ? copy.staffHint : copy.personHint) : null;
    const body = [message, hint].filter(Boolean).join("\n\n");
    const base = await defaultEmailTemplate({ ...ctx, text: { ...ctx.text, ...(body ? { body } : {}) } });
    const title = text(ctx.data["title"]) || copy.untitled;
    const marker = `${REPLY_MARKER} (from your email app).`;
    return {
      subject: (toStaff ? copy.staffSubject : copy.personSubject).replace("{title}", title),
      html: options.replies
        ? base.html.replace(/<body[^>]*>/, (tag) => `${tag}<p style="font-family:sans-serif;font-size:12px;text-align:center;margin:0 0 16px">${escapeHtml(marker)}</p>`)
        : base.html,
      text: options.replies ? `${marker}\n\n${base.text}` : base.text,
    };
  };
}

/** The runner's `templates` for support's three types. @stability Beta */
export function supportEmailTemplates(options: SupportEmailTemplateOptions): Record<string, EmailTemplate> {
  const template = supportEmailTemplate(options);
  return Object.fromEntries(SUPPORT_NOTIFICATION_TYPES.map((t) => [t, template]));
}
