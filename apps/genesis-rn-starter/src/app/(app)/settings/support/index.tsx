import { Redirect, Stack } from "expo-router";
import { useSupportInbox } from "@marktiderman/genesis-support/native";
import { InboxPage, getInboxPageStackOptions } from "@marktiderman/genesis-ui-native";
import starter from "../../../../../starter.config";

/** Settings → Help (`features.support`): your reports, newest first, with staff replies; Send feedback and the idea board. */
export default function SupportInboxScreen() {
  if (!starter.features.support) return <Redirect href="/settings" />;
  return <Inbox />;
}

function Inbox() {
  const { headerTitle, ...inbox } = useSupportInbox();
  return (
    <>
      <Stack.Screen options={getInboxPageStackOptions({ headerTitle, large: false })} />
      <InboxPage {...inbox} />
    </>
  );
}
