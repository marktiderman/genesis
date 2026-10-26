/**
 * @feat:chat
 * The chat client: the app's own Supabase (migrations 0001 and 0002, the genesis_chat
 * schema) under row level security. Reads are table selects; every write is a
 * genesis_chat function. Live updates are hints on private Realtime topics,
 * after which the client fetches again, so nothing is trusted from the wire.
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type {
  AttachmentInput,
  AvailabilityInput,
  ChatActivity,
  ChatAttachment,
  ChatAvailability,
  ChatLinkPreview,
  ChatSearchHit,
  ChatTopic,
  ScheduleInput,
  ScheduledMessage,
  TopicInput,
  WorkingHours,
  ChatConversation,
  ChatInboxItem,
  ChatKindRules,
  ChatMember,
  ChatMessage,
  ChatRole,
  ChatSignal,
  SendInput,
} from "./types";
import { fileExtension, isAllowedExtension, randomId } from "./media";

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
    moderation: r.moderation === "hidden" || r.moderation === "flagged" ? r.moderation : null,
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

export function toTopic(r: Row): ChatTopic {
  return {
    conversationId: String(r.conversation_id),
    topic: String(r.topic),
    title: String(r.title ?? r.topic),
    position: Number(r.position ?? 0),
    closedAt: str(r.closed_at),
    createdBy: str(r.created_by),
    createdAt: String(r.created_at),
  };
}

function fromAttachmentArg(a: Row): AttachmentInput {
  const out: AttachmentInput = { kind: String(a.kind ?? "file") };
  const map: [keyof AttachmentInput, string][] = [
    ["path", "path"], ["provider", "provider"], ["providerId", "provider_id"], ["url", "url"], ["ref", "ref"],
    ["status", "status"], ["name", "name"], ["mime", "mime"], ["bytes", "bytes"], ["width", "width"],
    ["height", "height"], ["durationMs", "duration_ms"], ["waveform", "waveform"], ["posterPath", "poster_path"], ["thumbhash", "thumbhash"],
  ];
  for (const [k, col] of map) if (a[col] != null) (out as unknown as Record<string, unknown>)[k] = a[col];
  return out;
}

export function toScheduled(r: Row): ScheduledMessage {
  const sentMessageId = str(r.sent_message_id);
  const cancelledAt = str(r.cancelled_at);
  const error = str(r.error);
  return {
    id: String(r.id),
    conversationId: String(r.conversation_id),
    clientId: String(r.client_id),
    body: String(r.body ?? ""),
    attachments: ((r.attachments as Row[] | null) ?? []).map(fromAttachmentArg),
    replyToId: str(r.reply_to_id),
    topic: str(r.topic),
    mentions: (r.mentions as string[] | null) ?? [],
    silent: Boolean(r.silent),
    sendAt: String(r.send_at),
    sentMessageId,
    cancelledAt,
    error,
    createdAt: String(r.created_at),
    status: sentMessageId ? "sent" : cancelledAt ? "cancelled" : error ? "failed" : "scheduled",
  };
}

export function toAvailability(r: Row): ChatAvailability {
  return {
    userId: String(r.user_id),
    awayMessage: str(r.away_message),
    awayUntil: str(r.away_until),
    timeZone: str(r.time_zone),
    hours: (r.hours as WorkingHours | null) ?? null,
  };
}

export function toSearchHit(r: Row): ChatSearchHit {
  return {
    messageId: String(r.message_id),
    conversationId: String(r.conversation_id),
    seq: Number(r.seq),
    senderId: str(r.sender_id),
    createdAt: String(r.created_at),
    snippet: String(r.snippet ?? ""),
    inTranscript: Boolean(r.in_transcript),
  };
}

export function toLinkPreview(r: Row): ChatLinkPreview {
  const image = str(r.image_url);
  return {
    url: String(r.url),
    status: (r.status as ChatLinkPreview["status"]) ?? "ok",
    title: str(r.title),
    description: str(r.description),
    imageUrl: image && /^https:\/\//i.test(image) ? image : null,
    siteName: str(r.site_name),
    fetchedAt: String(r.fetched_at),
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

export interface ConversationHandlers {
  onSignal: (s: ChatSignal) => void;
  onActivity?: (a: ChatActivity) => void;
  /** Every join, the first included: catch up on what arrived before the channel was live. */
  onJoin?: () => void;
  /** Re-joins only. Prefer `onJoin`. */
  onReconnect?: () => void;
}

export interface ConversationChannel extends Subscription {
  /** Tell the others you are typing or recording (throttle to once every 3 seconds). */
  signal(activity: ChatActivity["activity"]): void;
}

