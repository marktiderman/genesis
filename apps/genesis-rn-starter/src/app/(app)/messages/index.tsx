import { Redirect, Stack, router, type Href } from "expo-router";
import { ChatInboxScreen, chatPath } from "@marktiderman/genesis-chat/native";
import { getInboxPageStackOptions } from "@marktiderman/genesis-ui-native";
import starter from "../../../../starter.config";
import { copy } from "@/copy";

/** Your conversations, newest first, with unread counts (`features.chat`; ChatInboxScreen is genesis-ui-native's InboxPage). */
export default function MessagesInboxScreen() {
  if (!starter.features.chat) return <Redirect href="/" />;
  return (
    <>
      <Stack.Screen options={getInboxPageStackOptions({ headerTitle: copy.chat.inboxTitle })} />
      <ChatInboxScreen onOpen={(id) => router.push(chatPath(id) as Href)} />
    </>
  );
}
