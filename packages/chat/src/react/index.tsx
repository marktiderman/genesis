/**
 * @feat:chat
 * React hooks for chat, the same on web and native: the inbox, one
 * conversation (its messages, members, your role, who is typing) kept live by
 * Realtime hints, sending through the outbox, and message actions. Server
 * state is TanStack Query's; the renderers in /web and /native only draw.
 */
import { keepPreviousData, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ChatInboxActions } from "./inbox-actions";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChatClient, ConversationChannel, MessagePage } from "../core/client";
import {
  createOutbox,
  type HostedUpload,
  type LocalFile,
  type Outbox,
  type OutboxStore,
  type QueuedMessage,
  type StorageUpload,
} from "../core/outbox";
import { sendBytes } from "../core/transfer";
import { currentActivity, firstUnreadId, mergeThread, throttle, upsertMessages, type ThreadItem } from "../core/thread";
import { attachmentKindFor, randomId } from "../core/media";
import type {
  AvailabilityInput,
  ChatActivity,
  ChatAttachment,
  ChatAvailability,
  ChatLinkPreview,
  ChatMember,
  ChatMessage,
  ChatSearchHit,
  ChatSignal,
  ChatTopic,
  ScheduleInput,
  ScheduledMessage,
  SendInput,
  StartConversationOptions,
  TopicInput,
} from "../core/types";

export const chatKeys = {
  all: ["genesis-chat"] as const,
  /** Every inbox list (each `inbox(opts)` is under it). */
  inboxAll: () => ["genesis-chat", "inbox"] as const,
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
  /** Every search's results (each `search(query, id)` is under it). */
  searchAll: () => ["genesis-chat", "search"] as const,
  search: (query: string, conversationId?: string | null) => ["genesis-chat", "search", conversationId ?? null, query] as const,
  previews: (messageIds: string[]) => ["genesis-chat", "previews", [...messageIds].sort()] as const,
  /** One message's link previews (useLinkPreviews keeps one query per message). */
  preview: (messageId: string) => ["genesis-chat", "preview", messageId] as const,
};

/** Refreshes every inbox list and the unread badge: after anything that changes a row. */
function refreshInbox(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: chatKeys.inboxAll() });
  void queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
}

/**
 * How many times each conversation has been forgotten, per query cache. A load (a catch-up, a
 * live message, an earlier page) captures it when it starts and writes nothing if it changed, so
 * a fetch already under way when the conversation was deleted can't put its history back. Loads
 * started afterwards write as usual.
 */
const forgotten = new WeakMap<QueryClient, Map<string, number>>();
function generationOf(queryClient: QueryClient, conversationId: string): number {
  return forgotten.get(queryClient)?.get(conversationId) ?? 0;
}

/** Drops what this device holds of a conversation (its thread, pins and every search), so deleted history can't show again. */
function forgetConversation(queryClient: QueryClient, conversationId: string): void {
  let byId = forgotten.get(queryClient);
  if (!byId) forgotten.set(queryClient, (byId = new Map()));
  byId.set(conversationId, generationOf(queryClient, conversationId) + 1);
  queryClient.removeQueries({ queryKey: chatKeys.conversation(conversationId) });
  queryClient.removeQueries({ queryKey: chatKeys.pins(conversationId) });
  queryClient.removeQueries({ queryKey: chatKeys.searchAll() });
}

/** Hide Alerts from the row: until it's turned back on (a date far enough away to read as always). */
const MUTED_FOREVER = "9999-12-31T00:00:00.000Z";

/** How many messages a catch-up asks for at a time, and how many pages before it gives up and jumps to the newest. */
export const CATCH_UP_PAGE = 200;
export const CATCH_UP_MAX_PAGES = 10;

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
 * Hosted video uploads (Mux direct uploads): your server makes an upload and returns its URL
 * (`createVideoUploadHandler` in /server). A video the composer marks `hosted` is sent through
 * the outbox at once, in order, with `{ kind: "video", provider, providerId, status: "pending" }`,
 * while its bytes are PUT to that URL (see `hostedUploadFrom`). Without it, videos go to storage
 * as files.
 */
export interface ChatVideoUpload {
  create(conversationId: string): Promise<{ url: string; providerId: string; provider: "mux" }>;
}

