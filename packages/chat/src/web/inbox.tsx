/**
 * @feat:chat
 * The inbox: your conversations, newest first, each a button with an avatar,
 * the title (the other person's name in a two-person conversation), a one-line
 * preview, the time, an unread count, an @ when you were mentioned, and muted
 * and pinned marks. Arrow keys move between rows.
 */
import { useRef, type KeyboardEvent } from "react";
import { AtSign, BellOff, MessageSquare, Pin } from "lucide-react";
import { Badge, Button, EmptyState, Skeleton, UserAvatar, cn } from "@marktiderman/genesis-ui";
import { renderSlot, type SlotOverride } from "@marktiderman/genesis-core/slots";
import { previewText } from "../core/thread";
import type { ChatInboxItem } from "../core/types";
import { useChat, useInbox, type ChatAttachmentKind } from "../react/index";
import { attachmentKindOf } from "./attachments";
import { relativeTime, type ResolveUser } from "./format";

export interface ChatInboxEmptyProps {
  archived: boolean;
}

export interface ChatInboxProps {
  /** Names people (the app knows them; the package doesn't). */
  resolveUser: ResolveUser;
  /** Called with a conversation's id when its row is chosen. */
  onSelect: (conversationId: string) => void;
  /** The open conversation, marked as current. */
  selectedId?: string | null;
  /** Only this kind of conversation. */
  kind?: string;
  /** The archived conversations instead. */
  archived?: boolean;
  /** A conversation's title when it has none and isn't two-person. */
  fallbackTitle?: (item: ChatInboxItem) => string;
  /** Replace or eject (`null`) the empty state. */
  slots?: { empty?: SlotOverride<ChatInboxEmptyProps> };
  "aria-label"?: string;
  className?: string;
}

function DefaultEmpty({ archived }: ChatInboxEmptyProps) {
  return (
    <EmptyState
      icon={MessageSquare}
      title={archived ? "No archived conversations" : "No conversations yet"}
      description={archived ? undefined : "When someone messages you, it shows up here."}
    />
  );
}

/** The title an inbox row shows. */
export function inboxTitle(item: ChatInboxItem, resolveUser: ResolveUser, fallback?: (item: ChatInboxItem) => string): string {
  if (item.title) return item.title;
  if (item.otherUserId) return resolveUser(item.otherUserId).name;
  return fallback?.(item) ?? "Conversation";
}

export function ChatInbox({ resolveUser, onSelect, selectedId, kind, archived = false, fallbackTitle, slots, className, ...rest }: ChatInboxProps) {
  const { userId: me, attachmentKinds } = useChat();
  const { items, isLoading, error, refetch } = useInbox({ kind, archived });
  const list = useRef<HTMLUListElement>(null);

  // Rows are native buttons (Tab reaches each); the arrows are added here
  // because no Radix primitive is a list of buttons with vertical roving focus.
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button[data-inbox-row]") ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const to =
      e.key === "ArrowDown" ? Math.min(buttons.length - 1, at + 1) : e.key === "ArrowUp" ? Math.max(0, at - 1) : e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : -2;
    if (to === -2 || buttons.length === 0) return;
    e.preventDefault();
    buttons[to < 0 ? 0 : to]?.focus();
  };

  if (isLoading) {
    return (
      <div className={cn("flex flex-col", className)} aria-busy aria-label="Loading conversations" data-testid="genesis-chat-inbox-loading">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <EmptyState
          icon={MessageSquare}
          title="Couldn't load your conversations"
          description="Check your connection and try again."
          action={
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (items.length === 0) {
    return <div className={className}>{renderSlot(DefaultEmpty, slots?.empty, { archived })}</div>;
  }

  return (
    <nav aria-label={rest["aria-label"] ?? "Conversations"} className={cn("min-h-0", className)} data-testid="genesis-chat-inbox">
      <ul ref={list} className="flex flex-col" onKeyDown={onKeyDown}>
        {items.map((item) => (
          <li key={item.conversationId}>
            <InboxRow item={item} me={me} kinds={attachmentKinds} resolveUser={resolveUser} fallbackTitle={fallbackTitle} selected={item.conversationId === selectedId} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface InboxRowProps {
  item: ChatInboxItem;
  me: string;
  kinds?: Record<string, ChatAttachmentKind>;
  resolveUser: ResolveUser;
  fallbackTitle?: (item: ChatInboxItem) => string;
  selected: boolean;
  onSelect: (id: string) => void;
}

function InboxRow({ item, me, kinds, resolveUser, fallbackTitle, selected, onSelect }: InboxRowProps) {
  const title = inboxTitle(item, resolveUser, fallbackTitle);
  const other = item.otherUserId ? resolveUser(item.otherUserId) : null;
  const last = item.lastMessage;
  const unread = item.unread > 0;
  let preview = last ? previewText(last.body, last.attachment, last.deleted) : "";
  // A message that is only an app card reads as its kind's label ("Check-in"), not "Attachment".
  const kindLabel = last?.attachment && !last.deleted && !previewText(last.body, null) ? attachmentKindOf(kinds, last.attachment)?.label : undefined;
  if (typeof kindLabel === "string" && kindLabel.trim()) preview = kindLabel.trim();
  if (last && last.kind !== "system" && !last.deleted && last.senderId) {
    if (last.senderId === me) preview = `You: ${preview}`;
    else if (!item.otherUserId && item.memberCount > 2) preview = `${resolveUser(last.senderId).name}: ${preview}`;
  }
  const time = relativeTime(item.lastMessageAt ?? last?.createdAt);
  const count = item.unread >= 99 ? "99+" : String(item.unread);
  const label = [
    title,
    unread ? `${count} unread` : null,
    item.mentioned ? "you were mentioned" : null,
    item.muted ? "muted" : null,
    item.pinned ? "pinned" : null,
    preview || null,
    time || null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      data-inbox-row
      aria-current={selected ? "true" : undefined}
      aria-label={label}
      onClick={() => onSelect(item.conversationId)}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected && "bg-accent",
      )}
      data-testid={`genesis-chat-inbox-row-${item.conversationId}`}
    >
      <UserAvatar name={title} src={other?.avatarUrl} className="shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5" aria-hidden>
        <span className="flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-semibold text-foreground" : "font-medium text-foreground")}>{title}</span>
          <span className={cn("shrink-0 text-xs tabular-nums", unread && !item.muted ? "font-medium text-primary" : "text-muted-foreground")}>{time}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "text-foreground" : "text-muted-foreground")}>{preview || " "}</span>
          {item.pinned ? <Pin className="size-3.5 shrink-0 text-muted-foreground" /> : null}
          {item.muted ? <BellOff className="size-3.5 shrink-0 text-muted-foreground" /> : null}
          {item.mentioned ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <AtSign className="size-3" />
            </span>
          ) : null}
          {unread ? (
            <Badge variant={item.muted ? "muted" : "default"} className="h-5 min-w-5 shrink-0 justify-center rounded-full px-1.5 text-[11px] tabular-nums">
              {count}
            </Badge>
          ) : null}
        </span>
      </span>
    </button>
  );
}

