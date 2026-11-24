/**
 * @feat:chat
 * Your conversations on genesis-ui-native's InboxPage: each with its avatar,
 * unread count, last message and time; pull to refresh; an empty state that
 * offers to start a conversation. Each row has Messages' actions: swipe right for Mark as
 * Unread (or Read) and Pin, left for Hide Alerts and Delete (for you, after asking); Archive
 * is in the long-press menu. Every action is also a screen reader action on the row. Under the
 * navigator's large title (`getInboxPageStackOptions`).
 */
import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import type { RowSwipeAction } from "@marktiderman/genesis-core/row-actions";
import { NativeAvatar } from "@marktiderman/genesis-ui-native/components";
import { InboxPage, type InboxItem, type InboxPageProps } from "@marktiderman/genesis-ui-native/layouts";
import type { ChatInboxItem } from "../core/types";
import { inboxRowActions, useChat, useInbox, useInboxActions, usePeople, type ChatAttachmentKind, type ChatConfirm } from "../react/index";
import { attachmentPreview } from "./attachment-cards";
import type { ChatNativeCopy } from "./copy";
import { initials, useChatNative, type ChatPerson } from "./context";
import { displayBody } from "./message-bubble";

export interface ChatInboxScreenProps {
  /** Opens a conversation (`router.push(chatPath(id))`). */
  onOpen: (conversationId: string) => void;
  /** Starts one (opens your people picker, or `ChatStartSheet`). Shows the empty state's button. */
  onStart?: () => void;
  /** One kind only. */
  kind?: string;
  /** Only these kinds. */
  kinds?: string[];
  /** Every kind but these (`["support"]` keeps support tickets out of a messages inbox). */
  excludeKinds?: string[];
  archived?: boolean;
  /**
   * Each row's actions: receives the conversation and the default set (`inboxRowActions`:
   * Messages' Unread, Pin, Hide Alerts, Delete for me and Archive) and returns the row's. Add,
   * drop, reorder or relabel them; the default keeps them as they are.
   */
  rowActions?: (item: ChatInboxItem, defaults: RowSwipeAction[]) => RowSwipeAction[];
  /** Passed to InboxPage (a header, a section title, slots). */
  pageProps?: Partial<Omit<InboxPageProps, "items">>;
  testID?: string;
}

/** An inbox row from a conversation. Exported for apps that build their own list. */
export function inboxRow(
  item: ChatInboxItem,
  ctx: {
    me: string;
    copy: ChatNativeCopy;
    person: (id: string | null) => ChatPerson | undefined;
    /** The app's attachment kinds: a last message that is a card reads as its title ("Check-in"). */
    kinds?: Record<string, ChatAttachmentKind>;
  },
): Omit<InboxItem, "onPress" | "swipeActions"> {
  const other = item.otherUserId ? ctx.person(item.otherUserId) : undefined;
  const title = item.title ?? other?.name ?? ctx.copy.untitled;
  const last = item.lastMessage;
  const text = last ? attachmentPreview(displayBody(last.body), last.attachment, ctx.kinds, last.deleted) : "";
  const preview = last && text && last.senderId === ctx.me && last.kind !== "system" ? `${ctx.copy.youPrefix}${text}` : text;
  return {
    id: item.conversationId,
    title,
    preview: preview || undefined,
    timestamp: item.lastMessageAt ?? undefined,
    unread: item.unread > 0,
    unreadCount: item.unread,
    meta: item.mentioned ? ctx.copy.mentionedYou : undefined,
    muted: item.muted,
    pinned: item.pinned,
    avatar: <NativeAvatar size={40} src={other?.avatarUrl ?? null} fallback={initials(title)} alt={title} recyclingKey={item.conversationId} />,
  };
}

/** Asks with the system alert: Cancel, then the destructive action. */
export function alertConfirm(cancelLabel: string): ChatConfirm {
  return (title, body, confirmLabel) =>
    new Promise((resolve) =>
      Alert.alert(title, body, [
        { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, style: "destructive", onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) }),
    );
}

export function ChatInboxScreen({ onOpen, onStart, kind, kinds, excludeKinds, archived, rowActions, pageProps, testID = "chat-inbox" }: ChatInboxScreenProps) {
  const { userId, attachmentKinds } = useChat();
  const act = useInboxActions();
  const { copy, person: known } = useChatNative();
  const inbox = useInbox({ kind, kinds, excludeKinds, archived });
  // The other person in each direct conversation, fetched in one batch (ChatProvider loadPeople).
  const others = useMemo(() => inbox.items.map((i) => i.otherUserId), [inbox.items]);
  const people = usePeople(others);
  const person = useCallback((id: string | null | undefined) => known(id) ?? (id ? people[id] : undefined), [known, people]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await inbox.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [inbox]);

  // A row action that fails says so, rather than leaving the row as it was without a word.
  const options = useMemo(
    () => ({
      confirm: alertConfirm(copy.cancel),
      onError: (e: unknown) => Alert.alert(copy.actionFailed, e instanceof Error ? e.message : undefined),
    }),
    [copy],
  );

  const items: InboxItem[] = inbox.items.map((item) => {
    // Messages' row actions: Unread (or Read) and Pin to the right, Hide Alerts and Delete to the
    // left, round buttons; Archive in the long-press menu only. Every one is also a screen reader
    // action on the row.
    const defaults = inboxRowActions(item, act, copy, options);
    return {
      ...inboxRow(item, { me: userId, copy, person, kinds: attachmentKinds }),
      onPress: () => onOpen(item.conversationId),
      swipeActions: rowActions ? rowActions(item, defaults) : defaults,
    };
  });

  return (
    <InboxPage
      testID={testID}
      items={items}
      loading={inbox.isLoading}
      error={Boolean(inbox.error)}
      errorTitle={copy.inboxErrorTitle}
      refreshing={refreshing}
      onRefresh={refresh}
      emptyTitle={copy.inboxEmptyTitle}
      emptyBody={copy.inboxEmptyBody}
      // Messages' round buttons behind the swipe, the row a pill while open.
      swipeAppearance="round"
      mutedLabel={copy.alertsOff}
      pinnedLabel={copy.pinnedMark}
      emptyActionLabel={onStart ? copy.startConversation : undefined}
      onEmptyAction={onStart}
      {...pageProps}
    />
  );
}
