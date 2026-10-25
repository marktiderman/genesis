/**
 * @feat:chat
 * React hooks for chat, the same on web and native: the inbox, one
 * conversation (its messages, members, your role, who is typing) kept live by
 * Realtime hints, sending through the outbox, and message actions. Server
 * state is TanStack Query's; the renderers in /web and /native only draw.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChatClient, ConversationChannel, MessagePage } from "../core/client";
import { createOutbox, type LocalFile, type Outbox, type OutboxStore, type QueuedMessage } from "../core/outbox";
import { currentActivity, firstUnreadId, mergeThread, throttle, upsertMessages, type ThreadItem } from "../core/thread";
import { randomId } from "../core/media";
import type {
  AvailabilityInput,
  ChatActivity,
  ChatAttachment,
  ChatAvailability,
  ChatLinkPreview,
  ChatMessage,
  ChatSearchHit,
  ChatSignal,
  ChatTopic,
  ScheduleInput,
  ScheduledMessage,
  SendInput,
  TopicInput,
} from "../core/types";

export const chatKeys = {
  all: ["genesis-chat"] as const,
  inbox: (opts?: object) => ["genesis-chat", "inbox", opts ?? {}] as const,
  unread: () => ["genesis-chat", "unread"] as const,
  conversation: (id: string) => ["genesis-chat", "conversation", id] as const,
  members: (id: string) => ["genesis-chat", "members", id] as const,
  role: (id: string) => ["genesis-chat", "role", id] as const,
  pins: (id: string) => ["genesis-chat", "pins", id] as const,
  files: (paths: string[]) => ["genesis-chat", "files", [...paths].sort()] as const,
  /** Under the conversation's key, so its `conversation` hint (set_topic broadcasts one) refreshes them. */
  topics: (id: string) => ["genesis-chat", "conversation", id, "topics"] as const,
  scheduled: (conversationId?: string | null) => ["genesis-chat", "scheduled", conversationId ?? null] as const,
  availability: (conversationId: string) => ["genesis-chat", "conversation", conversationId, "availability"] as const,
  myAvailability: () => ["genesis-chat", "my-availability"] as const,
  search: (query: string, conversationId?: string | null) => ["genesis-chat", "search", conversationId ?? null, query] as const,
  previews: (urls: string[]) => ["genesis-chat", "previews", [...urls].sort()] as const,
};

/** What a messages list holds in the query cache: the page, and whether older messages exist. */
export type MessagesData = MessagePage;

function isMessagesData(v: unknown): v is MessagesData {
  return typeof v === "object" && v !== null && Array.isArray((v as MessagesData).messages) && "hasEarlier" in v;
}

/** Adds or replaces messages in a cached list, keeping `hasEarlier`. */
function upsertInto(prev: unknown, incoming: ChatMessage[]): MessagesData | undefined {
  return isMessagesData(prev) ? { ...prev, messages: upsertMessages(prev.messages, incoming) } : undefined;
}

/** Does a messages list (`[genesis-chat, conversation, id, messages, threadRootId, topic]`) hold this message? */
export function belongsTo(key: readonly unknown[], m: ChatMessage): boolean {
  return (
    key[0] === "genesis-chat" &&
    key[1] === "conversation" &&
    key[2] === m.conversationId &&
    key[3] === "messages" &&
    (key[4] ?? null) === (m.threadRootId ?? null) &&
    (key[5] == null || key[5] === m.topic)
  );
}

/**
 * Hosted video uploads (Mux direct uploads): your server makes an upload and returns its URL;
 * the renderer PUTs the recording there and sends `{ kind: "video", provider: "mux", providerId,
 * status: "pending" }`. Without it, videos go to storage as files.
 */
export interface ChatVideoUpload {
  create(conversationId: string): Promise<{ url: string; providerId: string; provider: "mux" }>;
}

