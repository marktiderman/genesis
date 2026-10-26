import { Redirect, Stack, router, useLocalSearchParams, type Href } from "expo-router";
import { ChatSearchScreen } from "@marktiderman/genesis-chat/native";
import { getSettingsPageStackOptions } from "@marktiderman/genesis-ui-native";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import starter from "../../../../starter.config";
import { copy } from "@/copy";

/**
 * Search (`features.chat`): every conversation from the inbox, or one (`?conversationId=`) from
 * its thread. A result opens its thread at the message: from a thread, back to that thread.
 *
 * The bar is opaque, in the screen's background, like the thread's (`useChatThreadStackOptions`):
 * the search field sits in a plain view, not a scroll view iOS insets, so under the see-through
 * bar iOS 26 draws it would sit behind the bar and the status bar.
 */
export default function MessagesSearchScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  const colors = useThemeRoles();
  if (!starter.features.chat) return <Redirect href="/" />;
  return (
    <>
      <Stack.Screen
        options={getSettingsPageStackOptions({
          headerTitle: copy.messages.searchTitle,
          large: false,
          headerOptions: { headerTransparent: false, headerStyle: { backgroundColor: colors.groupedBackground } },
        })}
      />
      <ChatSearchScreen
        conversationId={conversationId ?? null}
        onOpen={(hit) => {
          const href = { pathname: "/messages/[id]", params: { id: hit.conversationId, message: hit.messageId, seq: String(hit.seq) } } as unknown as Href;
          if (conversationId) router.dismissTo(href);
          else router.push(href);
        }}
      />
    </>
  );
}
