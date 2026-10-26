/**
 * @feat:chat
 * One row of a thread: a system line, or a bubble (yours on the right in the
 * primary colour, theirs on the left), with its reply quote, body, attachments,
 * time and edited marker, reactions, and actions on hover, right-click or
 * long-press. Pending messages show "Sending…"; failed ones offer Retry and
 * Delete.
 */
import { useEffect, useRef, useState, type ComponentType, type MutableRefObject, type ReactNode } from "react";
import {
  AlertCircle,
  Ban,
  Bookmark,
  Clock,
  Copy,
  EyeOff,
  Flag,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Reply,
  ShieldAlert,
  SmilePlus,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
  Tooltip,
  UserAvatar,
  cn,
} from "@marktiderman/genesis-ui";
import { attachmentKindFor } from "../core/media";
import type { QueuedMessage } from "../core/outbox";
import { previewText, summarizeReactions, type ThreadItem } from "../core/thread";
import type { ChatMessage, PendingMessage } from "../core/types";
import { MessageAttachments, toAttachmentView, type AttachmentView } from "./attachments";
import { ChatLinkPreview } from "./cards";
import { ChatEmojiPicker, canPickEmoji } from "./emoji-picker";
import { clockTime, messageLabel } from "./format";
import { ChatMarkdown } from "./markdown";
import { useThreadContext } from "./thread-context";

export interface MessageRowProps {
  item: ThreadItem;
  /** First of a run from one sender: the name and avatar show (others' messages, in groups). */
  startsGroup: boolean;
  className?: string;
}

/** The pending message as a message, so one bubble draws both. */
function pendingAsMessage(p: PendingMessage): ChatMessage {
  return {
    id: `pending:${p.clientId}`,
    conversationId: p.input.conversationId,
    seq: Number.MAX_SAFE_INTEGER,
    clientId: p.clientId,
    senderId: p.senderId,
    senderRole: "member",
    kind: "text",
    body: p.input.body ?? "",
    mentions: p.input.mentions ?? [],
    replyToId: p.input.replyToId ?? null,
    threadRootId: p.input.threadRootId ?? null,
    threadCount: 0,
    threadLastAt: null,
    topic: p.input.topic ?? null,
    visibility: p.input.visibility ?? "everyone",
    silent: Boolean(p.input.silent),
    meta: {},
    createdAt: p.createdAt,
    editedAt: null,
    deletedAt: null,
    moderation: null,
    attachments: [],
    reactions: [],
  };
}

function pendingViews(p: PendingMessage): AttachmentView[] {
  const files = (p as Partial<QueuedMessage>).files ?? [];
  return files.map((f, i) => ({
    key: `${p.clientId}:${i}`,
    kind: f.meta?.kind ?? attachmentKindFor(f.contentType),
    url: p.previews?.[i] ?? f.previewUrl ?? null,
    posterUrl: null,
    name: f.meta?.name ?? f.name,
    mime: f.contentType,
    bytes: f.meta?.bytes ?? (typeof Blob !== "undefined" && f.data instanceof Blob ? f.data.size : null),
    width: f.meta?.width ?? null,
    height: f.meta?.height ?? null,
    durationMs: f.meta?.durationMs ?? null,
    waveform: f.meta?.waveform ?? null,
    transcript: null,
    transcriptStatus: null,
    pending: p.status === "sending",
  }));
}

/** A menu gives focus back to what opened it, unless the action put it somewhere (the composer, the edit box). */
function returnFocus(e: Event, keepFocus: MutableRefObject<(() => void) | null>) {
  const next = keepFocus.current;
  if (next) {
    e.preventDefault();
    keepFocus.current = null;
    next();
  }
}

/** Plain text for the clipboard: mentions as @Name. */
export function plainText(body: string): string {
  return body.replace(/@\[([^\]]+)\]\(user:[0-9a-f-]{36}\)/gi, "@$1");
}