/**
 * The outbox's `hostedUpload` from a `ChatVideoUpload`: mints the upload (or, resuming, reuses
 * the one minted before), resolves at once with its id, and PUTs the whole file to its URL in
 * the background (XMLHttpRequest where there is one, for progress). A native file URI is read
 * with `readFile`. Native apps with chunked, resumable uploads pass their own `hostedUpload`.
 */
export function hostedUploadFrom(
  videoUpload: ChatVideoUpload,
  options: { readFile?: (uri: string) => Promise<Blob | ArrayBuffer>; fetch?: typeof fetch } = {},
): HostedUpload {
  return async (conversationId, file, { signal, onProgress, resume }) => {
    const minted = resume?.url
      ? { url: resume.url, providerId: resume.providerId, provider: resume.provider }
      : await videoUpload.create(conversationId);
    const done = (async () => {
      const body =
        typeof file.data === "string"
          ? await (options.readFile ?? (() => Promise.reject(new Error("This file can't be read on this device"))))(file.data)
          : file.data;
      await sendBytes(minted.url, body, { method: "PUT", headers: { "Content-Type": file.contentType }, signal, onProgress, fetch: options.fetch });
    })();
    return { provider: minted.provider, providerId: minted.providerId, status: "pending", url: minted.url, done };
  };
}

/** What a kind's `title`, `subtitle` and `action` are told besides the attachment. */
export interface ChatCardContext {
  /** The card is on a message you sent (your own check-in reads "Sent", not "Answer"). */
  mine: boolean;
}

