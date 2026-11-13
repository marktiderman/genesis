import { previewText } from "./thread";

type InboxSourceRow = Record<string, unknown>;

export interface ConversationInboxOptions {
  /** Names a person (the app's people, as ChatThread's `resolveUser`): a direct conversation's title is the other member's name. */
  resolveUser?: (userId: string) => { name: string };
  /** The title of a conversation with no title and no other member to name. Default "Conversation". */
  fallbackTitle?: string;
}

/**
 * A list of conversations as a Genesis view's inbox (`<ResourceView type="inbox">`): a plain
 * block an app passes to `defineView` over its conversations (rows shaped like genesis_chat's
 * `inbox` function: `title`, `other_user_id`, `last_message`, `last_message_at`, `unread`), with the
 * open conversation as the reading pane:
 *
 * ```tsx
 * const conversationsView = defineView(conversationsContract, { inbox: conversationInbox({ resolveUser }), types: ["inbox"] });
 * <ResourceView view={conversationsView} inbox={{ renderReading: (c) => <ChatThread conversationId={String(c.conversation_id)} resolveUser={resolveUser} /> }} />
 * ```
 *
 * A direct conversation has no title of its own (genesis_chat returns null): it is named after the
 * other member through `resolveUser`. The preview is the latest message's text (or what it carries:
 * a photo, a file, a deleted message).
 *
 * genesis_chat's `inbox` function returns at most `p_limit` conversations (50 by default, 200 at
 * most) and pages by `p_before`, not by offset. As a provider source it isn't paged or counted
 * past that cap; for more, read the conversations through a view of the app's own.
 */
export function conversationInbox(options: ConversationInboxOptions = {}) {
  const fallback = options.fallbackTitle ?? "Conversation";
  return Object.freeze({
    title: (row: InboxSourceRow) => {
      const own = typeof row["title"] === "string" ? row["title"].trim() : "";
      if (own) return own;
      const other = typeof row["other_user_id"] === "string" ? row["other_user_id"] : undefined;
      return (other && options.resolveUser?.(other).name) || fallback;
    },
    preview: (row: InboxSourceRow) => {
      const last = row["last_message"];
      if (!last || typeof last !== "object") return undefined;
      const message = last as { body?: unknown; attachment?: unknown; deleted?: unknown };
      return previewText(typeof message.body === "string" ? message.body : "", typeof message.attachment === "string" ? message.attachment : null, message.deleted === true) || undefined;
    },
    time: "last_message_at",
    /** genesis_chat's inbox counts what you haven't read (to 99): a row is unread above 0. */
    unread: (row: InboxSourceRow) => Number(row["unread"] ?? 0) > 0,
  } as const);
}
