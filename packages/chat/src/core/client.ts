/**
 * @feat:chat
 * The chat client: the app's own Supabase (migration 0001, the genesis_chat
 * schema) under row level security. Reads are table selects; every write is a
 * genesis_chat function. Live updates are hints on private Realtime topics,
 * after which the client fetches again, so nothing is trusted from the wire.
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type {
  AttachmentInput,
  ChatActivity,
  ChatAttachment,
  ChatConversation,
  ChatInboxItem,
  ChatMember,
  ChatMessage,
  ChatRole,
  ChatSignal,
  SendInput,
} from "./types";
import { fileExtension, isAllowedExtension } from "./media";

/** Any supabase-js client; the app's generated Database types don't need to list genesis_chat. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatSupabase = SupabaseClient<any, any, any>;

export const CHAT_SCHEMA = "genesis_chat";
export const CHAT_BUCKET = "genesis-chat";

export const conversationTopic = (conversationId: string) => `genesis-chat:conv:${conversationId}`;
export const userTopic = (userId: string) => `genesis-chat:user:${userId}`;

/** A refusal from the database, with its SQLSTATE (`42501` not allowed, `22023` bad input, `GS429` too many). */
export class ChatError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly operation: string,
  ) {
    super(message);
    this.name = "ChatError";
  }
  get forbidden(): boolean {
    return this.code === "42501";
  }
  get rateLimited(): boolean {
    return this.code === "GS429";
  }
  /** Worth trying again: the network, not the database, said no. */
  get transient(): boolean {
    return this.code === undefined || this.code === "" || /^(08|57|53)/.test(this.code) || this.code === "PGRST000";
  }
}

