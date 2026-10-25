import { Redirect, Stack } from "expo-router";
import starter from "../../../../starter.config";
import { ChatRoot } from "@/lib/chat";

/** The Messages tab (`features.chat`): a stack under the signed-in person's chat. */
export default function MessagesStack() {
  if (!starter.features.chat) return <Redirect href="/" />;
  return (
    <ChatRoot>
      <Stack />
    </ChatRoot>
  );
}
