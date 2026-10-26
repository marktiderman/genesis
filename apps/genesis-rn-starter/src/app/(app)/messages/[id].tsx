import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChatThreadScreen, chatThreadMatch, useChatThreadStackOptions } from "@marktiderman/genesis-chat/native";
import { chatKeys } from "@marktiderman/genesis-chat/react";
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
  useSuppressNotifications(chatThreadMatch(id));
  const options = useChatThreadStackOptions({ headerTitle: conversation?.title ?? copy.messages.threadTitle });
  return (
    <>
      <Stack.Screen options={options} />
      {/* Keyed by the conversation: a push or link that opens another one in this screen starts it fresh
          (its list position, sheets, viewer and composer), instead of carrying the last one's over. */}
      <ChatThreadScreen key={id} conversationId={id} onOpenAttachment={(a) => (a.kind === "check_in" && starter.features.checkIn ? router.push("/check-in") : undefined)} />
    </>
  );
}