function must<T>(operation: string, result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new ChatError(result.error.message, result.error.code, operation);
  return result.data as T;
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => (v == null ? null : Number(v));

export function toAttachment(r: Row): ChatAttachment {
  return {
    id: String(r.id),
    messageId: String(r.message_id),
    position: Number(r.position ?? 0),
    kind: String(r.kind),
    ref: (r.ref as Record<string, unknown>) ?? {},
    provider: (r.provider as ChatAttachment["provider"]) ?? "storage",
    path: str(r.path),
    providerId: str(r.provider_id),
    playbackId: str(r.playback_id),
    url: str(r.url),
    status: (r.status as ChatAttachment["status"]) ?? "ready",
    name: str(r.name),
    mime: str(r.mime),
    bytes: num(r.bytes),
    width: num(r.width),
    height: num(r.height),
    durationMs: num(r.duration_ms),
    waveform: (r.waveform as number[] | null) ?? null,
    posterPath: str(r.poster_path),
    thumbhash: str(r.thumbhash),
    transcript: str(r.transcript),
    transcriptStatus: (r.transcript_status as ChatAttachment["transcriptStatus"]) ?? null,
  };
}

export function toMessage(r: Row): ChatMessage {
  const attachments = ((r.attachments as Row[] | undefined) ?? []).map(toAttachment).sort((a, b) => a.position - b.position);
  const reactions = ((r.reactions as Row[] | undefined) ?? []).map((x) => ({ emoji: String(x.emoji), userId: String(x.user_id) }));
  return {
    id: String(r.id),
    conversationId: String(r.conversation_id),
    seq: Number(r.seq),
    clientId: String(r.client_id),
    senderId: str(r.sender_id),
    senderRole: r.sender_role as ChatMessage["senderRole"],
    kind: (r.kind as ChatMessage["kind"]) ?? "text",
    body: String(r.body ?? ""),
    mentions: (r.mentions as string[]) ?? [],
    replyToId: str(r.reply_to_id),
    threadRootId: str(r.thread_root_id),
    threadCount: Number(r.thread_count ?? 0),
    threadLastAt: str(r.thread_last_at),
    topic: str(r.topic),
    visibility: (r.visibility as ChatMessage["visibility"]) ?? "everyone",
    silent: Boolean(r.silent),
    meta: (r.meta as Record<string, unknown>) ?? {},
    createdAt: String(r.created_at),
    editedAt: str(r.edited_at),
    deletedAt: str(r.deleted_at),
    attachments,
    reactions,
  };
}

function toConversation(r: Row): ChatConversation {
  return {
    id: String(r.id),
    kind: String(r.kind),
    title: str(r.title),
    subjectType: str(r.subject_type),
    subjectId: str(r.subject_id),
    settings: (r.settings as ChatConversation["settings"]) ?? {},
    status: (r.status as ChatConversation["status"]) ?? null,
    assigneeId: str(r.assignee_id),
    lastSeq: Number(r.last_seq ?? 0),
    lastMessageAt: str(r.last_message_at),
    createdAt: String(r.created_at),
    archivedAt: str(r.archived_at),
  };
}

function toInboxItem(r: Row): ChatInboxItem {
  const last = r.last_message as Row | null;
  return {
    conversationId: String(r.conversation_id),
    kind: String(r.kind),
    title: str(r.title),
    subjectType: str(r.subject_type),
    subjectId: str(r.subject_id),
    status: (r.status as ChatInboxItem["status"]) ?? null,
    role: r.role as ChatRole,
    otherUserId: str(r.other_user_id),
    memberCount: Number(r.member_count ?? 0),
    lastSeq: Number(r.last_seq ?? 0),
    lastReadSeq: Number(r.last_read_seq ?? 0),
    unread: Number(r.unread ?? 0),
    mentioned: Boolean(r.mentioned),
    muted: Boolean(r.muted),
    pinned: Boolean(r.pinned),
    archived: Boolean(r.archived),
    lastMessageAt: str(r.last_message_at),
    lastMessage: last
      ? {
          id: String(last.id),
          seq: Number(last.seq),
          senderId: str(last.sender_id),
          kind: (last.kind as "text" | "system") ?? "text",
          body: String(last.body ?? ""),
          deleted: Boolean(last.deleted),
          createdAt: String(last.created_at),
          attachment: (last.attachment as string | null) ?? null,
        }
      : null,
  };
}

const MESSAGE_COLUMNS = "*, attachments(*), reactions(emoji, user_id)";

export interface MessagePage {
  messages: ChatMessage[];
  /** More, older messages exist before the first one. */
  hasEarlier: boolean;
}

export interface ChatClientOptions {
  /** Signed file links live this long (seconds). Default an hour. */
  signedUrlSeconds?: number;
}

export interface Subscription {
  unsubscribe(): void;
}

export interface ConversationChannel extends Subscription {
  /** Tell the others you are typing or recording (throttle to once every 3 seconds). */
  signal(activity: ChatActivity["activity"]): void;
}

export function createChatClient(supabase: ChatSupabase, options: ChatClientOptions = {}) {
  const db = () => supabase.schema(CHAT_SCHEMA);
  const signedUrlSeconds = options.signedUrlSeconds ?? 3600;
  const signedCache = new Map<string, { url: string; until: number }>();

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    return must<T>(fn, await db().rpc(fn, args));
  }

  return {
    supabase,

    async inbox(opts: { kind?: string; archived?: boolean; limit?: number; before?: string } = {}): Promise<ChatInboxItem[]> {
      const rows = await rpc<Row[]>("inbox", {
        p_kind: opts.kind ?? null,
        p_archived: opts.archived ?? false,
        p_limit: opts.limit ?? 50,
        p_before: opts.before ?? null,
      });
      return rows.map(toInboxItem);
    },

    async observed(kind: string, opts: { status?: string; limit?: number; before?: string } = {}) {
      return rpc<Row[]>("observed", { p_kind: kind, p_status: opts.status ?? null, p_limit: opts.limit ?? 50, p_before: opts.before ?? null });
    },

    async unreadTotal(): Promise<number> {
      return rpc<number>("unread_total", {});
    },

    async conversation(id: string): Promise<ChatConversation | null> {
      const row = must("conversation", await db().from("conversations").select("*").eq("id", id).maybeSingle());
      return row ? toConversation(row as Row) : null;
    },

    async myRole(id: string): Promise<ChatRole | null> {
      return rpc<ChatRole | null>("my_role", { p_conversation_id: id });
    },

    async canPost(id: string): Promise<boolean> {
      return rpc<boolean>("can_post", { p_conversation_id: id });
    },

    async members(id: string): Promise<ChatMember[]> {
      const rows = must<Row[]>(
        "members",
        await db().from("members").select("*").eq("conversation_id", id).is("left_at", null).neq("role", "observer"),
      );
      return rows.map((r) => ({
        conversationId: String(r.conversation_id),
        userId: String(r.user_id),
        role: r.role as ChatRole,
        lastReadSeq: Number(r.last_read_seq ?? 0),
        joinedAt: String(r.joined_at),
      }));
    },

    /**
     * A page of messages, oldest first: the latest `limit` (default 50), or those
     * before `beforeSeq`, or (to catch up after a reconnect) those after `afterSeq`.
     * A thread's replies with `threadRootId`; one topic's with `topic`.
     */
    async messages(
      conversationId: string,
      opts: { beforeSeq?: number; afterSeq?: number; limit?: number; threadRootId?: string; topic?: string } = {},
    ): Promise<MessagePage> {
      const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
      let q = db().from("messages").select(MESSAGE_COLUMNS).eq("conversation_id", conversationId);
      q = opts.threadRootId ? q.eq("thread_root_id", opts.threadRootId) : q.is("thread_root_id", null);
      if (opts.topic) q = q.eq("topic", opts.topic);
      if (opts.afterSeq != null) {
        const rows = must<Row[]>("messages", await q.gt("seq", opts.afterSeq).order("seq", { ascending: true }).limit(limit));
        return { messages: rows.map(toMessage), hasEarlier: false };
      }
      if (opts.beforeSeq != null) q = q.lt("seq", opts.beforeSeq);
      const rows = must<Row[]>("messages", await q.order("seq", { ascending: false }).limit(limit + 1));
      const hasEarlier = rows.length > limit;
      return { messages: rows.slice(0, limit).map(toMessage).reverse(), hasEarlier };
    },

    async message(id: string): Promise<ChatMessage | null> {
      const row = must("message", await db().from("messages").select(MESSAGE_COLUMNS).eq("id", id).maybeSingle());
      return row ? toMessage(row as Row) : null;
    },

    async startConversation(kind: string, memberIds: string[], opts: { title?: string; subjectType?: string; subjectId?: string } = {}) {
      return rpc<string>("start_conversation", {
        p_kind: kind,
        p_member_ids: memberIds,
        p_title: opts.title ?? null,
        p_subject_type: opts.subjectType ?? null,
        p_subject_id: opts.subjectId ?? null,
      });
    },

    /** Sends a message. Safe to retry with the same clientId. */
    async send(input: SendInput): Promise<ChatMessage> {
      const row = await rpc<Row>("send_message", {
        p_conversation_id: input.conversationId,
        p_client_id: input.clientId,
        p_body: input.body ?? "",
        p_attachments: (input.attachments ?? []).map(attachmentArg),
        p_reply_to_id: input.replyToId ?? null,
        p_thread_root_id: input.threadRootId ?? null,
        p_topic: input.topic ?? null,
        p_mentions: input.mentions ?? [],
        p_visibility: input.visibility ?? "everyone",
        p_silent: input.silent ?? false,
      });
      // The function returns the message row; fetch it again for its attachments.
      return (await this.message(String(row.id))) ?? toMessage(row);
    },

    async edit(messageId: string, body: string, mentions: string[] = []) {
      return toMessage(await rpc<Row>("edit_message", { p_message_id: messageId, p_body: body, p_mentions: mentions }));
    },

    async remove(messageId: string) {
      await rpc("delete_message", { p_message_id: messageId });
    },

    async react(messageId: string, emoji: string, on = true) {
      await rpc("react", { p_message_id: messageId, p_emoji: emoji, p_on: on });
    },

    async markRead(conversationId: string, seq?: number) {
      return rpc<number>("mark_read", { p_conversation_id: conversationId, p_seq: seq ?? null });
    },

    async setMySettings(
      conversationId: string,
      s: { mutedUntil?: string | null; notify?: "all" | "mentions" | "none"; archived?: boolean; pinned?: boolean },
    ) {
      await rpc("set_my_settings", {
        p_conversation_id: conversationId,
        p_muted_until: s.mutedUntil ?? null,
        p_notify: s.notify ?? null,
        p_archived: s.archived ?? null,
        p_pinned: s.pinned ?? null,
        p_clear_mute: s.mutedUntil === null,
      });
    },

    async updateConversation(conversationId: string, s: { title?: string; settings?: Record<string, unknown> }) {
      await rpc("update_conversation", { p_conversation_id: conversationId, p_title: s.title ?? null, p_settings: s.settings ?? null });
    },

    async addMembers(conversationId: string, userIds: string[]) {
      await rpc("add_members", { p_conversation_id: conversationId, p_user_ids: userIds });
    },

    async removeMember(conversationId: string, userId?: string) {
      await rpc("remove_member", { p_conversation_id: conversationId, p_user_id: userId ?? null });
    },

    async setStatus(conversationId: string, status: ChatConversation["status"], assigneeId?: string | null) {
      await rpc("set_status", { p_conversation_id: conversationId, p_status: status, p_assignee_id: assigneeId ?? null });
    },

    async pin(messageId: string, on = true) {
      await rpc("pin_message", { p_message_id: messageId, p_on: on });
    },

    async pins(conversationId: string): Promise<string[]> {
      const rows = must<Row[]>("pins", await db().from("pins").select("message_id").eq("conversation_id", conversationId));
      return rows.map((r) => String(r.message_id));
    },

    async save(messageId: string, on = true, note?: string) {
      await rpc("save_message", { p_message_id: messageId, p_on: on, p_note: note ?? null });
    },

    async report(messageId: string, reason: "spam" | "harassment" | "safety" | "other", note?: string) {
      return rpc<string>("report_message", { p_message_id: messageId, p_reason: reason, p_note: note ?? null });
    },

    /**
     * Uploads a file into the conversation's folder for the signed-in person and
     * returns its path, ready to attach. Resumable for big files is the native
     * renderer's job (Supabase TUS); this is the plain upload.
     */
    async upload(conversationId: string, userId: string, file: Blob | ArrayBuffer, opts: { name: string; contentType: string; id?: string }) {
      const ext = fileExtension(opts.name, opts.contentType);
      if (!isAllowedExtension(ext)) throw new ChatError(`Files of type .${ext} can't be sent`, "22023", "upload");
      const id = opts.id ?? crypto.randomUUID();
      const path = `${conversationId}/${userId}/${id}.${ext}`;
      must("upload", await supabase.storage.from(CHAT_BUCKET).upload(path, file, { contentType: opts.contentType, upsert: false }));
      return path;
    },

    /** Signed links for files, cached until shortly before they expire. */
    async fileUrls(paths: string[]): Promise<Record<string, string>> {
      const now = Date.now();
      const out: Record<string, string> = {};
      const missing: string[] = [];
      for (const p of new Set(paths)) {
        const hit = signedCache.get(p);
        if (hit && hit.until > now) out[p] = hit.url;
        else missing.push(p);
      }
      if (missing.length) {
        const { data, error } = await supabase.storage.from(CHAT_BUCKET).createSignedUrls(missing, signedUrlSeconds);
        if (error) throw new ChatError(error.message, undefined, "fileUrls");
        for (const d of data ?? []) {
          if (d.signedUrl && d.path) {
            out[d.path] = d.signedUrl;
            signedCache.set(d.path, { url: d.signedUrl, until: now + (signedUrlSeconds - 60) * 1000 });
          }
        }
      }
      return out;
    },

    /** Your inbox's live hints (a new message anywhere you are, a membership change). */
    subscribeInbox(userId: string, onSignal: (s: ChatSignal) => void): Subscription {
      const channel = supabase
        .channel(userTopic(userId), { config: { private: true } })
        .on("broadcast", { event: "inbox" }, ({ payload }) =>
          onSignal({ type: "inbox", conversationId: String(payload?.conversation_id), seq: payload?.seq }),
        )
        .subscribe();
      return { unsubscribe: () => void supabase.removeChannel(channel) };
    },

    /**
     * A conversation's live hints, plus who is typing or recording. `onReconnect`
     * runs whenever the channel (re)joins, the moment to fetch what was missed.
     */
    subscribeConversation(
      conversationId: string,
      me: string,
      handlers: { onSignal: (s: ChatSignal) => void; onActivity?: (a: ChatActivity) => void; onReconnect?: () => void },
    ): ConversationChannel {
      let joinedOnce = false;
      const channel: RealtimeChannel = supabase
        .channel(conversationTopic(conversationId), { config: { private: true, broadcast: { self: false } } })
        .on("broadcast", { event: "message" }, ({ payload }) =>
          handlers.onSignal({ type: "message", conversationId, id: String(payload?.id), seq: payload?.seq, op: payload?.op ?? "insert" }),
        )
        .on("broadcast", { event: "reaction" }, ({ payload }) =>
          handlers.onSignal({ type: "reaction", conversationId, messageId: String(payload?.message_id) }),
        )
        .on("broadcast", { event: "members" }, () => handlers.onSignal({ type: "members", conversationId }))
        .on("broadcast", { event: "conversation" }, () => handlers.onSignal({ type: "conversation", conversationId }))
        .on("broadcast", { event: "activity" }, ({ payload }) => {
          if (payload?.userId && payload.userId !== me) handlers.onActivity?.({ userId: payload.userId, activity: payload.activity, at: Date.now() });
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (joinedOnce) handlers.onReconnect?.();
            joinedOnce = true;
          }
        });
      return {
        signal(activity) {
          void channel.send({ type: "broadcast", event: "activity", payload: { userId: me, activity } });
        },
        unsubscribe: () => void supabase.removeChannel(channel),
      };
    },
  };
}

export type ChatClient = ReturnType<typeof createChatClient>;

function attachmentArg(a: AttachmentInput) {
  return {
    kind: a.kind,
    path: a.path,
    provider: a.provider,
    provider_id: a.providerId,
    url: a.url,
    ref: a.ref,
    status: a.status,
    name: a.name,
    mime: a.mime,
    bytes: a.bytes,
    width: a.width,
    height: a.height,
    duration_ms: a.durationMs,
    waveform: a.waveform,
    poster_path: a.posterPath,
    thumbhash: a.thumbhash,
  };
}
