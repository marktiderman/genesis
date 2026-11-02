/**
 * @feat:chat
 * One conversation, whole: a header, the messages (oldest at the top, kept at
 * the bottom as new ones arrive unless you scrolled up, then a "New messages"
 * pill; earlier ones load as you reach the top without moving what you were
 * reading), day dividers and the "New" line, who is typing, and the composer.
 * Files dropped anywhere on it attach. Screen readers hear incoming messages.
 * With topics, a topic bar filters it; when the other person is away or outside
 * their hours a banner says so; search (in the header) jumps to a message,
 * loading earlier ones as needed; links get preview cards.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type ReactNode,
} from "react";
import { ArrowDown, ArrowLeft, ImagePlus, MessageSquare, Pin, Search } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Label,
  RadioGroup,
  RadioGroupItem,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Spinner,
  Textarea,
  UserAvatar,
  cn,
  toast,
} from "@marktiderman/genesis-ui";
import { renderSlot, type SlotOverride } from "@marktiderman/genesis-core/slots";
import { ChatError } from "../core/client";
import { extractLinks } from "../core/extras";
import { activityLine, dayLabel, itemSender, itemTime, parseMentions, previewText, startsDay, startsGroup, type ThreadItem } from "../core/thread";
import type { ChatConversation, ChatMember, ChatMessage, ChatRole, ChatSearchHit } from "../core/types";
import { useAvailability, useChat, useConversation, useFileUrls, useLinkPreviews, useMessageActions, usePins, useTopics } from "../react/index";
import { awaySummary } from "../core/availability";
import type { ChatAttachmentSlotProps } from "./attachments";
import { MessageRow, plainText } from "./bubble";
import { ChatAwayBanner } from "./availability";
import type { LinkPreviewImages } from "./cards";
import { ChatErrorBoundary } from "./error-boundary";
import { ChatComposer, type ChatComposerHandle } from "./composer";
import type { ResolveUser } from "./format";
import { ChatSearch } from "./search";
import { ChatTopicBar } from "./topics";
import { QUICK_REACTIONS, ThreadContext, type ThreadContextValue } from "./thread-context";

export interface ChatThreadHeaderProps {
  conversationId: string;
  conversation: ChatConversation | null;
  /** The title the thread worked out (the conversation's, or the other person's name). */
  title: string;
  /** How many people are in it, for a group. */
  subtitle: string | null;
  /** "Sam is typing…" while someone is. */
  activity: string | null;
  /** The other person in a two-person conversation. */
  otherUserId: string | null;
  members: ChatMember[];
  role: ChatRole | null;
  resolveUser: ResolveUser;
  onBack?: () => void;
  backClassName?: string;
  /** Opens search in this conversation (absent when search is off). */
  onSearch?: () => void;
}

export interface ChatThreadEmptyProps {
  conversationId: string;
  canPost: boolean;
}

export interface ChatComposerAccessoryProps {
  conversationId: string;
  insertText(text: string): void;
  addFiles(files: File[]): void;
}

export interface ChatThreadSlots {
  /** The bar above the messages. */
  header?: SlotOverride<ChatThreadHeaderProps>;
  /** What a conversation with no messages shows. */
  empty?: SlotOverride<ChatThreadEmptyProps>;
  /** Draws the app's own attachment kinds (form, lesson…); a generic card by default, `null` hides them. */
  attachment?: ComponentType<ChatAttachmentSlotProps> | null;
  /** Extra controls in the composer, beside the attach button. */
  composerAccessory?: SlotOverride<ChatComposerAccessoryProps>;
}

