import { useMemo } from "react";
import { Redirect, Stack, router, useLocalSearchParams, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChatIconButton, ChatThreadScreen, chatThreadMatch, useChatThreadStackOptions } from "@marktiderman/genesis-chat/native";
import { chatKeys } from "@marktiderman/genesis-chat/react";
import { useSuppressNotifications } from "@marktiderman/genesis-native/push";
import starter from "../../../../starter.config";
import { copy } from "@/copy";
import { chatClient } from "@/lib/chat";

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
  useSuppressNotifications(chatThreadMatch(id));
  const options = useChatThreadStackOptions({
    headerTitle: conversation?.title ?? copy.messages.threadTitle,
    headerRight: () => (
      <ChatIconButton
        testID="thread-search"
        icon="search"
        label={copy.messages.searchThread}
        onPress={() => router.push({ pathname: "/messages/search", params: { conversationId: id } } as unknown as Href)}
      />
    ),
  });
  // A check-in card opens the check-in.
  const openAttachment = (a: { kind: string }) => (a.kind === "check_in" && starter.features.checkIn ? router.push("/check-in") : undefined);
  const jumpTo = useMemo(() => (message ? { messageId: message, seq: seq ? Number(seq) : undefined } : null), [message, seq]);
  return (
    <>
      <Stack.Screen options={options} />
      {/* Keyed by the conversation: a push or link that opens another one in this screen starts it fresh
          (its list position, sheets, viewer and composer), instead of carrying the last one's over. */}
      <ChatThreadScreen key={id} conversationId={id} jumpTo={jumpTo} onOpenAttachment={openAttachment} />
    </>
  );
}