/** What an app attachment kind's card shows (a form, a check-in): plain data, drawn by each renderer. */
export interface ChatAttachmentKind {
  title(attachment: ChatAttachment): string;
  subtitle?(attachment: ChatAttachment): string | null | undefined;
  /** The card's button: a link (`href`) or a handler (`onPress`). */
  action?(attachment: ChatAttachment): { label: string; href?: string; onPress?: () => void } | null | undefined;
}

interface ChatContextValue {
  client: ChatClient;
  userId: string;
  outbox: Outbox;
  queue: QueuedMessage[];
  loadPeople?: (userIds: string[]) => Promise<Record<string, ChatPerson>>;
  videoUpload?: ChatVideoUpload;
  attachmentKinds?: Record<string, ChatAttachmentKind>;
  /** Retries every failed message (call it when the connection comes back: AppState, NetInfo). */
  retryAll(): Promise<void>;
  /** Forgets every unsent message, here and in the outbox store (call it on sign-out). */
  clearOutbox(): Promise<void>;
  /** Subscribe to inbox hints (one channel for the app, fanned out here). */
  onInbox(listener: (s: ChatSignal) => void): () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export interface ChatProviderProps {
  client: ChatClient;
  /** The signed-in user's id (auth.users). */
  userId: string;
  /** Where unsent messages wait between launches (localStorage, MMKV…). Memory by default. */
  outboxStore?: OutboxStore;
  /** Reads a native file URI for upload. */
  readFile?: (uri: string) => Promise<Blob | ArrayBuffer>;
  /** Replaces the plain upload (resumable uploads on native). */
  upload?: (conversationId: string, file: LocalFile) => Promise<string>;
  /** Makes client ids (default: a random UUID that works without crypto.randomUUID). */
  newId?: () => string;
  /** Keeps a byte file (a pasted image, a recording) across launches: write it, return a URI. */
  persistFile?: (file: LocalFile) => Promise<string>;
  /** Names and avatars for user ids, fetched in batches (usePeople, usePerson). */
  loadPeople?: (userIds: string[]) => Promise<Record<string, ChatPerson>>;
  /** Hosted video uploads (Mux); videos go to storage without it. */
  videoUpload?: ChatVideoUpload;
  /** Cards for your own attachment kinds (`{ form: { title, subtitle, action } }`). */
  attachmentKinds?: Record<string, ChatAttachmentKind>;
  children: ReactNode;
}

/** How the app shows a person. */
export interface ChatPerson {
  name: string;
  avatarUrl?: string | null;
}

/** Puts chat in reach of every hook below it. Needs a TanStack QueryClientProvider above it. */
export function ChatProvider({
  client,
  userId,
  outboxStore,
  readFile,
  upload,
  newId,
  persistFile,
  loadPeople,
  videoUpload,
  attachmentKinds,
  children,
}: ChatProviderProps) {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const listeners = useRef(new Set<(s: ChatSignal) => void>());

  const outbox = useMemo(
    () =>
      createOutbox({
        client,
        userId,
        store: outboxStore,
        readFile,
        upload,
        newId,
        persistFile,
        onChange: setQueue,
        onSent: (message) => {
          // Into every loaded list it belongs to (the main timeline, its thread, its topic), so
          // the bubble never disappears between the send landing and the live hint.
          queryClient.setQueriesData<MessagesData>(
            { predicate: (q) => belongsTo(q.queryKey, message) },
            (prev) => upsertInto(prev, [message]) ?? prev,
          );
          void queryClient.invalidateQueries({ queryKey: ["genesis-chat", "scheduled"] });
          void queryClient.invalidateQueries({ queryKey: ["genesis-chat", "inbox"] });
        },
      }),
    // A new person or client is a new outbox.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, userId],
  );

  useEffect(() => {
    // What a relaunch left unsent is retried once (messages waiting for a lost file stay put),
    // and again whenever the browser comes back online.
    void outbox.load().then(() => outbox.retryAll()).catch(() => undefined);
    const online = () => void outbox.retryAll().catch(() => undefined);
    const target = typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null;
    target?.addEventListener("online", online);
    const sub = client.subscribeInbox(userId, (signal) => {
      void queryClient.invalidateQueries({ queryKey: ["genesis-chat", "inbox"] });
      void queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
      for (const l of listeners.current) l(signal);
    });
    return () => {
      sub.unsubscribe();
      target?.removeEventListener("online", online);
    };
  }, [client, userId, outbox, queryClient]);

  const value = useMemo<ChatContextValue>(
    () => ({
      client,
      userId,
      outbox,
      queue,
      loadPeople,
      videoUpload,
      attachmentKinds,
      retryAll: () => outbox.retryAll(),
      clearOutbox: () => outbox.clear(),
      onInbox: (l) => {
        listeners.current.add(l);
        return () => listeners.current.delete(l);
      },
    }),
    [client, userId, outbox, queue, loadPeople, videoUpload, attachmentKinds],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("Chat hooks need a <ChatProvider> above them.");
  return ctx;
}

/** Your conversations, live. `kind` narrows to one kind; `archived` shows the archived ones. */
export function useInbox(opts: { kind?: string; archived?: boolean; limit?: number } = {}) {
  const { client } = useChat();
  const query = useQuery({ queryKey: chatKeys.inbox(opts), queryFn: () => client.inbox(opts), staleTime: 15_000 });
  return { items: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/** How many messages wait for you everywhere (for a badge), live. */
export function useUnreadTotal(): number {
  const { client } = useChat();
  return useQuery({ queryKey: chatKeys.unread(), queryFn: () => client.unreadTotal(), staleTime: 15_000 }).data ?? 0;
}

export interface UseConversationOptions {
  /** Mark messages read as they arrive while this is true (the thread is on screen). Default true. */
  markRead?: boolean;
  /** One thread's replies instead of the main timeline. */
  threadRootId?: string;
  /** One topic's messages. */
  topic?: string;
  pageSize?: number;
}

/** One conversation: its messages (with what you are still sending), members, your role, and who is typing. */
export function useConversation(conversationId: string | null | undefined, opts: UseConversationOptions = {}) {
  const { client, userId, outbox, queue } = useChat();
  const queryClient = useQueryClient();
  const id = conversationId ?? "";
  const enabled = Boolean(conversationId);
  const pageSize = opts.pageSize ?? 50;
  const messagesKey = useMemo(
    () => [...chatKeys.conversation(id), "messages", opts.threadRootId ?? null, opts.topic ?? null] as const,
    [id, opts.threadRootId, opts.topic],
  );

  const conversation = useQuery({ queryKey: chatKeys.conversation(id), queryFn: () => client.conversation(id), enabled });
  const members = useQuery({ queryKey: chatKeys.members(id), queryFn: () => client.members(id), enabled, staleTime: 60_000 });
  const kindRules = useQuery({
    queryKey: ["genesis-chat", "kind", conversation.data?.kind ?? ""],
    queryFn: () => client.kind(conversation.data!.kind),
    enabled: Boolean(conversation.data?.kind),
    staleTime: 10 * 60_000,
  });
  const access = useQuery({
    queryKey: chatKeys.role(id),
    queryFn: async () => ({ role: await client.myRole(id), canPost: await client.canPost(id) }),
    enabled,
    staleTime: 60_000,
  });

  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const fetchPage = useCallback(
    () => client.messages(id, { limit: pageSize, threadRootId: opts.threadRootId, topic: opts.topic }),
    [client, id, pageSize, opts.threadRootId, opts.topic],
  );
  // Kept fresh by live hints and the catch-up on every join, so never refetched on its own.
  const messages = useQuery<MessagesData>({ queryKey: messagesKey, queryFn: fetchPage, enabled, staleTime: Infinity });
  const hasEarlier = messages.data?.hasEarlier ?? false;
  // Where "New" goes: what you had read when the conversation opened.
  const [readWhenOpened, setReadWhenOpened] = useState<number | null>(null);

  const merge = useCallback(
    (incoming: ChatMessage[], hasEarlierNow?: boolean) =>
      queryClient.setQueryData<MessagesData>(messagesKey, (prev) => {
        const base = prev ?? { messages: [], hasEarlier: false };
        return { messages: upsertMessages(base.messages, incoming), hasEarlier: hasEarlierNow ?? base.hasEarlier };
      }),
    [queryClient, messagesKey],
  );

  /**
   * Fetches what came after the newest message held (everything, for an empty list). Runs on
   * every join of the live channel, the first included, so messages that arrived while the
   * thread was closed, or between the first fetch and the subscription, always show.
   */
  const catchUp = useCallback(async () => {
    const current = queryClient.getQueryData<MessagesData>(messagesKey) ?? (await queryClient.ensureQueryData<MessagesData>({ queryKey: messagesKey, queryFn: fetchPage }));
    const list = current.messages;
    const after = list.length ? list[list.length - 1]!.seq : 0;
    const page = await client.messages(id, { afterSeq: after, limit: 200, threadRootId: opts.threadRootId, topic: opts.topic });
    if (page.messages.length) merge(page.messages);
  }, [client, fetchPage, id, merge, messagesKey, opts.threadRootId, opts.topic, queryClient]);

  const [activity, setActivity] = useState<ChatActivity[]>([]);
  const channel = useRef<ConversationChannel | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const fetchOne = async (messageId: string) => {
      const m = await client.message(messageId);
      if (!m) return;
      const belongs = opts.threadRootId ? m.threadRootId === opts.threadRootId : m.threadRootId === null;
      if (belongs && (!opts.topic || m.topic === opts.topic)) merge([m]);
      if (m.threadRootId && !opts.threadRootId) {
        const root = await client.message(m.threadRootId);
        if (root) merge([root]);
      }
    };
    channel.current = client.subscribeConversation(id, userId, {
      onSignal: (s) => {
        if (s.type === "message") void fetchOne(s.id);
        else if (s.type === "reaction") void fetchOne(s.messageId);
        else if (s.type === "members") {
          void queryClient.invalidateQueries({ queryKey: chatKeys.members(id) });
          void queryClient.invalidateQueries({ queryKey: chatKeys.role(id) });
        } else if (s.type === "conversation") {
          // The conversation row, its topics and availability (not its messages, kept by hints).
          void queryClient.invalidateQueries({ queryKey: chatKeys.conversation(id), exact: true });
          void queryClient.invalidateQueries({ queryKey: chatKeys.topics(id) });
          void queryClient.invalidateQueries({ queryKey: chatKeys.pins(id) });
        }
      },
      onActivity: (a) => setActivity((prev) => currentActivity([...prev, a])),
      onJoin: () => void catchUp().catch(() => undefined),
    });
    return () => {
      channel.current?.unsubscribe();
      channel.current = null;
    };
  }, [client, enabled, id, userId, merge, catchUp, queryClient, opts.threadRootId, opts.topic]);

  // Activity fades after a few seconds without news.
  useEffect(() => {
    if (activity.length === 0) return;
    const t = setTimeout(() => setActivity((prev) => currentActivity(prev)), 2000);
    return () => clearTimeout(t);
  }, [activity]);

  const list = useMemo(() => messages.data?.messages ?? [], [messages.data]);
  const latestSeq = list.length ? list[list.length - 1]!.seq : 0;
  const myLastRead = members.data?.find((m) => m.userId === userId)?.lastReadSeq;
  useEffect(() => {
    if (readWhenOpened === null && myLastRead !== undefined) setReadWhenOpened(myLastRead);
  }, [myLastRead, readWhenOpened]);

  const markRead = useCallback(async () => {
    if (!enabled || latestSeq === 0) return;
    await client.markRead(id, latestSeq);
    void queryClient.invalidateQueries({ queryKey: ["genesis-chat", "inbox"] });
    void queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
  }, [client, enabled, id, latestSeq, queryClient]);

  const shouldMark = opts.markRead !== false;
  useEffect(() => {
    if (shouldMark && latestSeq > 0 && !opts.threadRootId) void markRead().catch(() => undefined);
  }, [shouldMark, latestSeq, markRead, opts.threadRootId]);

  const loadEarlier = useCallback(async () => {
    const first = list[0];
    if (!first || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const page = await client.messages(id, { beforeSeq: first.seq, limit: pageSize, threadRootId: opts.threadRootId, topic: opts.topic });
      merge(page.messages, page.hasEarlier);
    } finally {
      setLoadingEarlier(false);
    }
  }, [client, id, list, loadingEarlier, merge, opts.threadRootId, opts.topic, pageSize]);

  /** Loads earlier messages until the one with this seq is held (a search result, a pinned message). True when it is. */
  const loadUntil = useCallback(
    async (seq: number) => {
      let current = queryClient.getQueryData<MessagesData>(messagesKey);
      for (let guard = 0; guard < 20 && current; guard++) {
        const first = current.messages[0];
        if (!first || first.seq <= seq || !current.hasEarlier) break;
        const page = await client.messages(id, {
          beforeSeq: first.seq,
          limit: Math.min(200, first.seq - seq + 10),
          threadRootId: opts.threadRootId,
          topic: opts.topic,
        });
        merge(page.messages, page.hasEarlier);
        current = queryClient.getQueryData<MessagesData>(messagesKey);
      }
      return Boolean(current?.messages.some((m) => m.seq === seq));
    },
    [client, id, merge, messagesKey, opts.threadRootId, opts.topic, queryClient],
  );

  const pending = useMemo(
    () =>
      queue.filter(
        (q) =>
          q.input.conversationId === id &&
          (q.input.threadRootId ?? null) === (opts.threadRootId ?? null) &&
          (!opts.topic || q.input.topic === opts.topic),
      ).map((q) => ({ ...q, files: q.pendingFiles })),
    [queue, id, opts.threadRootId, opts.topic],
  );
  const items: ThreadItem[] = useMemo(() => mergeThread(list, pending), [list, pending]);

  const signalTyping = useMemo(() => throttle(() => channel.current?.signal("typing")), []);
  const signalRecording = useMemo(
    () => throttle(() => channel.current?.signal("recording-voice")),
    [],
  );

  /** Sends text and files to this conversation (through the outbox: shown at once, retried safely). */
  const send = useCallback(
    (input: Omit<SendInput, "conversationId" | "clientId">, files: LocalFile[] = []) =>
      outbox.send({ ...input, conversationId: id, threadRootId: input.threadRootId ?? opts.threadRootId, topic: input.topic ?? opts.topic }, files),
    [outbox, id, opts.threadRootId, opts.topic],
  );

  return {
    conversation: conversation.data ?? null,
    members: members.data ?? [],
    role: access.data?.role ?? null,
    canPost: access.data?.canPost ?? false,
    /** Your role and posting rights are still loading: show the composer as waiting, not refused. */
    accessLoading: enabled && access.isLoading,
    /** Your role couldn't be loaded (offline): offer `refetchAccess`, don't say "can't post". */
    accessError: access.error ?? null,
    refetchAccess: access.refetch,
    /** The kind's rules (max members, threads, who posts). */
    kind: kindRules.data ?? null,
    /** May you pin here: owners and admins, or anyone in a two-person conversation. */
    canPin:
      access.data?.role === "owner" ||
      access.data?.role === "admin" ||
      (access.data?.role === "member" && kindRules.data?.maxMembers === 2),
    /** Gives a message whose files were lost on a relaunch its files again. */
    reattach: outbox.reattach,
    items,
    messages: list,
    isLoading: messages.isLoading || conversation.isLoading,
    error: messages.error ?? conversation.error,
    hasEarlier,
    loadingEarlier,
    loadEarlier,
    loadUntil,
    /** Where to draw the "New" line, from what you had read when it opened. */
    firstUnreadId: readWhenOpened === null ? null : firstUnreadId(list, readWhenOpened, userId),
    activity: currentActivity(activity),
    signalTyping,
    signalRecording,
    markRead,
    send,
    retry: outbox.retry,
    discard: outbox.discard,
    refetch: catchUp,
  };
}

export type ConversationState = ReturnType<typeof useConversation>;

/** Edit, delete, react, pin, save and report, refreshing what they change. */
export function useMessageActions() {
  const { client } = useChat();
  const queryClient = useQueryClient();
  return useMemo(() => {
    const refresh = async (conversationId: string, messageId: string) => {
      const m = await client.message(messageId);
      queryClient.setQueriesData<MessagesData>({ queryKey: chatKeys.conversation(conversationId) }, (prev) =>
        m ? (upsertInto(prev, [m]) ?? prev) : prev,
      );
    };
    return {
      edit: async (m: ChatMessage, body: string, mentions: string[] = []) => {
        await client.edit(m.id, body, mentions);
        await refresh(m.conversationId, m.id);
      },
      remove: async (m: ChatMessage) => {
        await client.remove(m.id);
        await refresh(m.conversationId, m.id);
      },
      react: async (m: ChatMessage, emoji: string, on: boolean) => {
        await client.react(m.id, emoji, on);
        await refresh(m.conversationId, m.id);
      },
      pin: async (m: ChatMessage, on: boolean) => {
        await client.pin(m.id, on);
        void queryClient.invalidateQueries({ queryKey: chatKeys.pins(m.conversationId) });
      },
      save: (m: ChatMessage, on: boolean, note?: string) => client.save(m.id, on, note),
      report: (m: ChatMessage, reason: "spam" | "harassment" | "safety" | "other", note?: string) => client.report(m.id, reason, note),
    };
  }, [client, queryClient]);
}

/**
 * Names and avatars for these people, from the provider's `loadPeople`, fetched as one
 * batch per set of ids and cached. Unknown ids are left out.
 */
export function usePeople(userIds: (string | null | undefined)[]): Record<string, ChatPerson> {
  const { loadPeople } = useChat();
  const ids = useMemo(() => [...new Set(userIds.filter((x): x is string => Boolean(x)))].sort(), [userIds]);
  return (
    useQuery({
      queryKey: ["genesis-chat", "people", ids],
      queryFn: () => loadPeople!(ids),
      enabled: Boolean(loadPeople) && ids.length > 0,
      staleTime: 5 * 60_000,
    }).data ?? {}
  );
}

/** One person's name and avatar (see usePeople). */
export function usePerson(userId: string | null | undefined): ChatPerson | null {
  const people = usePeople(useMemo(() => [userId], [userId]));
  return userId ? (people[userId] ?? null) : null;
}

/** The pinned message ids of a conversation. */
export function usePins(conversationId: string | null | undefined): string[] {
  const { client } = useChat();
  return (
    useQuery({ queryKey: chatKeys.pins(conversationId ?? ""), queryFn: () => client.pins(conversationId!), enabled: Boolean(conversationId) }).data ?? []
  );
}

/** Signed links for files (cached by the client until shortly before they expire). */
export function useFileUrls(paths: (string | null | undefined)[]): Record<string, string> {
  const { client } = useChat();
  const list = useMemo(() => [...new Set(paths.filter((p): p is string => Boolean(p)))], [paths]);
  return (
    useQuery({ queryKey: chatKeys.files(list), queryFn: () => client.fileUrls(list), enabled: list.length > 0, staleTime: 50 * 60_000 }).data ?? {}
  );
}

/** Starts (or finds again) a conversation, then refreshes the inbox. */
export function useStartConversation() {
  const { client } = useChat();
  const queryClient = useQueryClient();
  return useCallback(
    async (kind: string, memberIds: string[], opts?: { title?: string; subjectType?: string; subjectId?: string }) => {
      const id = await client.startConversation(kind, memberIds, opts);
      void queryClient.invalidateQueries({ queryKey: ["genesis-chat", "inbox"] });
      return id;
    },
    [client, queryClient],
  );
}

// ── Migration 0002: topics, scheduled send, availability, broadcast, search, previews ──

/**
 * A conversation's topics, live (set_topic's hint refreshes them), and `setTopic` for owners
 * and admins: add one (`setTopic("week-1", { title: "Week 1" })`), close or reopen it.
 */
export function useTopics(conversationId: string | null | undefined) {
  const { client } = useChat();
  const queryClient = useQueryClient();
  const id = conversationId ?? "";
  const query = useQuery({ queryKey: chatKeys.topics(id), queryFn: () => client.topics(id), enabled: Boolean(conversationId), staleTime: 60_000 });
  const setTopic = useCallback(
    async (topic: string, input: TopicInput = {}) => {
      await client.setTopic(id, topic, input);
      await queryClient.invalidateQueries({ queryKey: chatKeys.topics(id) });
    },
    [client, id, queryClient],
  );
  const topics: ChatTopic[] = query.data ?? [];
  return { topics, isLoading: query.isLoading, error: query.error, setTopic, refetch: query.refetch };
}

/**
 * Your scheduled messages (in one conversation, or all), soonest first, with `schedule` and
 * `cancel`. `schedule` uploads byte files first (`LocalFile.data` a Blob or ArrayBuffer; a
 * native URI goes through the provider's `readFile`), then schedules them with the message.
 */
export function useScheduled(conversationId?: string | null, opts: { enabled?: boolean } = {}) {
  const { client, userId } = useChat();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: chatKeys.scheduled(conversationId),
    queryFn: () => client.scheduled(conversationId ?? undefined),
    enabled: opts.enabled ?? true,
    staleTime: 30_000,
  });
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ["genesis-chat", "scheduled"] }), [queryClient]);
  const schedule = useCallback(
    async (input: Omit<ScheduleInput, "clientId"> & { clientId?: string }, files: LocalFile[] = []) => {
      const attachments = [...(input.attachments ?? [])];
      for (const f of files) {
        if (typeof f.data === "string") throw new Error("Scheduled files must be bytes (a Blob or ArrayBuffer)");
        const path = await client.upload(input.conversationId, userId, f.data, { name: f.name, contentType: f.contentType });
        attachments.push({ ...f.meta, kind: f.meta?.kind ?? (f.contentType.startsWith("image/") ? "image" : f.contentType.startsWith("video/") ? "video" : f.contentType.startsWith("audio/") ? "voice" : "file"), path, name: f.meta?.name ?? f.name, mime: f.contentType });
      }
      const id = await client.schedule({ ...input, clientId: input.clientId ?? randomId(), attachments });
      await refresh();
      return id;
    },
    [client, refresh, userId],
  );
  const cancel = useCallback(
    async (id: string) => {
      queryClient.setQueriesData<ScheduledMessage[]>({ queryKey: ["genesis-chat", "scheduled"] }, (prev) => (Array.isArray(prev) ? prev.filter((s) => s.id !== id) : prev));
      try {
        await client.cancelScheduled(id);
      } finally {
        await refresh();
      }
    },
    [client, queryClient, refresh],
  );
  const items: ScheduledMessage[] = query.data ?? [];
  return { items, isLoading: query.isLoading, error: query.error, schedule, cancel, refetch: query.refetch };
}

