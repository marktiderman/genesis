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
import { NativeAvatar } from "@marktiderman/genesis-ui-native/components";
import { InboxPage, type InboxItem, type InboxPageProps } from "@marktiderman/genesis-ui-native/layouts";
import type { ChatInboxItem } from "../core/types";
import { chatKeys, useChat, useInbox, usePeople, type ChatAttachmentKind } from "../react/index";
import { attachmentPreview } from "./attachment-cards";
import { useQueryClient } from "@tanstack/react-query";
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
    avatar: <NativeAvatar size={40} src={other?.avatarUrl ?? null} fallback={initials(title)} alt={title} recyclingKey={item.conversationId} />,
  };
}

/** Hide Alerts from the row: until it's turned back on (a date far enough away to read as always). */
const FOREVER = "9999-12-31T00:00:00.000Z";

export function ChatInboxScreen({ onOpen, onStart, kind, kinds, excludeKinds, archived, pageProps, testID = "chat-inbox" }: ChatInboxScreenProps) {
  const { client, userId, attachmentKinds } = useChat();
  const queryClient = useQueryClient();
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

  const settle = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["genesis-chat", "inbox"] });
    void queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
  }, [queryClient]);

  const items: InboxItem[] = inbox.items.map((item) => ({
    ...inboxRow(item, { me: userId, copy, person, kinds: attachmentKinds }),
    onPress: () => onOpen(item.conversationId),
    // Messages' row actions: Unread (or Read) and Pin to the right, Hide Alerts and Delete to the
    // left, round buttons; Archive in the long-press menu only. Every one is also a screen reader
    // action on the row (NativeSwipeRow).
    swipeActions: [
      item.unread > 0
        ? { id: "read", label: copy.markRead, icon: "mail-open", tone: "blue" as const, side: "leading" as const, full: true, onPress: () => void client.markRead(item.conversationId).then(settle, settle) }
        : { id: "unread", label: copy.markUnread, icon: "message-unread", tone: "blue" as const, side: "leading" as const, full: true, onPress: () => void client.setMySettings(item.conversationId, { markedUnread: true }).then(settle, settle) },
      {
        id: "pin",
        label: item.pinned ? copy.unpin : copy.pin,
        icon: "pin",
        tone: "orange" as const,
        side: "leading" as const,
        onPress: () => void client.setMySettings(item.conversationId, { pinned: !item.pinned }).then(settle, settle),
      },
      {
        id: "alerts",
        label: item.muted ? copy.showAlerts : copy.hideAlerts,
        icon: item.muted ? "bell" : "bell-off",
        tone: "purple" as const,
        side: "trailing" as const,
        onPress: () => void client.setMySettings(item.conversationId, { mutedUntil: item.muted ? null : FOREVER }).then(settle, settle),
      },
      {
        id: "delete",
        label: copy.deleteConversation,
        icon: "trash",
        destructive: true,
        side: "trailing" as const,
        full: true,
        onPress: () =>
          Alert.alert(copy.deleteConversationTitle, copy.deleteConversationBody, [
            { text: copy.cancel, style: "cancel" },
            { text: copy.deleteConversation, style: "destructive", onPress: () => void client.deleteConversationForMe(item.conversationId).then(settle, settle) },
          ]),
      },
      ...(item.archived
        ? []
        : [{ id: "archive", label: copy.archive, icon: "archive", swipe: false, onPress: () => void client.setMySettings(item.conversationId, { archived: true }).then(settle, settle) }]),
    ],
  }));

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
      emptyActionLabel={onStart ? copy.startConversation : undefined}
      onEmptyAction={onStart}
      {...pageProps}
    />
  );
}
