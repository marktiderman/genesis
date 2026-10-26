import { useState } from "react";
import { View } from "react-native";
import { Redirect, Stack, router, type Href } from "expo-router";
import { ChatBroadcastSheet, ChatIconButton, ChatInboxScreen, chatPath } from "@marktiderman/genesis-chat/native";
import { getInboxPageStackOptions } from "@marktiderman/genesis-ui-native";
import starter from "../../../../starter.config";
import { copy } from "@/copy";

/**
 * Your conversations, newest first, with unread counts (`features.chat`; ChatInboxScreen is
 * genesis-ui-native's InboxPage). The header searches every conversation and broadcasts one
 * message into many direct conversations (each reply comes back privately). Every signed-in
 * person may broadcast here; an app with roles shows the button only to the people it lets.
 */
export default function MessagesInboxScreen() {
  const [broadcasting, setBroadcasting] = useState(false);
  if (!starter.features.chat) return <Redirect href="/" />;
  return (
    <>
      <Stack.Screen
        options={getInboxPageStackOptions({
          headerTitle: copy.chat.inboxTitle,
          headerRight: () => (
            <View style={{ flexDirection: "row" }}>
              <ChatIconButton testID="messages-search" icon="search" label={copy.messages.search} onPress={() => router.push("/messages/search" as Href)} />
              <ChatIconButton testID="messages-broadcast" icon="share" label={copy.messages.broadcast} onPress={() => setBroadcasting(true)} />
            </View>
          ),
        })}
      />
      <ChatInboxScreen onOpen={(id) => router.push(chatPath(id) as Href)} />
      <ChatBroadcastSheet open={broadcasting} onOpenChange={setBroadcasting} kind="direct" />
    </>
  );
}
