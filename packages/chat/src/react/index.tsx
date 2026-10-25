/**
 * @feat:chat
 * React hooks for chat, the same on web and native: the inbox, one
 * conversation (its messages, members, your role, who is typing) kept live by
 * Realtime hints, sending through the outbox, and message actions. Server
 * state is TanStack Query's; the renderers in /web and /native only draw.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChatClient, ConversationChannel } from "../core/client";
import { createOutbox, type LocalFile, type Outbox, type OutboxStore, type QueuedMessage } from "../core/outbox";
import { currentActivity, firstUnreadId, mergeThread, throttle, upsertMessages, type ThreadItem } from "../core/thread";
import type { ChatActivity, ChatMessage, ChatSignal, SendInput } from "../core/types";

export const chatKeys = {
  all: ["genesis-chat"] as const,
  inbox: (opts?: object) => ["genesis-chat", "inbox", opts ?? {}] as const,
  unread: () => ["genesis-chat", "unread"] as const,
  conversation: (id: string) => ["genesis-chat", "conversation", id] as const,
  members: (id: string) => ["genesis-chat", "members", id] as const,
  role: (id: string) => ["genesis-chat", "role", id] as const,
  pins: (id: string) => ["genesis-chat", "pins", id] as const,
  files: (paths: string[]) => ["genesis-chat", "files", [...paths].sort()] as const,
};

interface ChatContextValue {
  client: ChatClient;
  userId: string;
  outbox: Outbox;
  queue: QueuedMessage[];
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
  children: ReactNode;
}

/** Puts chat in reach of every hook below it. Needs a TanStack QueryClientProvider above it. */
export function ChatProvider({ client, userId, outboxStore, readFile, upload, children }: ChatProviderProps) {
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
        onChange: setQueue,
        onSent: (message) => {
          queryClient.setQueryData<ChatMessage[]>([...chatKeys.conversation(message.conversationId), "messages"], (prev) =>
            prev ? upsertMessages(prev, [message]) : prev,
          );
          void queryClient.invalidateQueries({ queryKey: ["genesis-chat", "inbox"] });
        },
      }),
    // A new person or client is a new outbox.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, userId],
  );

  useEffect(() => {
    void outbox.load();
    const sub = client.subscribeInbox(userId, (signal) => {
      void queryClient.invalidateQueries({ queryKey: ["genesis-chat", "inbox"] });
      void queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
      for (const l of listeners.current) l(signal);
    });
    return () => sub.unsubscribe();
  }, [client, userId, outbox, queryClient]);

  const value = useMemo<ChatContextValue>(
    () => ({
      client,
      userId,
      outbox,
      queue,
      onInbox: (l) => {
        listeners.current.add(l);
        return () => listeners.current.delete(l);
      },
    }),
    [client, userId, outbox, queue],
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
  const access = useQuery({
    queryKey: chatKeys.role(id),
    queryFn: async () => ({ role: await client.myRole(id), canPost: await client.canPost(id) }),
    enabled,
    staleTime: 60_000,
  });

  const [hasEarlier, setHasEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const messages = useQuery({
    queryKey: messagesKey,
    queryFn: async () => {
      const page = await client.messages(id, { limit: pageSize, threadRootId: opts.threadRootId, topic: opts.topic });
      setHasEarlier(page.hasEarlier);
      return page.messages;
    },
    enabled,
    staleTime: Infinity,
  });
  // Where "New" goes: what you had read when the conversation opened.
  const [readWhenOpened, setReadWhenOpened] = useState<number | null>(null);

  const merge = useCallback(
    (incoming: ChatMessage[]) =>
      queryClient.setQueryData<ChatMessage[]>(messagesKey, (prev) => upsertMessages(prev ?? [], incoming)),
    [queryClient, messagesKey],
  );

  const catchUp = useCallback(async () => {
    const current = queryClient.getQueryData<ChatMessage[]>(messagesKey) ?? [];
    const after = current.length ? current[current.length - 1]!.seq : undefined;
    if (after == null) {
      await queryClient.invalidateQueries({ queryKey: messagesKey });
      return;
    }
    const page = await client.messages(id, { afterSeq: after, limit: 200, threadRootId: opts.threadRootId, topic: opts.topic });
    merge(page.messages);
  }, [client, id, merge, messagesKey, opts.threadRootId, opts.topic, queryClient]);

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
          void queryClient.invalidateQueries({ queryKey: chatKeys.conversation(id) });
          void queryClient.invalidateQueries({ queryKey: chatKeys.pins(id) });
        }
      },
      onActivity: (a) => setActivity((prev) => currentActivity([...prev, a])),
      onReconnect: () => void catchUp(),
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

  const list = messages.data ?? [];
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
      merge(page.messages);
      setHasEarlier(page.hasEarlier);
    } finally {
      setLoadingEarlier(false);
    }
  }, [client, id, list, loadingEarlier, merge, opts.threadRootId, opts.topic, pageSize]);

  const pending = useMemo(
    () =>
      queue.filter(
        (q) =>
          q.input.conversationId === id &&
          (q.input.threadRootId ?? null) === (opts.threadRootId ?? null) &&
          (!opts.topic || q.input.topic === opts.topic),
      ),
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
    items,
    messages: list,
    isLoading: messages.isLoading || conversation.isLoading,
    error: messages.error ?? conversation.error,
    hasEarlier,
    loadingEarlier,
    loadEarlier,
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
  const refresh = async (conversationId: string, messageId: string) => {
    const m = await client.message(messageId);
    queryClient.setQueriesData<ChatMessage[]>({ queryKey: chatKeys.conversation(conversationId) }, (prev) =>
      Array.isArray(prev) && m ? upsertMessages(prev, [m]) : prev,
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

export type { ThreadItem, LocalFile, QueuedMessage };
