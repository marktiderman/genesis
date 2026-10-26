/**
 * @feat:chat
 * In the composer's place when your role in a conversation couldn't be read
 * (offline, a server hiccup): what happened and Retry
 * (`useConversation().refetchAccess`), instead of waiting quietly forever or
 * saying you can't post.
 */
import { View } from "react-native";
import { NativeButton, NativeInlineAlert } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { useChatNative } from "./context";

export interface ChatAccessErrorProps {
  onRetry: () => void;
  /** A retry is under way. */
  retrying?: boolean;
  testID?: string;
}

export function ChatAccessError({ onRetry, retrying = false, testID = "chat-access-error" }: ChatAccessErrorProps) {
  const { copy } = useChatNative();
  const colors = useThemeRoles();
  return (
    <View testID={testID} style={{ padding: 12, gap: 10, backgroundColor: colors.groupedBackground }}>
      <NativeInlineAlert variant="warning" description={copy.accessError} testID={`${testID}-alert`} />
      <NativeButton variant="outline" size="lg" onPress={onRetry} loading={retrying} testID={`${testID}-retry`}>
        {copy.retry}
      </NativeButton>
    </View>
  );
}
