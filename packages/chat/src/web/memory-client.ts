/**
 * @feat:chat
 * A chat client held in memory, for demos, stories and tests: the same shape
 * as `createChatClient`, with no Supabase behind it. It also plays the other
 * side (`receive`, `activity`) so a demo looks alive.
 */
import { ChatError, type ChatClient, type ChatSupabase, type ConversationChannel, type ConversationHandlers, type MessagePage } from "../core/client";
import { extractLinks } from "../core/extras";
import type {
  AvailabilityInput,
  ChatActivity,
  ChatAvailability,
  ChatLinkPreview,
  ChatSearchHit,
  ChatTopic,
  ScheduleInput,
  ScheduledMessage,
  TopicInput,
  ChatAttachment,
  ChatConversation,
  ChatInboxItem,
  ChatMember,
  ChatMessage,
  ChatRole,
  ChatSignal,
  SendInput,
} from "../core/types";

export interface MemoryConversationSeed {
  id: string;
  kind?: string;
  title?: string | null;
  settings?: ChatConversation["settings"];
  members: { userId: string; role?: ChatRole; lastReadSeq?: number }[];
  /** Your role when you aren't a member (an observer). */
  myRole?: ChatRole | null;
  canPost?: boolean;
  muted?: boolean;
  pinned?: boolean;
  messages?: (Partial<Omit<ChatMessage, "attachments">> & { attachments?: Partial<ChatAttachment>[] })[];
  pins?: string[];
  /** Its topics, in order. */
  topics?: { topic: string; title?: string; closed?: boolean }[];
}

export interface MemoryChatOptions {
  /** The signed-in user. */
  me: string;
  conversations: MemoryConversationSeed[];
  /** Signed URLs for attachment paths. */
  files?: Record<string, string>;
  /** Milliseconds each call waits, to show loading states. Default 0. */
  latencyMs?: number;
  /** Away messages and working hours, by user id. */
  availability?: Record<string, Partial<Omit<ChatAvailability, "userId">>>;
  /** Link previews the "server" has fetched. */
  linkPreviews?: Partial<ChatLinkPreview>[];
}

interface Conv {
  conversation: ChatConversation;
  members: ChatMember[];
  myRole: ChatRole | null;
  canPost: boolean;
  muted: boolean;
  pinned: boolean;
  messages: ChatMessage[];
  pins: string[];
  topics: ChatTopic[];
}

export type MemoryChatClient = ChatClient & {
  /** Someone else posts (a demo's other side). */
  receive(conversationId: string, senderId: string, body: string, extra?: Partial<ChatMessage>): ChatMessage;
  /** Someone else starts typing or recording. */
  activity(conversationId: string, userId: string, activity: ChatActivity["activity"]): void;
  /** The next `count` sends fail as if the connection dropped. */
  failNextSends(count?: number): void;
  /** The next send waits until the returned function is called (a test watching the sending state). */
  holdNextSend(): () => void;
  /** Posts every scheduled message due by `now` (a demo's clock), as the server's runner does. */
  sendDue(now?: Date): Promise<number>;
  /** Moderation's verdict on a message (the server's side). */
  moderate(messageId: string, result: "clean" | "flagged" | "hidden"): void;
  /** Every call made, for tests. */
  calls: { method: string; args: unknown[] }[];
};

let counter = 0;
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

function attachment(messageId: string, a: Partial<ChatAttachment>, i: number): ChatAttachment {
  return {
    id: a.id ?? uuid(),
    messageId,
    position: a.position ?? i,
    kind: a.kind ?? "file",
    ref: a.ref ?? {},
    provider: a.provider ?? "storage",
    path: a.path ?? null,
    providerId: a.providerId ?? null,
    playbackId: a.playbackId ?? null,
    url: a.url ?? null,
    status: a.status ?? "ready",
    name: a.name ?? null,
    mime: a.mime ?? null,
    bytes: a.bytes ?? null,
    width: a.width ?? null,
    height: a.height ?? null,
    durationMs: a.durationMs ?? null,
    waveform: a.waveform ?? null,
    posterPath: a.posterPath ?? null,
    thumbhash: a.thumbhash ?? null,
    transcript: a.transcript ?? null,
    transcriptStatus: a.transcriptStatus ?? null,
  };
}