export function MessageRow({ item, startsGroup, className }: MessageRowProps) {
  const ctx = useThreadContext();
  const keepFocus = useRef<(() => void) | null>(null);
  const pending = item.type === "pending" ? item.pending : null;
  const message = item.type === "message" ? item.message : pendingAsMessage(item.pending);

  if (message.kind === "system") {
    return (
      <div className={cn("flex justify-center px-4 py-1", className)} role="note" data-testid="genesis-chat-system">
        <span className="max-w-[85%] rounded-full bg-muted px-3 py-1 text-center text-xs text-muted-foreground">
          <ChatMarkdown text={message.body} me={ctx.me} />
        </span>
      </div>
    );
  }

  const mine = message.senderId === ctx.me;
  const sender = message.senderId ? ctx.resolveUser(message.senderId) : { name: "Someone" };
  const deleted = Boolean(message.deletedAt);
  const note = message.visibility === "observers";
  const showHeader = ctx.isGroup && !mine && startsGroup;
  const tone: "default" | "primary" = mine && !note && !deleted ? "primary" : "default";
  const views = pending ? pendingViews(pending) : message.attachments.map((a) => toAttachmentView(a, ctx.urls));
  const editing = ctx.editingId === message.id;
  const reactions = pending ? [] : summarizeReactions(message, ctx.me);
  const highlighted = ctx.highlightedId === message.id;
  const actionable = !pending && !deleted;
  const hidden = !deleted && message.moderation === "hidden";
  const flagged = !deleted && message.moderation === "flagged";
  const observer = ctx.role === "observer";
  // One preview per message, iMessage-style: the first link the server has fetched.
  const preview = !pending && !deleted && !hidden && message.body ? ctx.previews[message.id]?.[0] : undefined;

  const bubble = (
    <div
      className={cn(
        "relative min-w-0 max-w-full rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm transition-shadow",
        tone === "primary" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        mine ? (startsGroup ? "rounded-tr-md" : "") : startsGroup ? "rounded-tl-md" : "",
        note && "border border-warning/50 bg-warning/15 text-foreground",
        deleted && "border border-dashed bg-transparent text-muted-foreground shadow-none",
        highlighted && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        pending?.status === "failed" && "opacity-80",
        hidden && "opacity-70",
      )}
      data-testid={deleted ? "genesis-chat-deleted" : note ? "genesis-chat-note" : mine ? "genesis-chat-mine" : "genesis-chat-theirs"}
    >
      {note ? (
        <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-foreground/80">
          <Lock className="size-3" aria-hidden /> Internal note
        </div>
      ) : null}
      {deleted ? (
        <span className="flex items-center gap-1.5 italic">
          <Ban className="size-3.5" aria-hidden /> Message deleted
        </span>
      ) : editing ? (
        <EditBox message={message} />
      ) : (
        <>
          {message.replyToId ? <ReplyQuote id={message.replyToId} tone={tone} /> : null}
          {views.length ? (
            <div className={cn(message.body ? "mb-1.5" : "")}>
              <MessageAttachments views={views} message={pending ? undefined : message} mine={mine} tone={tone} slot={ctx.attachmentSlot} kinds={ctx.attachmentKinds} />
            </div>
          ) : null}
          {message.body ? <ChatMarkdown text={message.body} me={ctx.me} tone={tone} /> : null}
          {preview ? <ChatLinkPreview preview={preview} images={ctx.linkPreviewImages} proxyUrl={ctx.linkPreviewProxyUrl} tone={tone} /> : null}
          {hidden && mine && !observer ? (
            <span className="mt-1 flex items-center gap-1 text-xs font-medium" data-testid="genesis-chat-hidden-notice">
              <EyeOff className="size-3" aria-hidden /> Hidden by moderation. Only you can see it.
            </span>
          ) : null}
          <Meta message={message} pending={pending} tone={tone} />
        </>
      )}
    </div>
  );

  return (
    <article
      id={`genesis-chat-msg-${message.id}`}
      data-message-id={pending ? undefined : message.id}
      aria-label={`${messageLabel(message, mine ? "You" : sender.name)}${hidden ? " (hidden by moderation)" : flagged && observer ? " (flagged)" : ""}`}
      className={cn("group/msg flex gap-2 px-3", mine ? "flex-row-reverse" : "flex-row", startsGroup ? "mt-2" : "mt-0.5", className)}
      data-testid={pending ? `genesis-chat-pending-${pending.status}` : "genesis-chat-message"}
    >
      {ctx.isGroup && !mine ? (
        showHeader ? (
          <UserAvatar name={sender.name} src={sender.avatarUrl} size="sm" className="mt-5" />
        ) : (
          <span className="w-8 shrink-0" aria-hidden />
        )
      ) : null}
      <div className={cn("flex min-w-0 max-w-[min(78%,36rem)] flex-col", mine ? "items-end" : "items-start")}>
        {showHeader ? <span className="mb-0.5 px-3 text-xs font-medium text-muted-foreground">{sender.name}</span> : null}
        {observer && (hidden || flagged) ? (
          <Badge
            variant={hidden ? "destructive" : "outline"}
            className="mb-0.5 gap-1 px-1.5 py-0 text-[10px]"
            data-testid={hidden ? "genesis-chat-moderation-hidden" : "genesis-chat-moderation-flagged"}
          >
            {hidden ? <EyeOff className="size-3" aria-hidden /> : <ShieldAlert className="size-3" aria-hidden />}
            {hidden ? "Hidden by moderation" : "Flagged"}
          </Badge>
        ) : null}
        <div className={cn("flex max-w-full items-center gap-1", mine ? "flex-row-reverse" : "flex-row")}>
          {actionable ? (
            <ContextMenu>
              <ContextMenuTrigger asChild>{bubble}</ContextMenuTrigger>
              <ContextMenuContent className="w-56" onCloseAutoFocus={(e) => returnFocus(e, keepFocus)}>
                <ActionItems message={message} mine={mine} keepFocus={keepFocus} Item={ContextMenuItem} Separator={ContextMenuSeparator} />
              </ContextMenuContent>
            </ContextMenu>
          ) : (
            bubble
          )}
          {actionable && !editing ? <HoverBar message={message} mine={mine} /> : null}
        </div>
        {reactions.length ? (
          <div className={cn("-mt-1 flex flex-wrap gap-1 px-2", mine ? "justify-end" : "justify-start")} data-testid="genesis-chat-reactions">
            {reactions.map((r) => (
              <Tooltip key={r.emoji} content={r.userIds.map((u) => (u === ctx.me ? "You" : ctx.resolveUser(u).name)).join(", ")}>
                <button
                  type="button"
                  aria-pressed={r.mine}
                  aria-label={`${r.emoji} ${r.count}${r.mine ? ", including you" : ""}. ${r.mine ? "Remove" : "Add"} your reaction`}
                  onClick={() => ctx.react(message, r.emoji, !r.mine)}
                  disabled={!ctx.canPost}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-full border bg-background px-2 text-xs shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none",
                    r.mine && "border-primary bg-primary/10 text-primary",
                  )}
                  data-testid={`genesis-chat-reaction-${r.emoji}`}
                >
                  <span aria-hidden>{r.emoji}</span>
                  <span className="tabular-nums" aria-hidden>
                    {r.count}
                  </span>
                </button>
              </Tooltip>
            ))}
          </div>
        ) : null}
        {!pending && message.threadCount > 0 && ctx.openThread ? (
          <Button type="button" variant="link" size="sm" className="h-6 px-2 text-xs" onClick={() => ctx.openThread?.(message)}>
            <MessageSquare className="size-3" aria-hidden />
            {message.threadCount === 1 ? "1 reply" : `${message.threadCount} replies`}
          </Button>
        ) : null}
        {pending?.status === "failed" ? (
          <div className="mt-1 flex items-center gap-1 text-xs text-destructive" role="alert">
            <AlertCircle className="size-3.5" aria-hidden />
            <span>Not sent{pending.error && pending.error !== "Not sent" ? `: ${pending.error}` : ""}</span>
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => ctx.retry(pending.clientId)} data-testid="genesis-chat-retry">
              Retry
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive" onClick={() => ctx.discard(pending.clientId)} data-testid="genesis-chat-discard">
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Meta({ message, pending, tone }: { message: ChatMessage; pending: PendingMessage | null; tone: "default" | "primary" }) {
  const muted = tone === "primary" ? "text-primary-foreground/75" : "text-muted-foreground";
  return (
    <span className={cn("float-right ml-3 mt-1 flex translate-y-1 items-center gap-1 text-[11px] leading-none", muted)}>
      {message.editedAt ? <span>edited</span> : null}
      {pending?.status === "sending" ? (
        <>
          <Clock className="size-3" aria-hidden />
          <span>Sending…</span>
        </>
      ) : pending?.status === "failed" ? (
        <AlertCircle className="size-3" aria-label="Not sent" />
      ) : (
        <time dateTime={message.createdAt}>{clockTime(message.createdAt)}</time>
      )}
    </span>
  );
}

function ReplyQuote({ id, tone }: { id: string; tone: "default" | "primary" }) {
  const ctx = useThreadContext();
  const original = ctx.byId.get(id);
  const who = original?.senderId ? (original.senderId === ctx.me ? "You" : ctx.resolveUser(original.senderId).name) : null;
  const text = original ? previewText(original.body, original.attachments[0]?.kind ?? null, Boolean(original.deletedAt)) : "Earlier message";
  return (
    <button
      type="button"
      onClick={() => ctx.jumpTo(id)}
      className={cn(
        "mb-1.5 block w-full min-w-0 rounded-md border-l-4 px-2 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone === "primary" ? "border-primary-foreground/60 bg-primary-foreground/15" : "border-primary bg-background/60",
      )}
      aria-label={`Replying to ${who ?? "a message"}: ${text}. Show it`}
      data-testid="genesis-chat-reply-quote"
    >
      {who ? <span className="block font-semibold">{who}</span> : null}
      <span className="line-clamp-2 opacity-80">{text}</span>
    </button>
  );
}

function EditBox({ message }: { message: ChatMessage }) {
  const ctx = useThreadContext();
  const [value, setValue] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const save = async () => {
    const body = value.trim();
    if (!body || body === message.body) return ctx.startEdit(null);
    setBusy(true);
    try {
      await ctx.saveEdit(message, body);
      ctx.startEdit(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-w-[16rem] flex-col gap-2">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            ctx.startEdit(null);
          } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          }
        }}
        id={`genesis-chat-edit-${message.id}`}
        aria-label="Edit message"
        className="min-h-[60px] resize-none bg-background text-foreground"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => ctx.startEdit(null)} className={cn("h-7", "text-current")}>
          Cancel
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => void save()} loading={busy} className="h-7">
          Save
        </Button>
      </div>
    </div>
  );
}

