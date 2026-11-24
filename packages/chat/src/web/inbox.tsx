/**
 * @feat:chat
 * The inbox: your conversations, newest first, each a button with an avatar,
 * the title (the other person's name in a two-person conversation), a one-line
 * preview, the time, an unread count, an @ when you were mentioned, and muted
 * and pinned marks. Arrow keys, j and k, Home and End move between rows. Each row's actions
 * (Mark as Unread or Read, Pin, Hide Alerts, Delete for me after asking, Archive) are in its More
 * menu: the same set the phone's swipe offers (`inboxRowActions`), reshaped with `rowActions`.
 *
 * On genesis-ui's `InboxPage`, which owns the list, its keyboard and its loading, empty and error
 * states. This screen keeps its data wiring (the chat client, realtime, read state) and draws chat's
 * row in the `row` slot.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactElement } from "react";
import { AtSign, BellOff, MessageSquare, Pin } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  EmptyState,
  InboxPage,
  InboxRowMenu,
  UserAvatar,
  cn,
  type InboxPageSlotMap,
} from "@marktiderman/genesis-ui";
import type { RowSwipeAction } from "@marktiderman/genesis-core/row-actions";
import type { InboxItem } from "@marktiderman/genesis-core/conversation";
import { renderSlot, type SlotOverride } from "@marktiderman/genesis-core/slots";
import type { ChatInboxItem } from "../core/types";
import {
  defaultInboxActionLabels,
  inboxRowActions,
  useChat,
  useInbox,
  useInboxActions,
  type ChatAttachmentKind,
  type ChatConfirm,
  type ChatInboxActionLabels,
} from "../react/index";
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
  /**
   * Each row's actions in its More menu: receives the conversation and the default set
   * (`inboxRowActions`) and returns the row's; `() => []` turns them off.
   */
  rowActions?: (item: ChatInboxItem, defaults: RowSwipeAction[]) => RowSwipeAction[];
  /** The actions' and the delete confirmation's words. Default English. */
  actionLabels?: Partial<ChatInboxActionLabels>;
  /** A failed action: say so (a toast). Default: nothing. */
  onActionError?: (error: unknown) => void;
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

/** A confirmation the dialog is showing, and how to answer it. */
interface PendingConfirm {
  title: string;
  body: string;
  label: string;
  answer: (ok: boolean) => void;
}

/** A `ChatConfirm` drawn as genesis-ui's AlertDialog: the confirm to pass, and the dialog to render. */
/**
 * `fallbackFocus`: where focus goes when the dialog closes and the control that asked is gone (a
 * confirmed delete removed its row). By default focus returns to the control that asked.
 */
