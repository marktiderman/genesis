import { useMemo } from "react";
import { Redirect, Stack, router, useIsFocused, useLocalSearchParams, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChatIconButton, ChatThreadScreen, chatThreadMatch, useChatThreadStackOptions } from "@marktiderman/genesis-chat/native";
import { chatKeys, useChat, usePeople } from "@marktiderman/genesis-chat/react";
import { useSuppressNotifications } from "@marktiderman/genesis-native/push";
import starter from "../../../../starter.config";
import { copy } from "@/copy";
import { chatClient, kindAllowsTopics } from "@/lib/chat";

/**
 * One conversation (`features.chat`; ChatThreadScreen). Its own pushes stay quiet while it is open.
 * `?message=<id>&seq=<n>` (a search result) opens it at that message; the header searches it.
 */
export default function MessagesThreadScreen() {
  const { id, message, seq } = useLocalSearchParams<{ id: string; message?: string; seq?: string }>();
  if (!starter.features.chat) return <Redirect href="/" />;
  if (!id) return <Redirect href="/messages" />;
  return <Thread id={id} message={message} seq={seq} />;
}

function Thread({ id, message, seq }: { id: string; message?: string; seq?: string }) {
  // The same query the thread reads (one fetch), for the header's title.
  const { data: conversation } = useQuery({ queryKey: chatKeys.conversation(id), queryFn: () => chatClient.conversation(id) });
  // An untitled two-person conversation is called by the other person's name (chat_people).
  const { userId } = useChat();
  const { data: members } = useQuery({ queryKey: chatKeys.members(id), queryFn: () => chatClient.members(id) });
  const other = members && members.length === 2 ? (members.find((m) => m.userId !== userId)?.userId ?? null) : null;
  const people = usePeople([other]);
  const otherName = other ? people[other]?.name : undefined;
  useSuppressNotifications(chatThreadMatch(id));
  const options = useChatThreadStackOptions({
    headerTitle: conversation?.title ?? otherName ?? copy.messages.threadTitle,
    headerRight: () => (
      <ChatIconButton
        testID="thread-search"
        icon="search"
        label={copy.messages.searchThread}
        onPress={() => router.push({ pathname: "/messages/search", params: { conversationId: id } } as unknown as Href)}
      />
    ),
  });
  // The kind's rules (the query the thread reads): a group can start its first topic, a direct one has none.
  const { data: rules } = useQuery({
    queryKey: ["genesis-chat", "kind", conversation?.kind ?? ""],
    queryFn: () => chatClient.kind(conversation!.kind),
    enabled: Boolean(conversation?.kind),
    staleTime: 10 * 60_000,
  });
  // Another tab or a screen pushed over it pauses what the thread is playing.
  const focused = useIsFocused();
  // A check-in card opens the check-in in this stack, so Back comes back here.
  const openAttachment = (a: { kind: string }) => (a.kind === "check_in" && starter.features.checkIn ? router.push("/messages/check-in" as Href) : undefined);
  const jumpTo = useMemo(() => (message ? { messageId: message, seq: seq ? Number(seq) : undefined } : null), [message, seq]);
  return (
    <>
      <Stack.Screen options={options} />
      {/* Keyed by the conversation: a push or link that opens another one in this screen starts it fresh
          (its list position, sheets, viewer and composer), instead of carrying the last one's over. */}
      <ChatThreadScreen key={id} conversationId={id} jumpTo={jumpTo} onOpenAttachment={openAttachment} showTopics={kindAllowsTopics(rules)} focused={focused} />
    </>
  );
}