type ItemComponent = ComponentType<{ onSelect?: (e: Event) => void; className?: string; children?: ReactNode; "data-testid"?: string; "aria-label"?: string }>;

interface ActionItemsProps {
  message: ChatMessage;
  /** Set when the picked action moves focus itself (Reply, Edit), so the menu doesn't take it back. */
  keepFocus: MutableRefObject<(() => void) | null>;
  mine: boolean;
  Item: ItemComponent;
  Separator: ComponentType<{ className?: string }>;
}

/** The actions menu, the same in the right-click menu and the "More" menu. */
function ActionItems({ message, mine, keepFocus, Item, Separator }: ActionItemsProps) {
  const ctx = useThreadContext();
  const pinned = ctx.pins.has(message.id);
  const canDelete = mine || ctx.canModerate;
  const canEdit = mine && message.kind === "text" && message.body.length > 0;
  return (
    <>
      {ctx.canPost ? (
        <>
          <div className="flex justify-between gap-0.5 px-1 py-1" role="group" aria-label="React">
            {ctx.quickReactions.map((emoji) => {
              const on = message.reactions.some((r) => r.emoji === emoji && r.userId === ctx.me);
              return (
                <Item
                  key={emoji}
                  className={cn("justify-center rounded-full px-2 text-lg", on && "bg-primary/10")}
                  onSelect={() => ctx.react(message, emoji, !on)}
                  aria-label={`${on ? "Remove" : "React with"} ${emoji}`}
                >
                  {emoji}
                </Item>
              );
            })}
          </div>
          <Separator />
          <Item className="gap-2" onSelect={() => { keepFocus.current = ctx.focusComposer; ctx.reply(message); }}>
            <Reply className="size-4" aria-hidden /> Reply
          </Item>
        </>
      ) : null}
      {message.body ? (
        <Item className="gap-2" onSelect={() => ctx.copy(message)}>
          <Copy className="size-4" aria-hidden /> Copy text
        </Item>
      ) : null}
      {canEdit && ctx.canPost ? (
        <Item className="gap-2" onSelect={() => { keepFocus.current = () => document.getElementById(`genesis-chat-edit-${message.id}`)?.focus(); ctx.startEdit(message.id); }}>
          <Pencil className="size-4" aria-hidden /> Edit
        </Item>
      ) : null}
      {ctx.canPin ? (
        <Item className="gap-2" onSelect={() => ctx.pin(message, !pinned)}>
          {pinned ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />} {pinned ? "Unpin" : "Pin"}
        </Item>
      ) : null}
      <Item className="gap-2" onSelect={() => ctx.save(message)}>
        <Bookmark className="size-4" aria-hidden /> Save
      </Item>
      {!mine && message.senderId ? (
        <Item className="gap-2" onSelect={() => ctx.askReport(message)}>
          <Flag className="size-4" aria-hidden /> Report
        </Item>
      ) : null}
      {canDelete ? (
        <>
          <Separator />
          <Item onSelect={() => ctx.askDelete(message)} className="gap-2 text-destructive focus:text-destructive">
            <Trash2 className="size-4" aria-hidden /> Delete
          </Item>
        </>
      ) : null}
    </>
  );
}