export interface ChatThreadProps {
  conversationId: string;
  /** Names people. Required: the package knows no people tables, the app does. */
  resolveUser: ResolveUser;
  /** The header's title; worked out from the conversation and its members by default. */
  title?: string;
  /** Shows a back button in the header. */
  onBack?: () => void;
  /** Classes for that back button (ChatPanel hides it on wide screens). */
  backClassName?: string;
  /** One thread's replies instead of the main timeline. */
  threadRootId?: string;
  /** One topic's messages. */
  topic?: string;
  /**
   * Shown on messages that have replies, to open their thread. Also called when a search result
   * is a reply in a thread, with `jumpTo` (that reply) for the thread's own ChatThread.
   */
  onOpenThread?: (message: ChatMessage, opts?: { jumpTo?: { messageId: string; seq: number } }) => void;
  /** The quick reactions; 👍 ❤️ 😂 😮 😢 🙏 by default. */
  quickReactions?: readonly string[];
  placeholder?: string;
  /** Show the topic bar even before the first topic exists (so an owner can add one). */
  showTopics?: boolean;
  /** Scroll to this message once it's loaded (a search result across conversations); `seq` lets earlier pages load to reach it. */
  jumpTo?: { messageId: string; seq?: number; threadRootId?: string | null } | null;
  /** A search button in the header. Default true. */
  search?: boolean;
  /** Scheduled send in the composer. Default true. */
  scheduling?: boolean;
  /** The away banner. Default true. */
  availability?: boolean;
  /** Where the emoji picker loads its data from (self-hosted emojibase-data). Without it there is no full picker; the quick reactions stay. */
  emojibaseUrl?: string;
  /** Link preview images: `"off"` by default, `"proxy"` through `linkPreviewProxyUrl`, or `"direct"` from the linked site (which then sees readers' IPs). */
  linkPreviewImages?: LinkPreviewImages;
  /** Your image proxy for `linkPreviewImages: "proxy"`: the URL to load for an og:image. */
  linkPreviewProxyUrl?: (url: string) => string | null | undefined;
  slots?: ChatThreadSlots;
  className?: string;
}

const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "safety", label: "Someone may be at risk" },
  { value: "other", label: "Something else" },
] as const;

type ReportReason = (typeof REPORT_REASONS)[number]["value"];

const itemKey = (item: ThreadItem) => (item.type === "message" ? item.message.clientId || item.message.id : item.pending.clientId);

function errorText(e: unknown): string {
  if (e instanceof ChatError) {
    if (e.forbidden) return "You can't do that here";
    if (e.rateLimited) return "Slow down a little and try again";
    if (e.transient) return "Check your connection and try again";
  }
  return e instanceof Error ? e.message : "Something went wrong";
}

function DefaultHeader({ title, subtitle, otherUserId, resolveUser, onBack, backClassName, onSearch }: ChatThreadHeaderProps) {
  const other = otherUserId ? resolveUser(otherUserId) : null;
  return (
    <header className="flex min-h-14 items-center gap-3 border-b px-3 py-2" data-testid="genesis-chat-thread-header">
      {onBack ? (
        <Button type="button" variant="ghost" size="icon" className={cn("-ml-1 shrink-0", backClassName)} onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft />
        </Button>
      ) : null}
      <UserAvatar name={title} src={other?.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold leading-tight">{title}</h2>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {onSearch ? (
        <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onSearch} aria-label="Search this conversation" data-testid="genesis-chat-thread-search">
          <Search />
        </Button>
      ) : null}
    </header>
  );
}

function DefaultEmpty({ canPost }: ChatThreadEmptyProps) {
  return <EmptyState icon={MessageSquare} title="No messages yet" description={canPost ? "Say hello." : undefined} />;
}