export function useConfirmDialog(cancelLabel = "Cancel", fallbackFocus?: () => HTMLElement | null | undefined): { confirm: ChatConfirm; dialog: ReactElement } {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const current = useRef<PendingConfirm | null>(null);
  // What had focus when it asked, and when the dialog opened (a menu may have handed focus back to its button by then).
  const askedFrom = useRef<HTMLElement[]>([]);
  const fallback = useRef(fallbackFocus);
  fallback.current = fallbackFocus;
  const confirm = useCallback<ChatConfirm>(
    (title, body, label) =>
      new Promise<boolean>((resolve) => {
        const active = typeof document !== "undefined" ? document.activeElement : null;
        // A second ask from inside the open dialog keeps the control that asked first.
        if (!(active instanceof HTMLElement && active.closest('[role="alertdialog"]'))) {
          askedFrom.current = active instanceof HTMLElement && active !== document.body ? [active] : [];
        }
        // A second ask answers the first one no.
        current.current?.answer(false);
        const next: PendingConfirm = { title, body, label, answer: resolve };
        current.current = next;
        setPending(next);
      }),
    [],
  );
  // Unmounted with a question open (the inbox closed under it): answer it no, so the caller's await settles.
  useEffect(
    () => () => {
      const p = current.current;
      current.current = null;
      p?.answer(false);
    },
    [],
  );
  const answer = (ok: boolean) => {
    const p = current.current;
    current.current = null;
    setPending(null);
    p?.answer(ok);
  };
  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(o) => !o && answer(false)}>
      <AlertDialogContent
        onOpenAutoFocus={() => {
          const active = document.activeElement;
          if (active instanceof HTMLElement && active !== document.body) askedFrom.current = [active, ...askedFrom.current];
        }}
        onCloseAutoFocus={(e) => {
          // Back to the control that asked (Radix would aim at a trigger this dialog doesn't have), or
          // the fallback when that control is gone.
          e.preventDefault();
          const target = askedFrom.current.find((el) => el.isConnected) ?? fallback.current?.() ?? null;
          askedFrom.current = [];
          target?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
          <AlertDialogDescription>{pending?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => answer(true)} data-testid="genesis-chat-inbox-confirm">
            {pending?.label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { confirm, dialog };
}

export function ChatInbox({ resolveUser, onSelect, selectedId, kind, archived = false, fallbackTitle, rowActions, actionLabels, onActionError, slots, className, ...rest }: ChatInboxProps) {
  const { userId: me, attachmentKinds } = useChat();
  const { items, isLoading, error, refetch } = useInbox({ kind, archived });
  const act = useInboxActions();
  const labels = useMemo(() => ({ ...defaultInboxActionLabels, ...actionLabels }), [actionLabels]);
  const navRef = useRef<HTMLElement>(null);
  const listTabStop = useCallback(
    // The list's tab stop, else any row, else the list itself (the last conversation went).
    () => navRef.current?.querySelector<HTMLElement>('[data-inbox-row][tabindex="0"]') ?? navRef.current?.querySelector<HTMLElement>("[data-inbox-row]") ?? navRef.current,
    [],
  );
  // The row whose menu asked: its More menu has closed by the time the dialog opens, so the dialog
  // can't record it; on Cancel focus goes back to that row, else the list's tab stop.
  const askingRow = useRef<string | null>(null);
  const askingRowOrTabStop = useCallback(() => {
    const id = askingRow.current;
    const row = id ? navRef.current?.querySelector<HTMLElement>(`[data-inbox-row][data-testid="genesis-chat-inbox-row-${id}"]`) : null;
    return row ?? listTabStop();
  }, [listTabStop]);
  const { confirm: ask, dialog } = useConfirmDialog(labels.cancel, askingRowOrTabStop);
  // A confirmed action (Delete for me) removes its row only once the call and the inbox's refetch
  // come back, after the dialog has already given focus back to that row. When that row leaves the
  // list and took focus with it, put focus on the list's tab stop. Only that row's leaving counts:
  // an action that failed or kept the row never pulls focus later. Each confirmed row is kept
  // until it leaves or its action fails, so deletes that overlap are each watched.
  const leaving = useRef(new Set<string>());
  const confirm = useCallback<ChatConfirm>(
    async (title, body, label) => {
      const asked = askingRow.current;
      const ok = await ask(title, body, label);
      if (ok && asked) leaving.current.add(asked);
      return ok;
    },
    [ask],
  );
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
        const rowConfirm: ChatConfirm = (title, body, label) => {
          askingRow.current = item.conversationId;
          return confirm(title, body, label);
        };
        const onError = (error: unknown) => {
          // A failed action keeps its row: stop watching it.
          leaving.current.delete(item.conversationId);
          onActionError?.(error);
        };
        const defaults = inboxRowActions(item, act, labels, { confirm: rowConfirm, onError });
        return {
          id: item.conversationId,
          title,
          preview,
          unreadCount: item.unread,
          muted: item.muted,
          pinned: item.pinned,
          ...(timestamp ? { timestamp } : {}),
          chat: item,
          avatarUrl: item.otherUserId ? resolveUser(item.otherUserId).avatarUrl : undefined,
          swipeActions: rowActions ? rowActions(item, defaults) : defaults,
        };
      }),
    [items, me, resolveUser, fallbackTitle, attachmentKinds, act, labels, confirm, onActionError, rowActions],
  );
  useEffect(() => {
    if (leaving.current.size === 0) return;
    const present = new Set(rows.map((r) => r.id));
    let left = false;
    for (const id of leaving.current) {
      if (present.has(id)) continue;
      leaving.current.delete(id);
      left = true;
    }
    if (!left) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    listTabStop()?.focus();
  }, [rows, listTabStop]);
  const label = rest["aria-label"] ?? "Conversations";

  return (
    <nav ref={navRef} tabIndex={-1} aria-label={label} className={cn("flex min-h-0 flex-col", className)}>
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
        mutedLabel={labels.alertsOff}
        pinnedLabel={labels.pinnedMark}
        slots={INBOX_SLOTS}
        slotProps={{ empty: { override: slots?.empty, archived, onRetry: () => void refetch(), failed: Boolean(error) } as Partial<InboxPageSlotMap["empty"]> }}
      />
      {dialog}
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
  const { chat: item, title, preview, timeLabel, selected, onPress, rowProps, testID, avatarUrl, swipeActions, moreLabel, mutedLabel, pinnedLabel } = row;
  const unread = item.unread > 0;
  const count = item.unread >= 99 ? "99+" : String(item.unread);
  const label = [
    title,
    unread ? `${count} unread` : null,
    item.mentioned ? "you were mentioned" : null,
    item.pinned ? pinnedLabel : null,
    item.muted ? mutedLabel : null,
    preview || null,
    timeLabel || null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    // The wrapper takes the selected highlight from data-selected, so `.bg-accent` stays the selected button's own (conformance names it by that class).
    <div data-selected={selected ? "true" : undefined} className="group relative flex items-stretch data-[selected=true]:bg-accent">
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
          {item.pinned ? <Pin data-testid={`${testID}-pinned`} className="size-3.5 shrink-0 text-muted-foreground" /> : null}
          {item.muted ? <BellOff data-testid={`${testID}-muted`} className="size-3.5 shrink-0 text-muted-foreground" /> : null}
          <span className={cn("shrink-0 text-xs tabular-nums", unread && !item.muted ? "font-medium text-primary-text" : "text-muted-foreground")}>{timeLabel}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "text-foreground" : "text-muted-foreground")}>{preview || " "}</span>
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
    <InboxRowMenu actions={swipeActions ?? []} label={`${moreLabel}: ${title}`} testID={testID} />
    </div>
  );
}

// Module scope: a new slot each render would remount every row. The row carries chat's fields
// itself, which InboxPage hands on; its own types don't know them.
const INBOX_SLOTS = { row: InboxRow, empty: InboxEmpty } as unknown as NonNullable<ComponentProps<typeof InboxPage>["slots"]>;
