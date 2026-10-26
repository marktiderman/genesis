import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChatThreadScreen, chatThreadMatch, useChatThreadStackOptions } from "@marktiderman/genesis-chat/native";
import { chatKeys, useChat, usePeople } from "@marktiderman/genesis-chat/react";
import { useSuppressNotifications } from "@marktiderman/genesis-native/push";
import starter from "../../../../starter.config";
import { copy } from "@/copy";
import { chatClient } from "@/lib/chat";

/** One conversation (`features.chat`; ChatThreadScreen). Its own pushes stay quiet while it is open. */
export default function MessagesThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!starter.features.chat) return <Redirect href="/" />;
  if (!id) return <Redirect href="/messages" />;
  return <Thread id={id} />;
}

function Thread({ id }: { id: string }) {
  // The same query the thread reads (one fetch), for the header's title.
  const { data: conversation } = useQuery({ queryKey: chatKeys.conversation(id), queryFn: () => chatClient.conversation(id) });
  // An untitled two-person conversation is called by the other person's name (chat_people).
  const { userId } = useChat();
  const { data: members } = useQuery({ queryKey: chatKeys.members(id), queryFn: () => chatClient.members(id) });
  const other = members && members.length === 2 ? (members.find((m) => m.userId !== userId)?.userId ?? null) : null;
  const people = usePeople([other]);
  const otherName = other ? people[other]?.name : undefined;
  useSuppressNotifications(chatThreadMatch(id));
  const options = useChatThreadStackOptions({ headerTitle: conversation?.title ?? otherName ?? copy.messages.threadTitle });
  return (
    <>
      <Stack.Screen options={options} />
      {/* Keyed by the conversation: a push or link that opens another one in this screen starts it fresh
          (its list position, sheets, viewer and composer), instead of carrying the last one's over. */}
      <ChatThreadScreen key={id} conversationId={id} />
    </>
  );
}