export function ChatThread({
  conversationId,
  resolveUser,
  title: titleProp,
  onBack,
  backClassName,
  threadRootId,
  topic: topicProp,
  onOpenThread,
  quickReactions = QUICK_REACTIONS,
  placeholder,
  showTopics,
  jumpTo: jumpToProp,
  search = true,
  scheduling = true,
  availability = true,
  emojibaseUrl,
  linkPreviewImages = "off",
  linkPreviewProxyUrl,
  slots,
  className,
}: ChatThreadProps) {
  const { userId: me, attachmentKinds, client: chatClient } = useChat();
  const topicsState = useTopics(threadRootId ? null : conversationId);
  const [chosenTopic, setChosenTopic] = useState<string | null>(null);
  const topic = topicProp ?? chosenTopic ?? undefined;
  const state = useConversation(conversationId, { threadRootId, topic });
  const actions = useMessageActions();
  const pinIds = usePins(conversationId);
  const { items, messages, members, role, canPost, conversation, activity } = state;

  const paths = useMemo(
    () => messages.flatMap((m) => m.attachments.flatMap((a) => [a.path, a.posterPath])).filter((p): p is string => Boolean(p)),
    [messages],
  );
  const urls = useFileUrls(paths);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const pins = useMemo(() => new Set(pinIds), [pinIds]);

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [dragging, setDragging] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const composer = useRef<ChatComposerHandle | null>(null);

  // A different conversation starts clean.
  useEffect(() => {
    setReplyTo(null);
    setEditingId(null);
    setNewCount(0);
    setChosenTopic(null);
  }, [conversationId]);

  const topics = topicsState.topics;
  const currentTopic = topic ? topics.find((t) => t.topic === topic) : undefined;
  const canManageTopics = role === "owner" || role === "admin";
  const showTopicBar = !threadRootId && topicProp === undefined && (topics.length > 0 || (showTopics && canManageTopics));
  const topicClosed = Boolean(currentTopic?.closedAt) && role !== "owner" && role !== "admin" && role !== "observer";

  const linkMessageIds = useMemo(
    () => messages.filter((m) => !m.deletedAt && m.moderation !== "hidden" && extractLinks(m.body).length > 0).map((m) => m.id),
    [messages],
  );
  const previews = useLinkPreviews(linkMessageIds);
  const avail = useAvailability(availability ? conversationId : null);
  const [searching, setSearching] = useState(false);

  const nameOf = useCallback((id: string) => (id === me ? "You" : resolveUser(id).name), [me, resolveUser]);
  const others = members.filter((m) => m.userId !== me);
  const otherUserId = members.length === 2 && others.length === 1 ? others[0]!.userId : null;
  const isGroup = members.length > 2 || role === "observer";
  const title =
    titleProp ??
    conversation?.title ??
    (otherUserId
      ? resolveUser(otherUserId).name
      : others.length
        ? others.length <= 3
          ? others.map((m) => resolveUser(m.userId).name).join(", ")
          : `${others.slice(0, 2).map((m) => resolveUser(m.userId).name).join(", ")} and ${others.length - 2} others`
        : "Conversation");
  // Someone who just posted has stopped typing, whatever their last signal said.
  const arrived = useRef(new Map<string, number>());
  const live = activityLine(
    activity.filter((a) => a.at > (arrived.current.get(a.userId) ?? 0)),
    (id) => resolveUser(id).name,
  );
  const subtitle = members.length > 2 ? `${members.length} members` : null;

  // The away line: the other person in a two-person conversation; in a group, everyone away or outside their hours.
  const awayPeople = useMemo(() => {
    if (!availability) return null;
    const ids = otherUserId ? [otherUserId] : members.filter((m) => m.userId !== me).map((m) => m.userId);
    const people = ids.flatMap((id) => {
      const a = avail.forUser(id);
      return a ? [{ availability: a, name: resolveUser(id).name }] : [];
    });
    return awaySummary(people) ? people : null;
  }, [availability, otherUserId, members, me, avail, resolveUser]);

  // ---- scrolling ------------------------------------------------------------
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const initialised = useRef<string | null>(null);
  const edges = useRef<{ first: string | null; last: string | null }>({ first: null, last: null });
  const anchor = useRef<{ height: number; top: number } | null>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    if (smooth && typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setNewCount(0);
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || items.length === 0) return;
    const first = itemKey(items[0]!);
    const lastItem = items[items.length - 1]!;
    const last = itemKey(lastItem);
    const prev = edges.current;
    edges.current = { first, last };

    if (initialised.current !== conversationId) {
      initialised.current = conversationId;
      const unread = state.firstUnreadId ? document.getElementById(`genesis-chat-msg-${state.firstUnreadId}`) : null;
      if (unread && typeof unread.scrollIntoView === "function") unread.scrollIntoView({ block: "center" });
      else scrollToBottom();
      return;
    }
    if (anchor.current && first !== prev.first) {
      el.scrollTop = el.scrollHeight - anchor.current.height + anchor.current.top;
      anchor.current = null;
    }
    if (last !== prev.last) {
      const mine = itemSender(lastItem) === me;
      if (atBottom.current || mine) scrollToBottom();
      else setNewCount((n) => n + 1);
      if (!mine && lastItem.type === "message" && lastItem.message.kind !== "system") {
        const m = lastItem.message;
        if (m.senderId) arrived.current.set(m.senderId, Date.now());
        setAnnouncement(`${m.senderId ? resolveUser(m.senderId).name : "Someone"}: ${previewText(m.body, m.attachments[0]?.kind ?? null, Boolean(m.deletedAt))}`);
      }
    }
  }, [items, conversationId, me, resolveUser, scrollToBottom, state.firstUnreadId]);

  const hasItems = items.length > 0;
  // Photos and previews that load later grow the thread: stay at the bottom if you were there.
  useEffect(() => {
    const el = content.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasItems]);

  const { hasEarlier, loadingEarlier, loadEarlier } = state;
  const loadOlder = useCallback(() => {
    const el = scroller.current;
    if (!el || !hasEarlier || loadingEarlier) return;
    anchor.current = { height: el.scrollHeight, top: el.scrollTop };
    void loadEarlier().catch((e) => toast.error(errorText(e)));
  }, [hasEarlier, loadingEarlier, loadEarlier]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottom.current = bottom;
    if (bottom && newCount) setNewCount(0);
    if (el.scrollTop < 200) loadOlder();
  };

  const jumpTo = useCallback((id: string) => {
    const el = document.getElementById(`genesis-chat-msg-${id}`);
    if (!el) {
      toast.info("That message is further up", { description: "Scroll up to load it." });
      return;
    }
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightedId(id);
    setTimeout(() => setHighlightedId((h) => (h === id ? null : h)), 1600);
  }, []);

  // A message to reach: loads earlier pages until it is here (leaving a topic it isn't in), then scrolls to it.
  type Jump = { messageId: string; seq?: number; phase: "new" | "loading" | "loaded" };
  /**
   * A reply in a thread isn't on this timeline: open its thread (onOpenThread, scrolled to the
   * reply) and come here to the thread's first message; without onOpenThread, just to that.
   */
  const reach = useCallback(
    (target: { messageId: string; seq?: number; threadRootId?: string | null }) => {
      const root = target.threadRootId;
      if (!root || root === threadRootId || root === target.messageId) {
        setPendingJump({ messageId: target.messageId, seq: target.seq, phase: "new" });
        return;
      }
      void chatClient.message(root).then(
        (m) => {
          if (!m) {
            toast.info("That message isn't here any more");
            return;
          }
          onOpenThread?.(m, target.seq != null ? { jumpTo: { messageId: target.messageId, seq: target.seq } } : undefined);
          setPendingJump({ messageId: m.id, seq: m.seq, phase: "new" });
        },
        (e) => toast.error(errorText(e)),
      );
    },
    [chatClient, onOpenThread, threadRootId],
  );
  const [pendingJump, setPendingJump] = useState<Jump | null>(jumpToProp && !jumpToProp.threadRootId ? { ...jumpToProp, phase: "new" } : null);
  useEffect(() => {
    if (jumpToProp) reach(jumpToProp);
  }, [jumpToProp?.messageId, jumpToProp?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  const { loadUntil } = state;
  useEffect(() => {
    if (!pendingJump || state.isLoading) return;
    const { messageId, seq, phase } = pendingJump;
    if (byId.has(messageId)) {
      setPendingJump(null);
      // After the rows it needs have rendered.
      requestAnimationFrame(() => jumpTo(messageId));
      return;
    }
    if (phase === "loading") return;
    if (phase === "loaded" || seq == null) {
      setPendingJump(null);
      toast.info("That message isn't here any more");
      return;
    }
    setPendingJump({ messageId, seq, phase: "loading" });
    const settle = () => setPendingJump((p) => (p && p.messageId === messageId ? { ...p, phase: "loaded" } : p));
    void loadUntil(seq).then(settle, (e) => {
      toast.error(errorText(e));
      settle();
    });
  }, [pendingJump, byId, state.isLoading, loadUntil, jumpTo]);

  const openHit = useCallback(
    (hit: ChatSearchHit) => {
      setSearching(false);
      if (topic && topicProp === undefined) setChosenTopic(null);
      reach(hit);
    },
    [topic, topicProp, reach],
  );

  // ---- actions --------------------------------------------------------------
  const run = useCallback(async (p: Promise<unknown>, done?: string) => {
    try {
      await p;
      if (done) toast.success(done);
    } catch (e) {
      toast.error(errorText(e));
    }
  }, []);

  const ctx: ThreadContextValue = {
    me,
    resolveUser,
    role,
    isGroup,
    canModerate: role === "owner" || role === "admin",
    canPin: role === "owner" || role === "admin" || members.length === 2,
    canPost,
    pins,
    urls,
    byId,
    quickReactions,
    attachmentSlot: slots?.attachment,
    attachmentKinds,
    previews,
    emojibaseUrl,
    linkPreviewImages,
    linkPreviewProxyUrl,
    highlightedId,
    editingId,
    reply: (m) => {
      setReplyTo(m);
      composer.current?.focus();
    },
    focusComposer: () => composer.current?.focus(),
    startEdit: setEditingId,
    saveEdit: async (m, body) => {
      try {
        await actions.edit(m, body, parseMentions(body));
      } catch (e) {
        toast.error(errorText(e));
        throw e;
      }
    },
    askDelete: setConfirmDelete,
    askReport: setReporting,
    react: (m, emoji, on) => void run(actions.react(m, emoji, on)),
    pin: (m, on) => void run(actions.pin(m, on), on ? "Pinned" : "Unpinned"),
    save: (m) => void run(actions.save(m, true), "Saved"),
    copy: (m) => {
      const text = plainText(m.body);
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) void run(navigator.clipboard.writeText(text), "Copied");
      else toast.error("Copying isn't available here");
    },
    jumpTo,
    retry: (clientId) => void state.retry(clientId),
    discard: (clientId) => void state.discard(clientId),
    openThread: onOpenThread,
  };

  // ---- drag and drop --------------------------------------------------------
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const dropProps = canPost
    ? {
        onDragOver: (e: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          if (!dragging) setDragging(true);
        },
        onDragLeave: (e: DragEvent<HTMLDivElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: (e: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragging(false);
          composer.current?.addFiles(e.dataTransfer.files);
        },
      }
    : {};

  // ---- render ---------------------------------------------------------------
  const pinnedMessage = pinIds.length ? byId.get(pinIds[pinIds.length - 1]!) : undefined;
  let body: ReactNode;
  if (state.isLoading) {
    body = (
      <div className="flex flex-col gap-3 p-4" aria-busy aria-label="Loading messages" data-testid="genesis-chat-thread-loading">
        {[40, 60, 30, 50].map((w, i) => (
          <Skeleton key={i} className={cn("h-9 rounded-2xl", i % 2 ? "self-end" : "self-start")} style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  } else if (state.error && items.length === 0) {
    body = (
      <EmptyState
        icon={MessageSquare}
        title="Couldn't load this conversation"
        description={errorText(state.error)}
        action={
          <Button type="button" variant="outline" onClick={() => void state.refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else if (items.length === 0) {
    body = renderSlot(DefaultEmpty, slots?.empty, { conversationId, canPost });
  } else {
    body = (
      <div ref={content} className="flex min-h-full flex-col justify-end pb-2 pt-1">
        {hasEarlier ? (
          <div className="flex justify-center py-2">
            {loadingEarlier ? (
              <Spinner size="sm" aria-label="Loading earlier messages" />
            ) : (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={loadOlder}>
                Load earlier messages
              </Button>
            )}
          </div>
        ) : null}
        {items.map((item, i) => {
          const id = item.type === "message" ? item.message.id : null;
          return (
            <div key={itemKey(item)}>
              {startsDay(items, i) ? (
                <div className="sticky top-1 z-10 flex justify-center py-2" role="separator" aria-label={dayLabel(itemTime(item))}>
                  <span className="rounded-full border bg-background/95 px-3 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">{dayLabel(itemTime(item))}</span>
                </div>
              ) : null}
              {id && id === state.firstUnreadId ? (
                <div className="my-2 flex items-center gap-2 px-4" role="separator" aria-label="New messages" data-testid="genesis-chat-new-line">
                  <span className="h-px flex-1 bg-primary/40" />
                  <span className="text-xs font-semibold text-primary">New</span>
                  <span className="h-px flex-1 bg-primary/40" />
                </div>
              ) : null}
              <ChatErrorBoundary
                fallback={
                  <p className="px-4 py-1 text-xs italic text-muted-foreground" role="note" data-testid="genesis-chat-row-error">
                    This message couldn't be shown.
                  </p>
                }
              >
                <MessageRow item={item} startsGroup={startsGroup(items, i)} />
              </ChatErrorBoundary>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <ThreadContext.Provider value={ctx}>
      <section
        className={cn("relative flex h-full min-h-0 flex-col bg-background", className)}
        aria-label={title}
        data-testid="genesis-chat-thread"
        {...dropProps}
      >
        {renderSlot(DefaultHeader, slots?.header, {
          conversationId,
          conversation,
          title,
          subtitle,
          activity: live,
          otherUserId,
          members,
          role,
          resolveUser,
          onBack,
          backClassName,
          onSearch: search && !threadRootId ? () => setSearching(true) : undefined,
        })}
        {showTopicBar ? (
          <ChatTopicBar
            topics={topics}
            value={topic ?? null}
            onValueChange={setChosenTopic}
            canManage={canManageTopics}
            onSetTopic={topicsState.setTopic}
          />
        ) : null}
        {awayPeople ? <ChatAwayBanner people={awayPeople} /> : null}
        {pinnedMessage ? (
          <button
            type="button"
            onClick={() => jumpTo(pinnedMessage.id)}
            className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-label={`Pinned message: ${previewText(pinnedMessage.body, pinnedMessage.attachments[0]?.kind ?? null, Boolean(pinnedMessage.deletedAt))}. Show it`}
          >
            <Pin className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{previewText(pinnedMessage.body, pinnedMessage.attachments[0]?.kind ?? null, Boolean(pinnedMessage.deletedAt))}</span>
            {pinIds.length > 1 ? <span className="ml-auto shrink-0 text-muted-foreground">+{pinIds.length - 1}</span> : null}
          </button>
        ) : null}

        <div className="relative min-h-0 flex-1">
          {/* A plain scroller, not ScrollArea: the thread sets scrollTop to keep your place as earlier messages load, and needs the element that scrolls. */}
          <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain" role="log" aria-live="off" aria-label="Messages" data-testid="genesis-chat-scroller">
            {body}
          </div>
          {newCount > 0 ? (
            <Button
              type="button"
              size="sm"
              className="absolute bottom-3 left-1/2 h-8 -translate-x-1/2 rounded-full shadow-md"
              onClick={() => scrollToBottom(true)}
              data-testid="genesis-chat-new-pill"
            >
              New messages <ArrowDown />
            </Button>
          ) : null}
          {dragging ? (
            <div className="pointer-events-none absolute inset-2 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background/90 text-sm font-medium text-primary">
              <ImagePlus className="size-6" aria-hidden />
              Drop to attach
            </div>
          ) : null}
        </div>

        <div className="h-5 px-4 text-xs italic text-muted-foreground" data-testid="genesis-chat-activity">
          {live ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex gap-0.5" aria-hidden>
                <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="size-1 animate-bounce rounded-full bg-muted-foreground" />
              </span>
              {live}
            </span>
          ) : null}
        </div>
        <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="genesis-chat-announcer">
          {announcement}
        </div>

        <ChatComposer
          ref={composer}
          conversation={state}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          resolveUser={resolveUser}
          placeholder={currentTopic ? `Message #${currentTopic.title}` : placeholder}
          topic={topic ?? null}
          disabledReason={topicClosed ? "This topic is closed" : null}
          scheduling={scheduling}
          emojibaseUrl={emojibaseUrl}
          accessory={renderSlot(EmptyAccessory, slots?.composerAccessory, {
            conversationId,
            insertText: (t) => composer.current?.insertText(t),
            addFiles: (f) => composer.current?.addFiles(f),
          })}
        />
      </section>

      {search && !threadRootId ? (
        <Sheet open={searching} onOpenChange={setSearching}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>Search</SheetTitle>
              <SheetDescription className="sr-only">Search this conversation and jump to a message.</SheetDescription>
            </SheetHeader>
            <ChatSearch conversationId={conversationId} resolveUser={resolveUser} onOpen={openHit} autoFocus className="min-h-0 flex-1" />
          </SheetContent>
        </Sheet>
      ) : null}

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.senderId === me ? "It's deleted for everyone in the conversation." : "It's deleted for everyone in the conversation, including the person who sent it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const m = confirmDelete;
                setConfirmDelete(null);
                if (m) void run(actions.remove(m));
              }}
              data-testid="genesis-chat-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReportDialog
        message={reporting}
        onClose={() => setReporting(null)}
        onSubmit={async (m, reason, note) => {
          await run(actions.report(m, reason, note || undefined), "Reported. Thank you.");
          setReporting(null);
        }}
      />
    </ThreadContext.Provider>
  );
}

function EmptyAccessory(_props: ChatComposerAccessoryProps) {
  return null;
}

function ReportDialog({
  message,
  onClose,
  onSubmit,
}: {
  message: ChatMessage | null;
  onClose: () => void;
  onSubmit: (m: ChatMessage, reason: ReportReason, note: string) => Promise<void>;
}) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (message) {
      setReason("spam");
      setNote("");
    }
  }, [message]);
  return (
    <Dialog open={message !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report this message</DialogTitle>
          <DialogDescription>The people who look after this conversation see your report and the messages around it.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={(v) => setReason(v as ReportReason)} aria-label="Reason">
          {REPORT_REASONS.map((r) => (
            <div key={r.value} className="flex items-center gap-2">
              <RadioGroupItem value={r.value} id={`genesis-chat-report-${r.value}`} />
              <Label htmlFor={`genesis-chat-report-${r.value}`}>{r.label}</Label>
            </div>
          ))}
        </RadioGroup>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything else? (optional)" aria-label="Details" maxLength={1000} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            loading={busy}
            onClick={async () => {
              if (!message) return;
              setBusy(true);
              try {
                await onSubmit(message, reason, note.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