export function createChatClient(supabase: ChatSupabase, options: ChatClientOptions = {}) {
  const db = () => supabase.schema(CHAT_SCHEMA);
  const signedUrlSeconds = options.signedUrlSeconds ?? 3600;
  const signedCache = new Map<string, { url: string; until: number }>();

  /**
   * Private Realtime channels authorise with the signed-in user's token; set it before
   * joining (supabase-js doesn't for a channel joined before the session loads), or the
   * join is refused and no hint ever arrives. A refusal to set it still joins and retries.
   */
  const unsubscribed = new WeakSet<RealtimeChannel>();
  function join(channel: RealtimeChannel, onStatus?: (status: string) => void) {
    const realtime = (supabase as unknown as { realtime?: { setAuth?: (token?: string | null) => Promise<void> | void } }).realtime;
    void Promise.resolve(realtime?.setAuth?.())
      .catch(() => undefined)
      .then(() => {
        if (!unsubscribed.has(channel)) channel.subscribe(onStatus);
      });
    return () => {
      unsubscribed.add(channel);
      void supabase.removeChannel(channel);
    };
  }

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    return must<T>(fn, await db().rpc(fn, args));
  }

  return {
    supabase,

    /** Your conversations: one `kind`, several `kinds`, or all but `excludeKinds` (e.g. Messages without `support`). */
    async inbox(
      opts: { kind?: string; kinds?: string[]; excludeKinds?: string[]; archived?: boolean; limit?: number; before?: string } = {},
    ): Promise<ChatInboxItem[]> {
      const rows = await rpc<Row[]>("inbox", {
        p_kind: opts.kind ?? null,
        p_archived: opts.archived ?? false,
        p_limit: opts.limit ?? 50,
        p_before: opts.before ?? null,
        ...(opts.kinds?.length ? { p_kinds: opts.kinds } : {}),
        ...(opts.excludeKinds?.length ? { p_exclude_kinds: opts.excludeKinds } : {}),
      });
      return rows.map(toInboxItem);
    },

    async observed(kind: string, opts: { status?: string; limit?: number; before?: string } = {}) {
      return rpc<Row[]>("observed", { p_kind: kind, p_status: opts.status ?? null, p_limit: opts.limit ?? 50, p_before: opts.before ?? null });
    },

    /** Unread across your conversations (for a badge), leaving out `excludeKinds` to match an inbox that does. */
    async unreadTotal(opts: { excludeKinds?: string[] } = {}): Promise<number> {
      return rpc<number>("unread_total", opts.excludeKinds?.length ? { p_exclude_kinds: opts.excludeKinds } : {});
    },

    async conversation(id: string): Promise<ChatConversation | null> {
      const row = must("conversation", await db().from("conversations").select("*").eq("id", id).maybeSingle());
      return row ? toConversation(row as Row) : null;
    },

    /** A kind's rules (how many members, who posts, threads), for what the UI offers. */
    async kind(kind: string): Promise<ChatKindRules | null> {
      const row = must("kind", await db().from("kinds").select("kind, label, max_members, who_posts, membership, threads, observers_post").eq("kind", kind).maybeSingle()) as Row | null;
      return row
        ? {
            kind: String(row.kind),
            label: String(row.label),
            maxMembers: row.max_members == null ? null : Number(row.max_members),
            whoPosts: row.who_posts as ChatKindRules["whoPosts"],
            membership: row.membership as ChatKindRules["membership"],
            threads: Boolean(row.threads),
            observersPost: Boolean(row.observers_post),
          }
        : null;
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

    // ── Migration 0002 ──────────────────────────────────────────────────────

    /** A conversation's topics, in order (position, then key). */
    async topics(conversationId: string): Promise<ChatTopic[]> {
      const rows = must<Row[]>(
        "topics",
        await db().from("topics").select("*").eq("conversation_id", conversationId).order("position", { ascending: true }).order("topic", { ascending: true }),
      );
      return rows.map(toTopic);
    },

    /** Adds a topic, or renames, reorders, closes (`closed: true`) or reopens it. Owners and admins. */
    async setTopic(conversationId: string, topic: string, input: TopicInput = {}) {
      await rpc("set_topic", {
        p_conversation_id: conversationId,
        p_topic: topic,
        p_title: input.title ?? null,
        p_position: input.position ?? null,
        p_closed: input.closed ?? null,
      });
    },

    /** Schedules a message (a minute to a year ahead) and returns its id. Safe to retry with the same clientId. */
    async schedule(input: ScheduleInput): Promise<string> {
      const sendAt = typeof input.sendAt === "string" ? input.sendAt : input.sendAt.toISOString();
      return rpc<string>("schedule_message", {
        p_conversation_id: input.conversationId,
        p_client_id: input.clientId,
        p_send_at: sendAt,
        p_body: input.body ?? "",
        p_attachments: (input.attachments ?? []).map(attachmentArg),
        p_reply_to_id: input.replyToId ?? null,
        p_topic: input.topic ?? null,
        p_mentions: input.mentions ?? [],
        p_silent: input.silent ?? false,
      });
    },

    /** Your messages still waiting to go (and ones that failed when due), soonest first; in one conversation or all. */
    async scheduled(conversationId?: string): Promise<ScheduledMessage[]> {
      let q = db().from("scheduled").select("*").is("sent_message_id", null).is("cancelled_at", null);
      if (conversationId) q = q.eq("conversation_id", conversationId);
      const rows = must<Row[]>("scheduled", await q.order("send_at", { ascending: true }).limit(200));
      return rows.map(toScheduled);
    },

    async cancelScheduled(id: string) {
      await rpc("cancel_scheduled", { p_id: id });
    },

    /** The away message and hours of a conversation's members who set them (not observers). */
    async availabilityFor(conversationId: string): Promise<ChatAvailability[]> {
      const rows = await rpc<Row[]>("availability_for", { p_conversation_id: conversationId });
      return (rows ?? []).map(toAvailability);
    },

    /** Your own away message and hours, or null when never set. */
    async myAvailability(): Promise<ChatAvailability | null> {
      const row = must("myAvailability", await db().from("availability").select("*").maybeSingle()) as Row | null;
      return row ? toAvailability(row) : null;
    },

    /** Replaces your away message and hours (a field left out is cleared). */
    async setAvailability(input: AvailabilityInput) {
      const until = input.awayUntil ?? null;
      await rpc("set_availability", {
        p_away_message: input.awayMessage ?? null,
        p_away_until: until,
        p_time_zone: input.timeZone ?? null,
        p_hours: input.hours ?? null,
      });
    },

    /**
     * Sends one text message into each of these conversations where you may post (a coach to
     * each client's direct conversation), so replies come back privately. Text only. Safe to
     * retry with the same clientId. Returns the ids of the messages sent.
     */
    async broadcast(conversationIds: string[], clientId: string, body: string, opts: { silent?: boolean } = {}): Promise<string[]> {
      const ids = await rpc<string[] | null>("broadcast_message", {
        p_conversation_ids: conversationIds,
        p_client_id: clientId,
        p_body: body,
        p_attachments: [],
        p_silent: opts.silent ?? false,
      });
      return (ids ?? []).map(String);
    },

    /** Messages (and transcripts) you can read that match, newest first: in one conversation or all of yours. Two characters at least. */
    async search(query: string, conversationId?: string | null, opts: { limit?: number } = {}): Promise<ChatSearchHit[]> {
      if (query.trim().length < 2) return [];
      const rows = await rpc<Row[] | null>("search_messages", {
        p_query: query,
        p_conversation_id: conversationId ?? null,
        p_limit: opts.limit ?? 30,
      });
      return (rows ?? []).map(toSearchHit);
    },

    /**
     * The previews the server has fetched for the links in these messages, by message id (only
     * `ok` ones; links not fetched yet are left out). Read through link_previews_for, one call
     * per message (up to 6 at once), which answers only for messages you can read: the preview
     * table itself is closed, since a URL can carry a secret.
     */
    async linkPreviewsFor(messageIds: string[]): Promise<Record<string, ChatLinkPreview[]>> {
      const ids = [...new Set(messageIds.filter(Boolean))].slice(0, 200);
      const out: Record<string, ChatLinkPreview[]> = {};
      let next = 0;
      const worker = async () => {
        while (next < ids.length) {
          const id = ids[next++]!;
          const rows = await rpc<Row[] | null>("link_previews_for", { p_message_id: id });
          out[id] = (rows ?? []).map(toLinkPreview).filter((p) => p.status === "ok");
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, ids.length) }, worker));
      return out;
    },

    /**
     * Uploads a file into the conversation's folder for the signed-in person and
     * returns its path, ready to attach. Resumable for big files is the native
     * renderer's job (Supabase TUS); this is the plain upload.
     */
    async upload(conversationId: string, userId: string, file: Blob | ArrayBuffer, opts: { name: string; contentType: string; id?: string }) {
      const ext = fileExtension(opts.name, opts.contentType);
      if (!isAllowedExtension(ext)) throw new ChatError(`Files of type .${ext} can't be sent`, "22023", "upload");
      const id = opts.id ?? randomId();
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
        );
      return { unsubscribe: join(channel) };
    },

    /**
     * A conversation's live hints, plus who is typing or recording. `onJoin` runs every
     * time the channel joins, the first time included: the moment to fetch what arrived
     * before the subscription was live. `onReconnect` (kept for older callers) runs on
     * re-joins only.
     */
    subscribeConversation(
      conversationId: string,
      me: string,
      handlers: ConversationHandlers,
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
        });
      // Typing and recording are ephemeral: until the channel has joined, they're dropped
      // rather than sent (supabase-js would fall back to REST and warn).
      let joined = false;
      const leave = join(channel, (status) => {
        joined = status === "SUBSCRIBED";
        if (status === "SUBSCRIBED") {
          handlers.onJoin?.();
          if (joinedOnce) handlers.onReconnect?.();
          joinedOnce = true;
        }
      });
      return {
        signal(activity) {
          if (!joined) return;
          void channel.send({ type: "broadcast", event: "activity", payload: { userId: me, activity } });
        },
        unsubscribe: leave,
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
