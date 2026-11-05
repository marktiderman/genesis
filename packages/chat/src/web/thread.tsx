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
 *
 * On genesis-ui's `ThreadPage`, which owns the scrolling, the list, going to a message and the pill
 * back to the newest. This screen keeps its data wiring (the chat client, realtime, read state) and
 * draws chat's rows and composer in the page's slots.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type DragEvent,
  type Ref,
} from "react";
import { ArrowLeft, ImagePlus, MessageSquare, Pin, Search } from "lucide-react";
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
  Textarea,
  ThreadPage,
  UserAvatar,
  cn,
  toast,
  type ThreadPageSlotMap,
} from "@marktiderman/genesis-ui";
import type { ThreadMessage } from "@marktiderman/genesis-core/conversation";
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
import { ChatComposer, type ChatComposerHandle, type ChatComposerProps } from "./composer";
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
  /**
   * Mark messages read as they arrive. Default true; false while the thread is mounted but out of
   * sight (a minimized dock window), so it keeps its draft without reading behind anyone's back.
   */
  markRead?: boolean;
  /**
   * Focus the composer whenever this turns true (a dock window opened or restored). Default false.
   */
  autoFocus?: boolean;
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

/** What chat adds to a ThreadPage row, carried on the row itself: the page hands it on to the slot. */
interface ChatThreadRow extends ThreadMessage {
  item: ThreadItem;
  startsGroup: boolean;
  /** Heads a new day. */
  day: string | null;
  firstUnread: boolean;
}

