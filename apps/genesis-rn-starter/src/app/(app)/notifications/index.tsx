import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { useOptionalPush } from "@marktiderman/genesis-native/push";
import { NotificationsPage, getNotificationsPageStackOptions } from "@marktiderman/genesis-ui-native";
import starter from "../../../../starter.config";
import { copy } from "@/copy";
import { useNotifications } from "@/lib/notifications";

/** The Notifications tab (`features.notifications`). */
export default function NotificationsScreen() {
  const { data = [], isRefetching, refetch } = useNotifications();
  // Opening this tab is the moment push is worth asking for: the soft prompt, never at launch.
  const push = useOptionalPush();
  useEffect(() => {
    void push?.prompt.offer(copy.push.promptReason);
  }, [push]);
  if (!starter.features.notifications) return <Redirect href="/" />;
  return (
    <>
      <Stack.Screen options={getNotificationsPageStackOptions({ headerTitle: copy.notifications.title })} />
      <NotificationsPage
        testID="notifications"
        items={data}
        refreshing={isRefetching}
        onRefresh={async () => {
          await refetch();
        }}
        emptyTitle={copy.notifications.emptyTitle}
        emptyBody={copy.notifications.emptyBody}
      />
    </>
  );
}
