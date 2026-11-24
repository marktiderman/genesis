import { useCallback } from "react";
import { Redirect, Stack, router, useFocusEffect, type Href } from "expo-router";
import { useOptionalPush } from "@marktiderman/genesis-native/push";
import { NotificationsFeed, useNotificationsFeedHeader } from "@marktiderman/genesis-notifications/native";
import starter from "../../../../starter.config";
import { copy } from "@/copy";

/** The Notifications tab (`features.notifications`): the person's feed, from genesis-notifications. */
export default function NotificationsScreen() {
  const header = useNotificationsFeedHeader({ headerTitle: copy.notifications.title });
  // Coming to this tab is the moment push is worth asking for: the soft prompt (never at launch;
  // the block ignores an offer in its first seconds and after a recent Not now), each time it's shown.
  const push = useOptionalPush();
  useFocusEffect(
    useCallback(() => {
      void push?.prompt.offer(copy.push.promptReason);
    }, [push]),
  );
  if (!starter.features.notifications) return <Redirect href="/" />;
  return (
    <>
      <Stack.Screen options={header} />
      <NotificationsFeed
        onOpen={(item) => (item.url ? router.push(item.url as Href) : undefined)}
        emptyTitle={copy.notifications.emptyTitle}
        emptyBody={copy.notifications.emptyBody}
      />
    </>
  );
}