/**
 * Availability: yours (`mine`, `setMine`) and, given a conversation, its members' (`members`,
 * `forUser`). Pair with `awayLine` and `isWithinWorkingHours` from the core.
 */
export function useAvailability(conversationId?: string | null) {
  const { client, userId } = useChat();
  const queryClient = useQueryClient();
  const mine = useQuery({ queryKey: chatKeys.myAvailability(), queryFn: () => client.myAvailability(), staleTime: 5 * 60_000 });
  const members = useQuery({
    queryKey: chatKeys.availability(conversationId ?? ""),
    queryFn: () => client.availabilityFor(conversationId!),
    enabled: Boolean(conversationId),
    staleTime: 5 * 60_000,
  });
  const setMine = useCallback(
    async (input: AvailabilityInput) => {
      await client.setAvailability(input);
      await queryClient.invalidateQueries({ queryKey: chatKeys.myAvailability() });
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "genesis-chat" && q.queryKey[3] === "availability" });
    },
    [client, queryClient],
  );
  const list: ChatAvailability[] = members.data ?? [];
  const forUser = useCallback((id: string) => list.find((a) => a.userId === id) ?? null, [list]);
  return {
    mine: mine.data ?? null,
    mineLoading: mine.isLoading,
    setMine,
    members: list,
    /** Everyone else's, without yours. */
    others: list.filter((a) => a.userId !== userId),
    forUser,
    isLoading: mine.isLoading || (Boolean(conversationId) && members.isLoading),
  };
}