function ChatRowSlot(row: ChatThreadRow & { highlighted?: boolean }) {
  return (
    // ThreadPage spaces and insets its own bubbles; chat's row does both itself.
    <div className="-mx-3 -my-1">
      {row.day ? (
        <div className="sticky top-1 z-10 flex justify-center py-2" role="separator" aria-label={row.day}>
          <span className="rounded-full border bg-background/95 px-3 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">{row.day}</span>
        </div>
      ) : null}
      {row.firstUnread ? (
        <div className="my-2 flex items-center gap-2 px-4" role="separator" aria-label="New messages" data-testid="genesis-chat-new-line">
          <span className="h-px flex-1 bg-primary/40" />
          <span className="text-xs font-semibold text-primary-text">New</span>
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
        <MessageRow item={row.item} startsGroup={row.startsGroup} highlighted={Boolean(row.highlighted)} />
      </ChatErrorBoundary>
    </div>
  );
}

interface ChatComposerSlotExtras {
  chatComposer: ChatComposerProps;
  composerRef: Ref<ChatComposerHandle>;
  /** "Sam is typing…" */
  live: string | null;
}

function ChatComposerSlot({ onSend, chatComposer, composerRef, live }: ThreadPageSlotMap["composer"] & ChatComposerSlotExtras) {
  return (
    <>
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
      {/* ThreadPage's onSend goes to the newest message: what you send is what you look at next. */}
      <ChatComposer {...chatComposer} ref={composerRef} onSent={onSend} />
    </>
  );
}

interface ChatEmptySlotExtras {
  override: SlotOverride<ChatThreadEmptyProps> | undefined;
  conversationId: string;
  canPost: boolean;
  failed: string | null;
  onRetry: () => void;
}

function ChatEmptySlot({ override, conversationId, canPost, failed, onRetry }: ThreadPageSlotMap["empty"] & ChatEmptySlotExtras) {
  if (failed) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Couldn't load this conversation"
        description={failed}
        action={
          <Button type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }
  return <>{renderSlot(DefaultEmpty, override, { conversationId, canPost })}</>;
}

// Module scope: a new slot each render would remount every row. The extras chat's slots take come
// through the row and `slotProps`, which the page's own types don't know.
const THREAD_SLOTS = {
  message: ChatRowSlot,
  event: ChatRowSlot,
  // Chat's row draws it, under the day heading.
  unreadDivider: null,
  composer: ChatComposerSlot,
  empty: ChatEmptySlot,
} as unknown as NonNullable<ComponentProps<typeof ThreadPage>["slots"]>;

// Chat's composer keeps its own text and sends for itself.
const THREAD_COMPOSER = { value: "", onChangeText: () => undefined, onSend: () => undefined };
const GONE = "That message isn't here any more";

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
  markRead = true,
  autoFocus = false,
  className,
}: ChatThreadProps) {
  const { userId: me, attachmentKinds, client: chatClient } = useChat();
  const topicsState = useTopics(threadRootId ? null : conversationId);
  const [chosenTopic, setChosenTopic] = useState<string | null>(null);
  const topic = topicProp ?? chosenTopic ?? undefined;
  const state = useConversation(conversationId, { threadRootId, topic, markRead });
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
  const [confirmDelete, setConfirmDelete] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [dragging, setDragging] = useState(false);
  const composer = useRef<ChatComposerHandle | null>(null);
  useEffect(() => {
    if (!autoFocus) return;
    // After the frame that shows it: a window just restored from `hidden` can't take focus before.
    const id = requestAnimationFrame(() => composer.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [autoFocus]);

  // A different conversation starts clean.
  useEffect(() => {
    setReplyTo(null);
    setEditingId(null);
    setChosenTopic(null);
    setJump(null);
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

  // Someone who just posted has stopped typing: their last signal no longer counts, and the line
  // above the composer is worked out again now.
  const lastItem = items[items.length - 1];
  const lastKey = lastItem ? itemKey(lastItem) : null;
  const seenLast = useRef(lastKey);
  const [, noteArrival] = useState(0);
  useLayoutEffect(() => {
    if (lastKey === seenLast.current) return;
    seenLast.current = lastKey;
    if (lastItem?.type === "message" && lastItem.message.kind !== "system" && lastItem.message.senderId && lastItem.message.senderId !== me) {
      arrived.current.set(lastItem.message.senderId, Date.now());
      noteArrival((n) => n + 1);
    }
  }, [lastKey, lastItem, me]);

  // ---- rows -----------------------------------------------------------------
  const firstUnreadId = state.firstUnreadId;
  const rows = useMemo<ChatThreadRow[]>(
    () =>
      items.map((item, i) => {
        const message = item.type === "message" ? item.message : null;
        const sender = itemSender(item);
        return {
          // The client's id, so a message that lands keeps its row; a jump names the server's.
          id: itemKey(item),
          ...(message ? { jumpId: message.id } : {}),
          ...(message?.kind === "system" ? { kind: "event" as const } : {}),
          // Plain text: only the list's announcement reads it, and the slot draws the row.
          body: message ? previewText(message.body, message.attachments[0]?.kind ?? null, Boolean(message.deletedAt)) : "",
          mine: sender === me,
          ...(sender && sender !== me ? { authorName: resolveUser(sender).name } : {}),
          timestamp: itemTime(item),
          item,
          startsGroup: startsGroup(items, i),
          day: startsDay(items, i) ? dayLabel(itemTime(item)) : null,
          firstUnread: message !== null && message.id === firstUnreadId,
        };
      }),
    [items, me, resolveUser, firstUnreadId],
  );
  const firstUnreadRow = rows.find((r) => r.firstUnread)?.id ?? null;

  const { hasEarlier, loadingEarlier, loadEarlier } = state;
  const loadOlder = useCallback(() => {
    void loadEarlier().catch((e) => toast.error(errorText(e)));
  }, [loadEarlier]);

  // ---- going to a message ---------------------------------------------------
  // Cleared first, so going to the same message again goes again.
  const [jump, setJump] = useState<{ messageId: string; seq?: number } | null>(null);
  const goTo = useCallback((target: { messageId: string; seq?: number }) => {
    setJump(null);
    requestAnimationFrame(() => setJump(target));
  }, []);

  const jumpTo = useCallback(
    (id: string) => {
      if (byId.has(id)) goTo({ messageId: id });
      else toast.info("That message is further up", { description: "Scroll up to load it." });
    },
    [byId, goTo],
  );

  /**
   * A reply in a thread isn't on this timeline: open its thread (onOpenThread, scrolled to the
   * reply) and come here to the thread's first message; without onOpenThread, just to that.
   */
  const reach = useCallback(
    (target: { messageId: string; seq?: number; threadRootId?: string | null }) => {
      const root = target.threadRootId;
      if (!root || root === threadRootId || root === target.messageId) {
        goTo({ messageId: target.messageId, ...(target.seq != null ? { seq: target.seq } : {}) });
        return;
      }
      void chatClient.message(root).then(
        (m) => {
          if (!m) {
            toast.info(GONE);
            return;
          }
          onOpenThread?.(m, target.seq != null ? { jumpTo: { messageId: target.messageId, seq: target.seq } } : undefined);
          goTo({ messageId: m.id, seq: m.seq });
        },
        (e) => toast.error(errorText(e)),
      );
    },
    [chatClient, goTo, onOpenThread, threadRootId],
  );
  useEffect(() => {
    if (jumpToProp) reach(jumpToProp);
  }, [jumpToProp?.messageId, jumpToProp?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Messages, not rows: a saved outbox row is drawn even when nothing could be read.
  const firstPageFailed = Boolean(state.error) && messages.length === 0;
  const { loadUntil } = state;
  // A load that failed has said so: the message isn't known to be gone.
  const jumpLoadFailed = useRef(false);
  const onLoadUntil = useCallback(
    (id: string) => {
      jumpLoadFailed.current = false;
      if (jump?.messageId !== id || jump.seq == null) return Promise.resolve(false);
      return loadUntil(jump.seq).catch((e) => {
        jumpLoadFailed.current = true;
        toast.error(errorText(e));
        return false;
      });
    },
    [jump, loadUntil],
  );
  const onJumpFailed = useCallback(() => {
    if (jumpLoadFailed.current) jumpLoadFailed.current = false;
    else toast.info(GONE);
  }, []);

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
    highlightedId: null,
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
            <Pin className="size-3.5 shrink-0 text-primary-text" aria-hidden />
            <span className="truncate">{previewText(pinnedMessage.body, pinnedMessage.attachments[0]?.kind ?? null, Boolean(pinnedMessage.deletedAt))}</span>
            {pinIds.length > 1 ? <span className="ml-auto shrink-0 text-muted-foreground">+{pinIds.length - 1}</span> : null}
          </button>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <ThreadPage
            testID="genesis-chat-thread-page"
            conversationId={conversationId}
            messages={rows}
            composer={THREAD_COMPOSER}
            hasEarlier={hasEarlier}
            onLoadEarlier={loadOlder}
            loadingEarlier={loadingEarlier}
            firstUnreadId={firstUnreadRow}
            // Not while the first page has failed: there's nothing to look in, the empty slot says so
            // with Try again, and the jump goes ahead when the rows come.
            jumpTo={firstPageFailed ? null : (jump?.messageId ?? null)}
            onLoadUntil={onLoadUntil}
            onJumpFailed={onJumpFailed}
            loading={state.isLoading}
            slots={THREAD_SLOTS}
            slotProps={
              {
                composer: {
                  live,
                  composerRef: composer,
                  chatComposer: {
                    conversation: state,
                    replyTo,
                    onCancelReply: () => setReplyTo(null),
                    resolveUser,
                    placeholder: currentTopic ? `Message #${currentTopic.title}` : placeholder,
                    topic: topic ?? null,
                    disabledReason: topicClosed ? "This topic is closed" : null,
                    scheduling,
                    emojibaseUrl,
                    accessory: renderSlot(EmptyAccessory, slots?.composerAccessory, {
                      conversationId,
                      insertText: (t) => composer.current?.insertText(t),
                      addFiles: (f) => composer.current?.addFiles(f),
                    }),
                  },
                },
                empty: {
                  override: slots?.empty,
                  conversationId,
                  canPost,
                  failed: state.error ? errorText(state.error) : null,
                  onRetry: () => void state.refetch(),
                },
              } as NonNullable<ComponentProps<typeof ThreadPage>["slotProps"]>
            }
            className="h-full"
          />
          {dragging ? (
            <div className="pointer-events-none absolute inset-2 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background/90 text-sm font-medium text-primary-text">
              <ImagePlus className="size-6" aria-hidden />
              Drop to attach
            </div>
          ) : null}
        </div>
      </section>

      {search && !threadRootId ? (
        <Sheet open={searching} onOpenChange={setSearching}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:max-w-md">
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
