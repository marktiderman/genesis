/**
 * @feat:chat
 * Your conversations on genesis-ui-native's InboxPage: each with its avatar,
 * unread count, last message and time; pull to refresh; an empty state that
 * offers to start a conversation; Mark read, Pin and Archive on swipe, long
 * press and as accessibility actions. Under the navigator's large title
 * (`getInboxPageStackOptions`).
 */
import { useCallback, useMemo, useState } from "react";
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
    swipeActions: [
      ...(item.unread > 0 ? [{ id: "read", label: copy.markRead, onPress: () => void client.markRead(item.conversationId).then(settle, settle) }] : []),
      {
        id: "pin",
        label: item.pinned ? copy.unpin : copy.pin,
        onPress: () => void client.setMySettings(item.conversationId, { pinned: !item.pinned }).then(settle, settle),
      },
      ...(item.archived
        ? []
        : [{ id: "archive", label: copy.archive, onPress: () => void client.setMySettings(item.conversationId, { archived: true }).then(settle, settle) }]),
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
      emptyActionLabel={onStart ? copy.startConversation : undefined}
      onEmptyAction={onStart}
      {...pageProps}
    />
  );
}
