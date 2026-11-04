/**
 * @feat:chat
 * The inbox: your conversations, newest first, each a button with an avatar,
 * the title (the other person's name in a two-person conversation), a one-line
 * preview, the time, an unread count, an @ when you were mentioned, and muted
 * and pinned marks. Arrow keys, j and k, Home and End move between rows.
 *
 * On genesis-ui's `InboxPage`, which owns the list, its keyboard and its loading, empty and error
 * states. This screen keeps its data wiring (the chat client, realtime, read state) and draws chat's
 * row in the `row` slot.
 */
import { useMemo, type ComponentProps } from "react";
import { AtSign, BellOff, MessageSquare, Pin } from "lucide-react";
import { Badge, Button, EmptyState, InboxPage, UserAvatar, cn, type InboxPageSlotMap } from "@marktiderman/genesis-ui";
import type { InboxItem } from "@marktiderman/genesis-core/conversation";
import { renderSlot, type SlotOverride } from "@marktiderman/genesis-core/slots";
import type { ChatInboxItem } from "../core/types";
import { useChat, useInbox, type ChatAttachmentKind } from "../react/index";
import { attachmentPreview } from "../react/previews";
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

const formatTime = (date: Date) => relativeTime(date.toISOString());

export function ChatInbox({ resolveUser, onSelect, selectedId, kind, archived = false, fallbackTitle, slots, className, ...rest }: ChatInboxProps) {
  const { userId: me, attachmentKinds } = useChat();
  const { items, isLoading, error, refetch } = useInbox({ kind, archived });
  const rows = useMemo<ChatInboxRow[]>(
    () =>
      items.map((item) => {
        const title = inboxTitle(item, resolveUser, fallbackTitle);
        const last = item.lastMessage;
        let preview = last ? attachmentPreview(last.body, last.attachment, attachmentKinds, last.deleted) : "";
        if (last && last.kind !== "system" && !last.deleted && last.senderId) {
          if (last.senderId === me) preview = `You: ${preview}`;
          else if (!item.otherUserId && item.memberCount > 2) preview = `${resolveUser(last.senderId).name}: ${preview}`;
        }
        const timestamp = item.lastMessageAt ?? last?.createdAt;
        return {
          id: item.conversationId,
          title,
          preview,
          unreadCount: item.unread,
          ...(timestamp ? { timestamp } : {}),
          chat: item,
          avatarUrl: item.otherUserId ? resolveUser(item.otherUserId).avatarUrl : undefined,
        };
      }),
    [items, me, resolveUser, fallbackTitle, attachmentKinds],
  );
  const label = rest["aria-label"] ?? "Conversations";

  return (
    <nav aria-label={label} className={cn("flex min-h-0 flex-col", className)}>
      <InboxPage
        testID="genesis-chat-inbox"
        items={rows}
        selectedId={selectedId}
        onSelect={onSelect}
        loading={isLoading}
        error={Boolean(error) && rows.length === 0}
        label={label}
        loadingLabel="Loading conversations"
        formatTime={formatTime}
        slots={INBOX_SLOTS}
        slotProps={{ empty: { override: slots?.empty, archived, onRetry: () => void refetch(), failed: Boolean(error) } as Partial<InboxPageSlotMap["empty"]> }}
      />
    </nav>
  );
}

/** What chat adds to InboxPage's row, carried on the row itself. */
interface ChatInboxRow extends InboxItem {
  preview: string;
  chat: ChatInboxItem;
  avatarUrl: string | null | undefined;
}

function InboxEmpty({ override, archived, onRetry, failed }: InboxPageSlotMap["empty"] & { override?: SlotOverride<ChatInboxEmptyProps>; archived: boolean; onRetry: () => void; failed: boolean }) {
  if (failed) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Couldn't load your conversations"
        description="Check your connection and try again."
        action={
          <Button type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }
  return <>{renderSlot(DefaultEmpty, override, { archived })}</>;
}

function InboxRow(row: InboxPageSlotMap["row"] & ChatInboxRow) {
  const { chat: item, title, preview, timeLabel, selected, onPress, rowProps, testID, avatarUrl } = row;
  const unread = item.unread > 0;
  const count = item.unread >= 99 ? "99+" : String(item.unread);
  const label = [
    title,
    unread ? `${count} unread` : null,
    item.mentioned ? "you were mentioned" : null,
    item.muted ? "muted" : null,
    item.pinned ? "pinned" : null,
    preview || null,
    timeLabel || null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      {...rowProps}
      aria-current={selected ? "true" : undefined}
      aria-label={label}
      onClick={onPress}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected && "bg-accent",
      )}
      data-testid={testID}
    >
      <UserAvatar name={title} src={avatarUrl} className="shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5" aria-hidden>
        <span className="flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-semibold text-foreground" : "font-medium text-foreground")}>{title}</span>
          <span className={cn("shrink-0 text-xs tabular-nums", unread && !item.muted ? "font-medium text-primary" : "text-muted-foreground")}>{timeLabel}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "text-foreground" : "text-muted-foreground")}>{preview || " "}</span>
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

// Module scope: a new slot each render would remount every row. The row carries chat's fields
// itself, which InboxPage hands on; its own types don't know them.
const INBOX_SLOTS = { row: InboxRow, empty: InboxEmpty } as unknown as NonNullable<ComponentProps<typeof InboxPage>["slots"]>;