/** Sends one message into many conversations (replies come back privately in each). */
export function useBroadcast() {
  const { client } = useChat();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const send = useCallback(
    async (conversationIds: string[], body: string, opts: { silent?: boolean; clientId?: string } = {}) => {
      setSending(true);
      try {
        const ids = await client.broadcast(conversationIds, opts.clientId ?? randomId(), body, { silent: opts.silent });
        void queryClient.invalidateQueries({ queryKey: ["genesis-chat", "inbox"] });
        return ids;
      } finally {
        setSending(false);
      }
    },
    [client, queryClient],
  );
  return { send, sending };
}

/** The value, once it has stopped changing for `ms`. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (ms <= 0) {
      setV(value);
      return;
    }
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return ms <= 0 ? value : v;
}

/** Search, debounced (250 ms by default), in one conversation or all of yours. Queries under two characters return nothing. */
export function useSearch(query: string, opts: { conversationId?: string | null; debounceMs?: number; limit?: number } = {}) {
  const { client } = useChat();
  const q = useDebouncedValue(query.trim(), opts.debounceMs ?? 250);
  const enabled = q.length >= 2;
  const result = useQuery({
    queryKey: chatKeys.search(q, opts.conversationId),
    queryFn: () => client.search(q, opts.conversationId ?? null, { limit: opts.limit }),
    enabled,
    staleTime: 30_000,
  });
  const hits: ChatSearchHit[] = enabled ? (result.data ?? []) : [];
  return {
    hits,
    /** The query the hits are for. */
    query: q,
    /** Typing, or fetching: results are on their way. */
    isSearching: query.trim() !== q || (enabled && result.isFetching),
    error: result.error,
  };
}

/** Previews for these links, by URL (only those the server has fetched; asked again after a minute). */
export function useLinkPreviews(urls: (string | null | undefined)[]): Record<string, ChatLinkPreview> {
  const { client } = useChat();
  const list = useMemo(() => [...new Set(urls.filter((u): u is string => Boolean(u)))].sort(), [urls]);
  const data = useQuery({
    queryKey: chatKeys.previews(list),
    queryFn: () => client.linkPreviews(list),
    enabled: list.length > 0,
    staleTime: 60_000,
    // The runner fills previews moments after a message lands: look again while some are missing.
    refetchInterval: (q) => ((q.state.data?.length ?? 0) < list.length && q.state.dataUpdateCount < 4 ? 5_000 : false),
  }).data;
  return useMemo(() => Object.fromEntries((data ?? []).map((p) => [p.url, p])), [data]);
}

export type { ThreadItem, LocalFile, QueuedMessage };