/** What an app attachment kind's card shows (a form, a check-in): plain data, drawn by each renderer. */
export interface ChatAttachmentKind {
  title(attachment: ChatAttachment, ctx?: ChatCardContext): string;
  subtitle?(attachment: ChatAttachment, ctx?: ChatCardContext): string | null | undefined;
  /**
   * The card's button: a link (`href`) or a handler (`onPress`). On native the button is also the
   * bubble's VoiceOver action, and a handler that returns a promise shows the card as busy until
   * it settles (and a short error if it rejects).
   */
  action?(attachment: ChatAttachment, ctx?: ChatCardContext): { label: string; href?: string; onPress?: () => void | Promise<unknown> } | null | undefined;
  /** What previews call it (the inbox's last message, "Check-in"); the title by default. */
  label?: string;
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
  /**
   * Replaces the plain upload (resumable uploads on native). `signal` aborts when the message is
   * discarded or the outbox cleared; `onProgress(sent, total)` fills the pending bubble's bar.
   */
  upload?: StorageUpload;
  /**
   * Starts a hosted upload for files marked `hosted` (see HostedUpload): resolve with
   * `{ provider, providerId, status: "pending", url?, done }` once the upload id exists. Default:
   * `hostedUploadFrom(videoUpload)` when `videoUpload` is given.
   */
  hostedUpload?: HostedUpload;
  /** Makes client ids (default: a random UUID that works without crypto.randomUUID). */
  newId?: () => string;
  /** Keeps a byte file (a pasted image, a recording) across launches: write it, return a URI. */
  persistFile?: (file: LocalFile) => Promise<string>;
  /** Lets go of a sent file's preview (default: revokes `blob:` object URLs only). */
  releasePreview?: (url: string) => void;
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
  hostedUpload,
  newId,
  persistFile,
  releasePreview,
  loadPeople,
  videoUpload,
  attachmentKinds,
  children,
}: ChatProviderProps) {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const listeners = useRef(new Set<(s: ChatSignal) => void>());
  // The outbox lives as long as the client and user, so it reads the app's functions here at call
  // time: an inline `videoUpload.create` closing over a refreshed token keeps working.
  const live = useRef({ readFile, upload, hostedUpload, videoUpload, persistFile });
  live.current = { readFile, upload, hostedUpload, videoUpload, persistFile };

  const outbox = useMemo(
    () =>
      createOutbox({
        client,
        userId,
        store: outboxStore,
        readFile: readFile && ((uri) => (live.current.readFile ?? readFile)(uri)),
        upload: upload && ((...args) => (live.current.upload ?? upload)(...args)),
        hostedUpload:
          hostedUpload || videoUpload
            ? (...args) => {
                const now = live.current;
                const video = now.videoUpload ?? videoUpload;
                const send = now.hostedUpload ?? (video ? hostedUploadFrom(video, { readFile: now.readFile ?? readFile }) : hostedUpload!);
                return send(...args);
              }
            : undefined,
        newId,
        persistFile: persistFile && ((file) => (live.current.persistFile ?? persistFile)(file)),
        releasePreview,
        onChange: setQueue,
        onSent: (message) => {
          // Into every loaded list it belongs to (the main timeline, its thread, its topic), so
          // the bubble never disappears between the send landing and the live hint.
          queryClient.setQueriesData<MessagesData>(
            { predicate: (q) => belongsTo(q.queryKey, message) },
            (prev) => upsertInto(prev, [message]) ?? prev,
          );
          void queryClient.invalidateQueries({ queryKey: ["genesis-chat", "scheduled"] });
          refreshInbox(queryClient);
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
      refreshInbox(queryClient);
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
export function useInbox(opts: { kind?: string; kinds?: string[]; excludeKinds?: string[]; archived?: boolean; limit?: number } = {}) {
  const { client } = useChat();
  const query = useQuery({ queryKey: chatKeys.inbox(opts), queryFn: () => client.inbox(opts), staleTime: 15_000 });
  return { items: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/** How many messages wait for you everywhere (for a badge), live. */
export function useUnreadTotal(opts: { excludeKinds?: string[] } = {}): number {
  const { client } = useChat();
  return (
    useQuery({ queryKey: [...chatKeys.unread(), opts.excludeKinds ?? []], queryFn: () => client.unreadTotal(opts), staleTime: 15_000 }).data ??
    0
  );
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
/** How long a `read` hint waits for others before the members are read again. */
const READ_REFETCH_MS = 300;

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
  const members = useQuery({ queryKey: chatKeys.members(id), queryFn: () => client.members(id), enabled, staleTime: 60_000, refetchOnMount: "always" });
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
  // Another conversation in the same screen (a split view, no remount) opens at its own read place:
  // forget the last one's, and read this one's members afresh (a cached copy may be from an earlier visit).
  const [openedFor, setOpenedFor] = useState(id);
  if (openedFor !== id) {
    setOpenedFor(id);
    setReadWhenOpened(null);
  }
  const { refetch: refetchMembers } = members;
  const firstId = useRef(id);
  useEffect(() => {
    if (firstId.current === id) return;
    firstId.current = id;
    if (enabled) void refetchMembers();
  }, [id, enabled, refetchMembers]);

  /**
   * Merges messages into the list. `since` is the conversation's forget generation when the load
   * began (see forgetConversation): when it has moved on, the load predates a Delete for me and
   * writes nothing.
   */
  const merge = useCallback(
    (incoming: ChatMessage[], hasEarlierNow?: boolean, since = generationOf(queryClient, id)) => {
      if (generationOf(queryClient, id) !== since) return;
      queryClient.setQueryData<MessagesData>(messagesKey, (prev) => {
        const base = prev ?? { messages: [], hasEarlier: false };
        return { messages: upsertMessages(base.messages, incoming), hasEarlier: hasEarlierNow ?? base.hasEarlier };
      });
    },
    [queryClient, messagesKey, id],
  );

  /**
   * Fetches what came after the newest message held (everything, for an empty list). Runs on
   * every join of the live channel, the first included, so messages that arrived while the
   * thread was closed, or between the first fetch and the subscription, always show. Pages
   * until a short one; after CATCH_UP_MAX_PAGES full pages (a long time away from a busy group)
   * it shows the newest page instead, with the rest behind "load earlier".
   */
  const catchUp = useCallback(async () => {
    const since = generationOf(queryClient, id);
    const current = queryClient.getQueryData<MessagesData>(messagesKey) ?? (await queryClient.ensureQueryData<MessagesData>({ queryKey: messagesKey, queryFn: fetchPage }));
    const list = current.messages;
    let after = list.length ? list[list.length - 1]!.seq : 0;
    for (let pages = 0; ; ) {
      const page = await client.messages(id, { afterSeq: after, limit: CATCH_UP_PAGE, threadRootId: opts.threadRootId, topic: opts.topic });
      if (generationOf(queryClient, id) !== since) return;
      if (page.messages.length) merge(page.messages, undefined, since);
      if (page.messages.length < CATCH_UP_PAGE) return;
      after = Math.max(after, ...page.messages.map((m) => m.seq));
      if (++pages >= CATCH_UP_MAX_PAGES) break;
    }
    const newest = await fetchPage();
    if (generationOf(queryClient, id) !== since) return;
    queryClient.setQueryData<MessagesData>(messagesKey, { messages: newest.messages, hasEarlier: true });
  }, [client, fetchPage, id, merge, messagesKey, opts.threadRootId, opts.topic, queryClient]);

  const [activity, setActivity] = useState<ChatActivity[]>([]);
  const channel = useRef<ConversationChannel | null>(null);
  // Whether the live channel is joined: null until the client first says, false when it dropped.
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    setLive(null);
    const fetchOne = async (messageId: string) => {
      const since = generationOf(queryClient, id);
      const m = await client.message(messageId);
      if (!m) return;
      const belongs = opts.threadRootId ? m.threadRootId === opts.threadRootId : m.threadRootId === null;
      if (belongs && (!opts.topic || m.topic === opts.topic)) merge([m], undefined, since);
      if (m.threadRootId && !opts.threadRootId) {
        const root = await client.message(m.threadRootId);
        if (root) merge([root], undefined, since);
      }
    };
    let readRefetch: ReturnType<typeof setTimeout> | null = null;
    channel.current = client.subscribeConversation(id, userId, {
      onSignal: (s) => {
        if (s.type === "message") void fetchOne(s.id);
        else if (s.type === "reaction") void fetchOne(s.messageId);
        else if (s.type === "read") {
          // Read receipts: a cue to read the members again, never the read place itself (a payload
          // is only as good as whoever sent it). Coalesced, so a burst of reads is one fetch.
          if (readRefetch === null) {
            readRefetch = setTimeout(() => {
              readRefetch = null;
              void queryClient.invalidateQueries({ queryKey: chatKeys.members(id) });
            }, READ_REFETCH_MS);
          }
        } else if (s.type === "members") {
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
      // Every join: what was missed while the channel was down, messages and read places both.
      onJoin: () => {
        void catchUp().catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: chatKeys.members(id) });
      },
      onLive: setLive,
    });
    return () => {
      if (readRefetch) clearTimeout(readRefetch);
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
  // Where "New" goes comes from your read place as fetched for this opening, never a cached
  // copy from an earlier visit (which would draw the line above messages already read).
  const myLastRead = members.isFetchedAfterMount ? members.data?.find((m) => m.userId === userId)?.lastReadSeq : undefined;
  useEffect(() => {
    if (readWhenOpened === null && myLastRead !== undefined) setReadWhenOpened(myLastRead);
  }, [myLastRead, readWhenOpened]);

  const markRead = useCallback(async () => {
    if (!enabled || latestSeq === 0) return;
    await client.markRead(id, latestSeq);
    refreshInbox(queryClient);
  }, [client, enabled, id, latestSeq, queryClient]);

  // Your read place is one number for the whole conversation, so only the whole timeline moves
  // it: a topic (or a thread) shows a slice, and marking up to its newest message would also
  // mark unseen messages in other topics read.
  const shouldMark = opts.markRead !== false && !opts.threadRootId && !opts.topic;
  useEffect(() => {
    if (shouldMark && latestSeq > 0) void markRead().catch(() => undefined);
  }, [shouldMark, latestSeq, markRead]);

  const refetchConversation = useCallback(
    () =>
      Promise.all([
        // The conversation and what hangs off it (topics, availability), never its message lists:
        // a refetch would replace loaded history and merged live messages with one fresh page.
        queryClient.refetchQueries({ queryKey: chatKeys.conversation(id), predicate: (q) => q.queryKey[3] !== "messages" }),
        queryClient.refetchQueries({ queryKey: chatKeys.members(id) }),
        queryClient.refetchQueries({ queryKey: chatKeys.role(id) }),
        queryClient.refetchQueries({ queryKey: chatKeys.pins(id) }),
        queryClient.refetchQueries({ queryKey: ["genesis-chat", "kind"] }),
      ]).then(() => undefined),
    [queryClient, id],
  );

  const { refetch: refetchMessages } = messages;
  const { refetch: refetchConversationRow } = conversation;
  const reload = useCallback(
    () => Promise.all([refetchConversationRow(), refetchMessages()]).then(() => undefined),
    [refetchConversationRow, refetchMessages],
  );

  const loadEarlier = useCallback(async () => {
    const first = list[0];
    if (!first || loadingEarlier) return;
    setLoadingEarlier(true);
    const since = generationOf(queryClient, id);
    try {
      const page = await client.messages(id, { beforeSeq: first.seq, limit: pageSize, threadRootId: opts.threadRootId, topic: opts.topic });
      merge(page.messages, page.hasEarlier, since);
    } finally {
      setLoadingEarlier(false);
    }
  }, [client, id, list, loadingEarlier, merge, opts.threadRootId, opts.topic, pageSize, queryClient]);

  /** Loads earlier messages until the one with this seq is held (a search result, a pinned message). True when it is. */
  const loadUntil = useCallback(
    async (seq: number) => {
      const since = generationOf(queryClient, id);
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
        if (generationOf(queryClient, id) !== since) return false;
        merge(page.messages, page.hasEarlier, since);
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
  const signalRecordingVideo = useMemo(() => throttle(() => channel.current?.signal("recording-video")), []);

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
    /** The conversation itself is still loading (it settles to `null` when you can't see it). */
    conversationLoading: conversation.isLoading,
    /** Your role couldn't be loaded (offline): offer `refetchAccess`, don't say "can't post". */
    accessError: access.error ?? null,
    /** Retries everything this conversation loads (role, members, the conversation, topics, availability, pins), not only access. */
    refetchAccess: refetchConversation,
    /** Same as refetchAccess: every per-conversation lookup again, for a Retry after being offline. */
    refetchConversation,
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
    /** Whether `firstUnreadId` is known yet (your read place as of this opening has been fetched). */
    firstUnreadKnown: readWhenOpened !== null,
    activity: currentActivity(activity),
    signalTyping,
    signalRecording,
    /** Tells the others you are recording a video (throttled). */
    signalRecordingVideo,
    markRead,
    send,
    retry: outbox.retry,
    discard: outbox.discard,
    refetch: catchUp,
    /** The conversation and its first page again, after either failed (a Retry on the thread's error row). */
    reload,
    /** The live channel: true once joined, false when it dropped (errored, timed out, closed), null until the client says. */
    live,
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
 * Your own actions on one inbox row (Mark as Unread or Read, Pin, Hide Alerts, Archive, Delete for
 * me), refreshing the inbox and badge afterwards. Each takes the row's item and returns the call's
 * promise, so a failure reaches the caller to show. Delete for me reads the row's `lastSeq` (what
 * you saw) and drops the conversation's cached thread, pins and search results, so its deleted
 * history can't show again on this device when a new message brings it back.
 * `inboxRowActions(item, actions, labels, { confirm })` turns them into the row's swipe and menu.
 */
export function useInboxActions(): ChatInboxActions {
  const { client } = useChat();
  const queryClient = useQueryClient();
  return useMemo(() => {
    const run = async <T,>(call: () => Promise<T>): Promise<T> => {
      try {
        return await call();
      } finally {
        refreshInbox(queryClient);
      }
    };
    return {
      toggleUnread: (item) =>
        run<unknown>(() => (item.unread > 0 ? client.markRead(item.conversationId) : client.setMySettings(item.conversationId, { markedUnread: true }))),
      togglePinned: (item) => run(() => client.setMySettings(item.conversationId, { pinned: !item.pinned })),
      toggleMuted: (item, until = MUTED_FOREVER) => run(() => client.setMySettings(item.conversationId, { mutedUntil: item.muted ? null : until })),
      setArchived: (item, archived) => run(() => client.setMySettings(item.conversationId, { archived })),
      deleteForMe: (item) =>
        run(async () => {
          await client.deleteConversationForMe(item.conversationId, item.lastSeq);
          forgetConversation(queryClient, item.conversationId);
        }),
    };
  }, [client, queryClient]);
}

/**
 * What the read hooks return while there is nothing yet: one frozen object (and array) for every
 * caller, so a row's memo holds across renders instead of seeing a fresh `{}` each time.
 */
const NO_PEOPLE: Record<string, ChatPerson> = Object.freeze({}) as Record<string, ChatPerson>;
const NO_URLS: Record<string, string> = Object.freeze({}) as Record<string, string>;
const NO_PINS: string[] = Object.freeze([]) as unknown as string[];

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
    }).data ?? NO_PEOPLE
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
    useQuery({ queryKey: chatKeys.pins(conversationId ?? ""), queryFn: () => client.pins(conversationId!), enabled: Boolean(conversationId) }).data ?? NO_PINS
  );
}

/**
 * Signed links for files (cached by the client until shortly before they expire). While a new set
 * of paths loads (a photo arrives), the links already signed stay: the photos on screen don't blank.
 */
export function useFileUrls(paths: (string | null | undefined)[]): Record<string, string> {
  const { client } = useChat();
  const list = useMemo(() => [...new Set(paths.filter((p): p is string => Boolean(p)))], [paths]);
  return (
    useQuery({
      queryKey: chatKeys.files(list),
      queryFn: () => client.fileUrls(list),
      enabled: list.length > 0,
      staleTime: 50 * 60_000,
      placeholderData: keepPreviousData,
    }).data ?? NO_URLS
  );
}

/** Starts (or finds again) a conversation, then refreshes the inbox. */
export function useStartConversation() {
  const { client } = useChat();
  const queryClient = useQueryClient();
  return useCallback(
    async (kind: string, memberIds: string[], opts?: StartConversationOptions) => {
      const id = await client.startConversation(kind, memberIds, opts);
      refreshInbox(queryClient);
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
 * `cancel` (which also removes one that failed). `schedule` uploads its files to storage first,
 * the way `send` does (the provider's `upload` hook, or a native URI read through `readFile`),
 * then schedules them with the message. A file marked `hosted` goes to storage too.
 */
export function useScheduled(conversationId?: string | null, opts: { enabled?: boolean } = {}) {
  const { client, outbox } = useChat();
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
        const path = await outbox.uploadFile(input.conversationId, f);
        attachments.push({ ...f.meta, kind: f.meta?.kind ?? attachmentKindFor(f.contentType), path, name: f.meta?.name ?? f.name, mime: f.contentType });
      }
      const id = await client.schedule({ ...input, clientId: input.clientId ?? randomId(), attachments });
      await refresh();
      return id;
    },
    [client, outbox, refresh],
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
        refreshInbox(queryClient);
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

/** At most this many link-preview reads at once, per client. */
export const LINK_PREVIEW_CONCURRENCY = 4;
const previewGates = new WeakMap<object, <T>(task: () => Promise<T>) => Promise<T>>();

/** A gate that lets `max` tasks run at once and queues the rest. */
function gate(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T,>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((r) => waiting.push(r));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

/**
 * Link previews for these messages, by message id, in link order (only those the server has
 * fetched). Pass the messages whose text has links (`extractLinks(body).length > 0`). One query
 * per message, so a new message asks only for its own, and at most LINK_PREVIEW_CONCURRENCY
 * run at once. One with none yet is asked again a few times, since the runner fills them
 * moments after it lands.
 */
export function useLinkPreviews(messageIds: (string | null | undefined)[]): Record<string, ChatLinkPreview[]> {
  const { client } = useChat();
  const list = useMemo(() => [...new Set(messageIds.filter((u): u is string => Boolean(u)))].sort(), [messageIds]);
  let run = previewGates.get(client);
  if (!run) {
    run = gate(LINK_PREVIEW_CONCURRENCY);
    previewGates.set(client, run);
  }
  const limited = run;
  const combine = useCallback(
    (results: { data?: ChatLinkPreview[] }[]) => {
      let out: Record<string, ChatLinkPreview[]> | null = null;
      results.forEach((r, i) => {
        if (r.data) (out ??= {})[list[i]!] = r.data;
      });
      return out ?? EMPTY_PREVIEWS;
    },
    [list],
  );
  return useQueries({
    queries: list.map((id) => ({
      queryKey: chatKeys.preview(id),
      queryFn: () => limited(async () => (await client.linkPreviewsFor([id]))[id] ?? []),
      staleTime: 60_000,
      refetchInterval: (q: { state: { data?: ChatLinkPreview[]; dataUpdateCount: number } }) =>
        !q.state.data?.length && q.state.dataUpdateCount < 4 ? 5_000 : false,
    })),
    combine,
  });
}
const EMPTY_PREVIEWS: Record<string, ChatLinkPreview[]> = {};

export type { ThreadItem, LocalFile, QueuedMessage };
export { defaultInboxActionLabels, inboxRowActions, type ChatConfirm, type ChatInboxActionLabels, type ChatInboxActions, type InboxRowActionsOptions } from "./inbox-actions";
