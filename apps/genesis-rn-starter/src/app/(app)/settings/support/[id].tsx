import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useSupportThread } from "@marktiderman/genesis-support/native";
import { ThreadPage, getThreadPageStackOptions } from "@marktiderman/genesis-ui-native";
import starter from "../../../../../starter.config";

/** One report as a conversation with support (`features.support`): its screenshots, the replies, and yours. */
export default function SupportThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!starter.features.support || !id) return <Redirect href="/settings" />;
  return <Thread id={id} />;
}

function Thread({ id }: { id: string }) {
  const { headerTitle, notFound, ...thread } = useSupportThread(id);
  // Deleted, or not yours: back to the list.
  if (notFound) return <Redirect href="/settings/support" />;
  return (
    <>
      <Stack.Screen options={getThreadPageStackOptions({ headerTitle })} />
      <ThreadPage {...thread} />
    </>
  );
}
