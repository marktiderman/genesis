/**
 * Support threads on genesis-chat (the `support-chat` block, migration
 * `0001_genesis_support_chat.sql` in this package): what the support client
 * needs from a genesis-chat client, as a structural type, so genesis-support
 * never imports genesis-chat. Pass `createChatClient(supabase)` from
 * `@marktiderman/genesis-chat` as the support client's `chat` option.
 */

/** The block's FeatureId. */
export const SUPPORT_CHAT_BLOCK_ID = "support-chat" as const;

/** The genesis_chat kind a report's conversation is, and its subject type. */
export const SUPPORT_CHAT_KIND = "support";
export const SUPPORT_CHAT_SUBJECT = "support_report";

/** A file a chat message carries (a subset of genesis-chat's ChatAttachment). */
export interface SupportChatAttachment {
  id: string;
  kind: string;
  path: string | null;
  url: string | null;
  mime: string | null;
  name: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

/** A chat message (a subset of genesis-chat's ChatMessage). */
export interface SupportChatMessage {
  id: string;
  seq: number;
  senderId: string | null;
  senderRole: string;
  kind: string;
  body: string;
  visibility: "everyone" | "observers";
  createdAt: string;
  deletedAt: string | null;
  attachments: SupportChatAttachment[];
}

/** The part of genesis-chat's client (`createChatClient`) a support thread uses. */
export interface SupportChatClient {
  messages(conversationId: string, opts?: { limit?: number }): Promise<{ messages: SupportChatMessage[]; hasEarlier: boolean }>;
  send(input: { conversationId: string; clientId: string; body?: string; visibility?: "everyone" | "observers" }): Promise<SupportChatMessage>;
  markRead(conversationId: string, seq?: number): Promise<unknown>;
  fileUrls(paths: string[]): Promise<Record<string, string>>;
  subscribeConversation(
    conversationId: string,
    me: string,
    handlers: { onSignal: (signal: unknown) => void; onJoin?: () => void },
  ): { unsubscribe(): void };
}

/** Where a report's thread lives: a genesis-chat conversation, or support_replies (no support-chat block). */
export type SupportThreadInfo = { mode: "chat"; conversationId: string } | { mode: "replies"; conversationId: null };

/** A support report's status, as genesis-chat's conversation status (the migration's mapping). */
export const SUPPORT_TO_CHAT_STATUS = {
  open: "open",
  submitted: "open",
  in_progress: "pending",
  addressed: "solved",
  wont_fix: "closed",
} as const;

/** PostgREST's "no such function" (PGRST202) or Postgres's (42883): the block's migration isn't applied. */
export function isMissingFunction(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883";
}