/** Desktop: a small bar beside the bubble on hover or focus (React, Reply, More). Touch uses long-press. */
function HoverBar({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const ctx = useThreadContext();
  const keepFocus = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState<"react" | "more" | null>(null);
  const [full, setFull] = useState(false);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100 [@media(hover:none)]:hidden",
        open && "opacity-100",
        mine ? "flex-row-reverse" : "flex-row",
      )}
    >
      {ctx.canPost ? (
        <Popover
          open={open === "react"}
          onOpenChange={(o) => {
            setOpen(o ? "react" : null);
            if (!o) setFull(false);
          }}
        >
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full text-muted-foreground" aria-label="React">
              <SmilePlus />
            </Button>
          </PopoverTrigger>
          {full ? (
            <PopoverContent side="top" align={mine ? "end" : "start"} className="w-auto overflow-hidden p-0">
              <ChatEmojiPicker
                emojibaseUrl={ctx.emojibaseUrl}
                onSelect={(emoji) => {
                  const on = message.reactions.some((r) => r.emoji === emoji && r.userId === ctx.me);
                  ctx.react(message, emoji, !on);
                  setOpen(null);
                  setFull(false);
                }}
              />
            </PopoverContent>
          ) : (
          <PopoverContent side="top" align={mine ? "end" : "start"} className="flex w-auto gap-0.5 rounded-full p-1">
            {ctx.quickReactions.map((emoji) => {
              const on = message.reactions.some((r) => r.emoji === emoji && r.userId === ctx.me);
              return (
                <button
                  key={emoji}
                  type="button"
                  className={cn("flex size-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on && "bg-primary/10")}
                  aria-label={`${on ? "Remove" : "React with"} ${emoji}`}
                  aria-pressed={on}
                  onClick={() => {
                    ctx.react(message, emoji, !on);
                    setOpen(null);
                  }}
                >
                  {emoji}
                </button>
              );
            })}
            {canPickEmoji(ctx.emojibaseUrl) ? (
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="More reactions"
                onClick={() => setFull(true)}
                data-testid="genesis-chat-more-reactions"
              >
                <Plus className="size-4" />
              </button>
            ) : null}
          </PopoverContent>
          )}
        </Popover>
      ) : null}
      {ctx.canPost ? (
        <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full text-muted-foreground" aria-label="Reply" onClick={() => ctx.reply(message)}>
          <Reply />
        </Button>
      ) : null}
      <DropdownMenu open={open === "more"} onOpenChange={(o) => setOpen(o ? "more" : null)}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full text-muted-foreground" aria-label="More actions" data-testid="genesis-chat-more">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={mine ? "end" : "start"} className="w-56" onCloseAutoFocus={(e) => returnFocus(e, keepFocus)}>
          <ActionItems message={message} mine={mine} keepFocus={keepFocus} Item={DropdownMenuItem} Separator={DropdownMenuSeparator} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