export function createMemoryChatClient(options: MemoryChatOptions): MemoryChatClient {
  const { me } = options;
  const files: Record<string, string> = { ...(options.files ?? {}) };
  const convs = new Map<string, Conv>();
  const convListeners = new Map<string, Set<{ onSignal: (s: ChatSignal) => void; onActivity?: (a: ChatActivity) => void }>>();
  const inboxListeners = new Set<(s: ChatSignal) => void>();
  const calls: { method: string; args: unknown[] }[] = [];
  let failing = 0;
  let held: Promise<void> | null = null;
  const wait = () => new Promise<void>((r) => setTimeout(r, options.latencyMs ?? 0));

  const makeMessage = (c: Conv, m: Partial<Omit<ChatMessage, "attachments">> & { attachments?: Partial<ChatAttachment>[] }): ChatMessage => {
    const id = m.id ?? uuid();
    const seq = ++c.conversation.lastSeq;
    const createdAt = m.createdAt ?? new Date().toISOString();
    c.conversation.lastMessageAt = createdAt;
    return {
      id,
      conversationId: c.conversation.id,
      seq,
      clientId: m.clientId ?? id,
      senderId: m.senderId ?? null,
      senderRole: m.senderRole ?? (m.kind === "system" ? "system" : "member"),
      kind: m.kind ?? "text",
      body: m.body ?? "",
      mentions: m.mentions ?? [],
      replyToId: m.replyToId ?? null,
      threadRootId: m.threadRootId ?? null,
      threadCount: m.threadCount ?? 0,
      threadLastAt: m.threadLastAt ?? null,
      topic: m.topic ?? null,
      visibility: m.visibility ?? "everyone",
      silent: m.silent ?? false,
      meta: m.meta ?? {},
      createdAt,
      editedAt: m.editedAt ?? null,
      deletedAt: m.deletedAt ?? null,
      moderation: m.moderation ?? null,
      attachments: (m.attachments ?? []).map((a, i) => attachment(id, a, i)),
      reactions: m.reactions ?? [],
    };
  };

  for (const seed of options.conversations) {
    const c: Conv = {
      conversation: {
        id: seed.id,
        kind: seed.kind ?? (seed.members.length === 2 ? "direct" : "group"),
        title: seed.title ?? null,
        subjectType: null,
        subjectId: null,
        settings: seed.settings ?? {},
        status: null,
        assigneeId: null,
        lastSeq: 0,
        lastMessageAt: null,
        createdAt: new Date().toISOString(),
        archivedAt: null,
      },
      members: seed.members.map((m) => ({
        conversationId: seed.id,
        userId: m.userId,
        role: m.role ?? "member",
        lastReadSeq: m.lastReadSeq ?? 0,
        joinedAt: new Date().toISOString(),
      })),
      myRole: seed.myRole !== undefined ? seed.myRole : (seed.members.find((m) => m.userId === me)?.role ?? "member"),
      canPost: seed.canPost ?? true,
      muted: seed.muted ?? false,
      pinned: seed.pinned ?? false,
      messages: [],
      pins: seed.pins ?? [],
      topics: (seed.topics ?? []).map((t, i) => ({
        conversationId: seed.id,
        topic: t.topic,
        title: t.title ?? t.topic,
        position: i,
        closedAt: t.closed ? new Date().toISOString() : null,
        createdBy: null,
        createdAt: new Date().toISOString(),
      })),
    };
    for (const m of seed.messages ?? []) c.messages.push(makeMessage(c, m));
    convs.set(seed.id, c);
  }

  const get = (id: string) => {
    const c = convs.get(id);
    if (!c) throw new ChatError("Conversation not found", "42501", "conversation");
    return c;
  };
  const findMessage = (id: string) => {
    for (const c of convs.values()) {
      const m = c.messages.find((x) => x.id === id);
      if (m) return { c, m };
    }
    throw new ChatError("Message not found", "42501", "message");
  };
  const visible = (c: Conv, m: ChatMessage) =>
    (m.visibility !== "observers" || c.myRole === "observer") && (m.moderation !== "hidden" || m.senderId === me || c.myRole === "observer");
  const scheduledList: ScheduledMessage[] = [];
  const availability = new Map<string, ChatAvailability>(
    Object.entries(options.availability ?? {}).map(([userId, a]) => [
      userId,
      { userId, awayMessage: a.awayMessage ?? null, awayUntil: a.awayUntil ?? null, timeZone: a.timeZone ?? null, hours: a.hours ?? null },
    ]),
  );
  const previews = new Map<string, ChatLinkPreview>(
    (options.linkPreviews ?? []).filter((p) => p.url).map((p) => [
      p.url!,
      { url: p.url!, status: p.status ?? "ok", title: p.title ?? null, description: p.description ?? null, imageUrl: p.imageUrl ?? null, siteName: p.siteName ?? null, fetchedAt: p.fetchedAt ?? new Date().toISOString() },
    ]),
  );
  const clone = (m: ChatMessage): ChatMessage => ({ ...m, attachments: m.attachments.map((a) => ({ ...a })), reactions: [...m.reactions] });
  const emit = (conversationId: string, s: ChatSignal) => {
    for (const l of convListeners.get(conversationId) ?? []) l.onSignal(s);
    for (const l of inboxListeners) l({ type: "inbox", conversationId });
  };
  const log = (method: string, ...args: unknown[]) => calls.push({ method, args });

  function inboxItem(c: Conv): ChatInboxItem {
    const mine = c.members.find((m) => m.userId === me);
    const lastRead = mine?.lastReadSeq ?? 0;
    const seen = c.messages.filter((m) => visible(c, m));
    const last = seen[seen.length - 1];
    const others = c.members.filter((m) => m.userId !== me);
    const unreadList = seen.filter((m) => m.seq > lastRead && m.senderId !== me && !m.deletedAt);
    return {
      conversationId: c.conversation.id,
      kind: c.conversation.kind,
      title: c.conversation.title,
      subjectType: null,
      subjectId: null,
      status: null,
      role: c.myRole ?? "member",
      otherUserId: c.members.length === 2 && others.length === 1 ? others[0]!.userId : null,
      memberCount: c.members.length,
      lastSeq: c.conversation.lastSeq,
      lastReadSeq: lastRead,
      unread: Math.min(99, unreadList.length),
      mentioned: unreadList.some((m) => m.mentions.includes(me)),
      muted: c.muted,
      pinned: c.pinned,
      archived: false,
      lastMessageAt: c.conversation.lastMessageAt,
      lastMessage: last
        ? {
            id: last.id,
            seq: last.seq,
            senderId: last.senderId,
            kind: last.kind,
            body: last.body,
            deleted: Boolean(last.deletedAt),
            createdAt: last.createdAt,
            attachment: last.attachments[0]?.kind ?? null,
          }
        : null,
    };
  }

  const client: MemoryChatClient = {
    supabase: null as unknown as ChatSupabase,
    calls,

    async inbox(opts: { kind?: string; archived?: boolean; limit?: number; before?: string } = {}) {
      log("inbox", opts);
      await wait();
      if (opts.archived) return [];
      return [...convs.values()]
        .filter((c) => !opts.kind || c.conversation.kind === opts.kind)
        .map(inboxItem)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
    },
    async observed() {
      return [];
    },
    async unreadTotal() {
      return [...convs.values()].reduce((n, c) => n + inboxItem(c).unread, 0);
    },
    async conversation(id: string) {
      await wait();
      return convs.has(id) ? { ...get(id).conversation } : null;
    },
    async kind(kind: string) {
      return { kind, label: kind, maxMembers: kind === "direct" ? 2 : null, whoPosts: "members" as const, membership: "admins" as const, threads: true, observersPost: false };
    },

    async myRole(id: string) {
      return convs.get(id)?.myRole ?? null;
    },
    async canPost(id: string) {
      return convs.get(id)?.canPost ?? false;
    },
    async members(id: string) {
      return get(id).members.map((m) => ({ ...m }));
    },
    async messages(id: string, opts: { beforeSeq?: number; afterSeq?: number; limit?: number; threadRootId?: string; topic?: string } = {}): Promise<MessagePage> {
      log("messages", id, opts);
      await wait();
      const c = get(id);
      const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
      let list = c.messages.filter((m) => visible(c, m) && (opts.threadRootId ? m.threadRootId === opts.threadRootId : m.threadRootId === null));
      if (opts.topic) list = list.filter((m) => m.topic === opts.topic);
      if (opts.afterSeq != null) return { messages: list.filter((m) => m.seq > opts.afterSeq!).slice(0, limit).map(clone), hasEarlier: false };
      if (opts.beforeSeq != null) list = list.filter((m) => m.seq < opts.beforeSeq!);
      const page = list.slice(-limit);
      return { messages: page.map(clone), hasEarlier: list.length > page.length };
    },
    async message(id: string) {
      try {
        const { c, m } = findMessage(id);
        return visible(c, m) ? clone(m) : null;
      } catch {
        return null;
      }
    },
    async startConversation(kind: string, memberIds: string[], opts: { title?: string } = {}) {
      const id = uuid();
      convs.set(id, {
        conversation: {
          id,
          kind,
          title: opts.title ?? null,
          subjectType: null,
          subjectId: null,
          settings: {},
          status: null,
          assigneeId: null,
          lastSeq: 0,
          lastMessageAt: null,
          createdAt: new Date().toISOString(),
          archivedAt: null,
        },
        members: [me, ...memberIds.filter((m) => m !== me)].map((userId) => ({ conversationId: id, userId, role: userId === me ? "owner" : "member", lastReadSeq: 0, joinedAt: new Date().toISOString() })),
        myRole: "owner",
        canPost: true,
        muted: false,
        pinned: false,
        messages: [],
        pins: [],
        topics: [],
      });
      for (const l of inboxListeners) l({ type: "inbox", conversationId: id });
      return id;
    },
    async send(input: SendInput) {
      log("send", input);
      await wait();
      if (held) {
        const hold = held;
        held = null;
        await hold;
      }
      if (failing > 0) {
        failing -= 1;
        throw new ChatError("Failed to fetch", undefined, "send_message");
      }
      const c = get(input.conversationId);
      if (!c.canPost) throw new ChatError("You can't post here", "42501", "send_message");
      const topic = input.topic ? c.topics.find((t) => t.topic === input.topic) : undefined;
      if (topic?.closedAt && !["owner", "admin", "observer"].includes(c.myRole ?? "member")) {
        throw new ChatError("This topic is closed", "42501", "send_message");
      }
      const existing = c.messages.find((m) => m.clientId === input.clientId);
      if (existing) return clone(existing);
      const m = makeMessage(c, {
        clientId: input.clientId,
        senderId: me,
        senderRole: c.myRole ?? "member",
        body: input.body ?? "",
        mentions: input.mentions ?? [],
        replyToId: input.replyToId ?? null,
        threadRootId: input.threadRootId ?? null,
        topic: input.topic ?? null,
        visibility: input.visibility ?? "everyone",
        silent: input.silent ?? false,
        attachments: (input.attachments ?? []).map((a) => ({ ...a, durationMs: a.durationMs ?? null, transcriptStatus: a.kind === "voice" ? "pending" : null })) as Partial<ChatAttachment>[],
      });
      c.messages.push(m);
      const mine = c.members.find((x) => x.userId === me);
      if (mine) mine.lastReadSeq = m.seq;
      emit(c.conversation.id, { type: "message", conversationId: c.conversation.id, id: m.id, seq: m.seq, op: "insert" });
      return clone(m);
    },
    async edit(messageId: string, body: string, mentions: string[] = []) {
      log("edit", messageId, body);
      const { c, m } = findMessage(messageId);
      if (m.senderId !== me) throw new ChatError("You can't edit this message", "42501", "edit_message");
      Object.assign(m, { body, mentions, editedAt: new Date().toISOString() });
      emit(c.conversation.id, { type: "message", conversationId: c.conversation.id, id: m.id, op: "update" });
      return clone(m);
    },
    async remove(messageId: string) {
      log("remove", messageId);
      const { c, m } = findMessage(messageId);
      Object.assign(m, { body: "", attachments: [], reactions: [], deletedAt: new Date().toISOString() });
      emit(c.conversation.id, { type: "message", conversationId: c.conversation.id, id: m.id, op: "update" });
    },
    async react(messageId: string, emoji: string, on = true) {
      log("react", messageId, emoji, on);
      const { c, m } = findMessage(messageId);
      m.reactions = m.reactions.filter((r) => !(r.emoji === emoji && r.userId === me));
      if (on) m.reactions.push({ emoji, userId: me });
      emit(c.conversation.id, { type: "reaction", conversationId: c.conversation.id, messageId });
    },
    async markRead(conversationId: string, seq?: number) {
      const c = get(conversationId);
      const mine = c.members.find((x) => x.userId === me);
      if (mine) mine.lastReadSeq = Math.max(mine.lastReadSeq, seq ?? c.conversation.lastSeq);
      return mine?.lastReadSeq ?? 0;
    },
    async setMySettings(conversationId: string, s: { mutedUntil?: string | null; archived?: boolean; pinned?: boolean }) {
      const c = get(conversationId);
      if (s.mutedUntil !== undefined) c.muted = s.mutedUntil !== null;
      if (s.pinned !== undefined) c.pinned = s.pinned;
    },
    async updateConversation(conversationId: string, s: { title?: string; settings?: Record<string, unknown> }) {
      const c = get(conversationId);
      if (s.title !== undefined) c.conversation.title = s.title;
      if (s.settings) c.conversation.settings = { ...c.conversation.settings, ...s.settings };
    },
    async addMembers(conversationId: string, userIds: string[]) {
      const c = get(conversationId);
      for (const userId of userIds) if (!c.members.some((m) => m.userId === userId)) c.members.push({ conversationId, userId, role: "member", lastReadSeq: 0, joinedAt: new Date().toISOString() });
    },
    async removeMember(conversationId: string, userId?: string) {
      const c = get(conversationId);
      c.members = c.members.filter((m) => m.userId !== (userId ?? me));
    },
    async setStatus(conversationId: string, status: ChatConversation["status"], assigneeId?: string | null) {
      const c = get(conversationId);
      c.conversation.status = status;
      c.conversation.assigneeId = assigneeId ?? null;
    },
    async pin(messageId: string, on = true) {
      log("pin", messageId, on);
      const { c } = findMessage(messageId);
      c.pins = c.pins.filter((p) => p !== messageId);
      if (on) c.pins.push(messageId);
      emit(c.conversation.id, { type: "conversation", conversationId: c.conversation.id });
    },
    async pins(conversationId: string) {
      return [...(convs.get(conversationId)?.pins ?? [])];
    },
    async save(messageId: string, on = true, note?: string) {
      log("save", messageId, on, note);
    },
    async report(messageId: string, reason: "spam" | "harassment" | "safety" | "other", note?: string) {
      log("report", messageId, reason, note);
      return uuid();
    },
    async upload(conversationId: string, userId: string, file: Blob | ArrayBuffer, opts: { name: string; contentType: string; id?: string }) {
      log("upload", conversationId, opts.name);
      await wait();
      const path = `${conversationId}/${userId}/${opts.id ?? uuid()}-${opts.name}`;
      const blob = file instanceof Blob ? file : new Blob([file], { type: opts.contentType });
      files[path] = typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : `memory://${path}`;
      return path;
    },
    async fileUrls(paths: string[]) {
      const out: Record<string, string> = {};
      for (const p of paths) if (files[p]) out[p] = files[p]!;
      return out;
    },
    subscribeInbox(_userId: string, onSignal: (s: ChatSignal) => void) {
      inboxListeners.add(onSignal);
      return { unsubscribe: () => void inboxListeners.delete(onSignal) };
    },
    subscribeConversation(conversationId: string, _me: string, handlers: ConversationHandlers): ConversationChannel {
      const set = convListeners.get(conversationId) ?? new Set();
      convListeners.set(conversationId, set);
      const entry = { onSignal: handlers.onSignal, onActivity: handlers.onActivity };
      set.add(entry);
      // Joins at once, as a live channel does once it is subscribed.
      setTimeout(() => {
        if (set.has(entry)) handlers.onJoin?.();
      }, 0);
      return {
        signal(activity) {
          log("signal", conversationId, activity);
        },
        unsubscribe: () => void set.delete(entry),
      };
    },

    // ── 0002 ──
    async topics(conversationId: string) {
      log("topics", conversationId);
      await wait();
      return [...(convs.get(conversationId)?.topics ?? [])].sort((a, b) => a.position - b.position || a.topic.localeCompare(b.topic)).map((t) => ({ ...t }));
    },
    async setTopic(conversationId: string, topic: string, input: TopicInput = {}) {
      log("setTopic", conversationId, topic, input);
      const c = get(conversationId);
      if (c.myRole !== "owner" && c.myRole !== "admin") throw new ChatError("Only an owner or admin manages topics", "42501", "set_topic");
      const key = topic.trim();
      let t = c.topics.find((x) => x.topic === key);
      if (!t) {
        t = { conversationId, topic: key, title: input.title?.trim() || key, position: input.position ?? c.topics.length, closedAt: null, createdBy: me, createdAt: new Date().toISOString() };
        c.topics.push(t);
      } else {
        if (input.title?.trim()) t.title = input.title.trim();
        if (input.position != null) t.position = input.position;
      }
      if (input.closed === true) t.closedAt ??= new Date().toISOString();
      if (input.closed === false) t.closedAt = null;
      emit(conversationId, { type: "conversation", conversationId });
    },
    async schedule(input: ScheduleInput) {
      log("schedule", input);
      await wait();
      const c = get(input.conversationId);
      if (!c.canPost) throw new ChatError("You can't post in this conversation", "42501", "schedule_message");
      const sendAt = typeof input.sendAt === "string" ? input.sendAt : input.sendAt.toISOString();
      const t = Date.parse(sendAt);
      if (!(t >= Date.now() + 60_000 && t <= Date.now() + 365 * 86_400_000)) throw new ChatError("Schedule between a minute and a year from now", "22023", "schedule_message");
      if (!(input.body ?? "").trim() && !(input.attachments ?? []).length) throw new ChatError("A message needs text or an attachment", "22023", "schedule_message");
      const existing = scheduledList.find((s) => s.clientId === input.clientId);
      if (existing) {
        existing.sendAt = sendAt;
        return existing.id;
      }
      const s: ScheduledMessage = {
        id: uuid(),
        conversationId: input.conversationId,
        clientId: input.clientId,
        body: input.body ?? "",
        attachments: input.attachments ?? [],
        replyToId: input.replyToId ?? null,
        topic: input.topic ?? null,
        mentions: input.mentions ?? [],
        silent: input.silent ?? false,
        sendAt,
        sentMessageId: null,
        cancelledAt: null,
        error: null,
        createdAt: new Date().toISOString(),
        status: "scheduled",
      };
      scheduledList.push(s);
      return s.id;
    },
    async scheduled(conversationId?: string) {
      log("scheduled", conversationId);
      await wait();
      return scheduledList
        .filter((s) => (s.status === "scheduled" || s.status === "failed") && (!conversationId || s.conversationId === conversationId))
        .sort((a, b) => a.sendAt.localeCompare(b.sendAt))
        .map((s) => ({ ...s }));
    },
    async cancelScheduled(id: string) {
      log("cancelScheduled", id);
      const s = scheduledList.find((x) => x.id === id && x.status === "scheduled");
      if (!s) throw new ChatError("Nothing to cancel", "22023", "cancel_scheduled");
      s.cancelledAt = new Date().toISOString();
      s.status = "cancelled";
    },
    async availabilityFor(conversationId: string) {
      log("availabilityFor", conversationId);
      const c = get(conversationId);
      return c.members.filter((m) => m.role !== "observer" && availability.has(m.userId)).map((m) => ({ ...availability.get(m.userId)! }));
    },
    async myAvailability() {
      const a = availability.get(me);
      return a ? { ...a } : null;
    },
    async setAvailability(input: AvailabilityInput) {
      log("setAvailability", input);
      availability.set(me, {
        userId: me,
        awayMessage: input.awayMessage?.trim() || null,
        awayUntil: input.awayUntil ?? null,
        timeZone: input.timeZone ?? null,
        hours: input.hours ?? null,
      });
    },
    async broadcast(conversationIds: string[], clientId: string, body: string, opts: { silent?: boolean } = {}) {
      log("broadcast", conversationIds, clientId, body);
      await wait();
      const ids: string[] = [];
      for (const id of new Set(conversationIds)) {
        const c = convs.get(id);
        if (!c?.canPost) continue;
        const m = await client.send({ conversationId: id, clientId: `${clientId}:${id}`, body, silent: opts.silent });
        ids.push(m.id);
      }
      return ids;
    },
    async search(query: string, conversationId?: string | null) {
      log("search", query, conversationId);
      await wait();
      const q = query.trim().toLowerCase();
      if (q.length < 2) return [];
      const hits: ChatSearchHit[] = [];
      // As search_messages does: the text's own « and » become ‹ and ›, so only real matches are marked.
      const mark = (raw: string) => {
        const text = raw.replace(/«/g, "‹").replace(/»/g, "›");
        const i = text.toLowerCase().indexOf(q);
        const start = Math.max(0, i - 40);
        return `${start > 0 ? "…" : ""}${text.slice(start, i)}«${text.slice(i, i + q.length)}»${text.slice(i + q.length, i + q.length + 60)}`;
      };
      for (const c of convs.values()) {
        if (conversationId && c.conversation.id !== conversationId) continue;
        for (const m of c.messages) {
          if (m.deletedAt || !visible(c, m)) continue;
          const base = { messageId: m.id, conversationId: c.conversation.id, seq: m.seq, senderId: m.senderId, createdAt: m.createdAt };
          if (m.body.toLowerCase().includes(q)) hits.push({ ...base, snippet: mark(m.body), inTranscript: false });
          else {
            const t = m.attachments.find((a) => a.transcript?.toLowerCase().includes(q))?.transcript;
            if (t) hits.push({ ...base, snippet: mark(t), inTranscript: true });
          }
        }
      }
      return hits.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30);
    },
    async linkPreviewsFor(messageIds: string[]) {
      log("linkPreviewsFor", messageIds);
      const out: Record<string, ChatLinkPreview[]> = {};
      for (const id of new Set(messageIds)) {
        let found: { c: Conv; m: ChatMessage } | null = null;
        try {
          found = findMessage(id);
        } catch {
          found = null;
        }
        // Only for a message you can read, as link_previews_for answers.
        if (!found || found.m.deletedAt || !visible(found.c, found.m)) {
          out[id] = [];
          continue;
        }
        out[id] = extractLinks(found.m.body)
          .map((u) => previews.get(u))
          .filter((p): p is ChatLinkPreview => Boolean(p && p.status === "ok"))
          .map((p) => ({ ...p }));
      }
      return out;
    },
    async sendDue(now = new Date()) {
      let n = 0;
      for (const s of scheduledList) {
        if (s.status !== "scheduled" || Date.parse(s.sendAt) > now.getTime()) continue;
        try {
          const m = await client.send({ conversationId: s.conversationId, clientId: s.clientId, body: s.body, attachments: s.attachments, replyToId: s.replyToId, topic: s.topic, mentions: s.mentions, silent: s.silent });
          s.sentMessageId = m.id;
          s.status = "sent";
          n += 1;
        } catch (e) {
          s.error = e instanceof Error ? e.message : String(e);
          s.status = "failed";
        }
      }
      return n;
    },
    moderate(messageId: string, result: "clean" | "flagged" | "hidden") {
      if (result === "clean") return;
      const { c, m } = findMessage(messageId);
      m.moderation = result;
      emit(c.conversation.id, { type: "message", conversationId: c.conversation.id, id: m.id, seq: m.seq, op: "update" });
    },

    receive(conversationId: string, senderId: string, body: string, extra: Partial<ChatMessage> = {}) {
      const c = get(conversationId);
      const m = makeMessage(c, { senderId, body, ...extra } as Partial<ChatMessage>);
      c.messages.push(m);
      emit(conversationId, { type: "message", conversationId, id: m.id, seq: m.seq, op: "insert" });
      return clone(m);
    },
    activity(conversationId: string, userId: string, activity: ChatActivity["activity"]) {
      for (const l of convListeners.get(conversationId) ?? []) l.onActivity?.({ userId, activity, at: Date.now() });
    },
    failNextSends(count = 1) {
      failing = count;
    },
    holdNextSend() {
      let release!: () => void;
      held = new Promise<void>((r) => (release = r));
      return () => release();
    },
  };
  return client;
}
