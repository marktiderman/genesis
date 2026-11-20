/**
 * Support's default notification types (migration 0025 sends them): add them to the app's
 * `defineNotifications` (genesis-notifications) and sync, and support tells people with no code of
 * the app's own.
 *
 * ```ts
 * import { defineNotifications } from "@marktiderman/genesis-notifications";
 * import { supportNotificationTypes } from "@marktiderman/genesis-support";
 *
 * const support = supportNotificationTypes({ basePath: "/settings/support" });
 * export const notifications = defineNotifications({
 *   categories: { ...support.categories, messages: { label: "Messages" } },
 *   types: { ...support.types, "chat.message": { … } },
 * });
 * ```
 *
 * - `support.message`: someone wrote to support; the desk's agents (in the app, push and email).
 *   Its link opens the agent's ticket (`agentThread`), naming the desk (`?desk=`) when it isn't the
 *   app's own.
 * - `support.reply`: support answered; the person (in the app and by email, the email held a
 *   quarter of an hour and skipped once read). No push while threads run on genesis-chat
 *   (`chatPushes`, default true), which already pushes each reply.
 * - `support.verify`: the verify prompt; the person (in the app, push and email).
 *
 * Plain data and render functions, structurally genesis-notifications' `NotificationTypeDef`, so
 * this package doesn't depend on it.
 *
 * @stability Beta
 */
import { supportPaths } from "./block";
import { fill, resolveSupportCopy, type SupportCopyOverrides } from "./copy";

/** The channels a type offers, and whether each is on by default. */
type Channels = Partial<Record<"in_app" | "push" | "email", boolean>>;

/** One type, as genesis-notifications' `NotificationTypeDef` takes it. */
export interface SupportNotificationType {
  category: string;
  channels: Channels;
  emailDelaySeconds?: number;
  render: (data: Record<string, unknown>) => { title: string; body?: string; url?: string };
}

export interface SupportNotificationOptions {
  /** Where the support screens are (`createSupport`'s and the web routes' `basePath`). Default `/support`. */
  basePath?: string;
  /** The category id. Default `support`. */
  category?: string;
  /** Threads run on genesis-chat, which pushes each reply already: `support.reply` offers no push. Default true. */
  chatPushes?: boolean;
  /** How long `support.reply`'s email waits (skipped once read in the app). Default 900 (15 minutes). */
  replyEmailDelaySeconds?: number;
  /** A link of the app's own: the agent's ticket, or the person's. Default the block's paths. */
  agentUrl?: (ticketId: string, desk: string | null) => string;
  personUrl?: (ticketId: string) => string;
  copy?: SupportCopyOverrides;
}

/** The type keys migration 0025 sends. @stability Beta */
export const SUPPORT_NOTIFICATION_TYPES = ["support.message", "support.reply", "support.verify"] as const;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Support's category and its three types, to spread into `defineNotifications`. @stability Beta */
export function supportNotificationTypes(options: SupportNotificationOptions = {}) {
  const copy = resolveSupportCopy(options.copy).notifications;
  const paths = supportPaths(options.basePath);
  const category = options.category ?? "support";
  const agentUrl = options.agentUrl ?? ((id: string, desk: string | null) => (desk ? `${paths.agentThread(id)}?desk=${encodeURIComponent(desk)}` : paths.agentThread(id)));
  const personUrl = options.personUrl ?? ((id: string) => paths.thread(id));
  const ticketOf = (d: Record<string, unknown>) => text(d["ticket_id"]);
  const titleOf = (d: Record<string, unknown>) => text(d["title"]) || copy.support;
  const bodyOf = (d: Record<string, unknown>) => text(d["excerpt"]) || undefined;
  const withBody = (title: string, body: string | undefined, url: string) => ({ title, ...(body ? { body } : {}), url });
  const types: Record<(typeof SUPPORT_NOTIFICATION_TYPES)[number], SupportNotificationType> = {
    "support.message": {
      category,
      channels: { in_app: true, push: true, email: true },
      render: (d) => {
        const values = { by: text(d["by"]) || copy.someone, title: titleOf(d) };
        const template = d["escalated"] ? copy.escalated : d["returned"] ? copy.returned : d["moved"] ? copy.moved : d["new"] ? copy.newTicket : copy.message;
        return withBody(fill(template, values), bodyOf(d), agentUrl(ticketOf(d), text(d["desk"]) || null));
      },
    },
    "support.reply": {
      category,
      channels: { in_app: true, ...(options.chatPushes === false ? { push: true } : {}), email: true },
      emailDelaySeconds: options.replyEmailDelaySeconds ?? 900,
      render: (d) => withBody(fill(copy.reply, { from: text(d["from"]) || copy.support, title: titleOf(d) }), bodyOf(d), personUrl(ticketOf(d))),
    },
    "support.verify": {
      category,
      channels: { in_app: true, push: true, email: true },
      render: (d) => withBody(fill(copy.verify, { title: titleOf(d) }), copy.verifyBody, personUrl(ticketOf(d))),
    },
  };
  return {
    categories: { [category]: { label: copy.category, description: copy.categoryDescription } } as Record<string, { label: string; description: string }>,
    types,
  };
}
