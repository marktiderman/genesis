import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import {
  NotificationsPage,
  getNotificationsPageStackOptions,
  type NotificationItem,
} from "@marktiderman/genesis-ui-native";

const seed = (now: Date): NotificationItem[] => {
  const today = new Date(now);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const earlier = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  return [
    {
      id: "1",
      title: "Welcome to Genesis",
      body: "Your sample app is ready. Tap any layout to drill in.",
      timestamp: today.toISOString(),
      unread: true,
    },
    {
      id: "2",
      title: "New message from Maya",
      body: "Hey! Got time for a quick sync this afternoon?",
      timestamp: today.toISOString(),
      unread: true,
    },
    {
      id: "3",
      title: "Build #847 succeeded",
      body: "All checks passed on main.",
      timestamp: yesterday.toISOString(),
    },
    {
      id: "4",
      title: "Weekly digest ready",
      body: "Your team shipped 12 PRs last week.",
      timestamp: earlier.toISOString(),
    },
  ];
};

/**
 * E3 sample — feed-style notifications page.
 *
 * Demonstrates:
 *   - SectionList grouped by relative date (Today / Yesterday / Earlier)
 *   - Pull-to-refresh wired to a fake reload handler
 *   - "Mark all read" action in the nav bar (auto-wired by getNotificationsPageStackOptions)
 *   - Per-row unread dot
 *   - Tap-to-mark-read interaction (consumer wires onPress → markRead)
 *   - Empty-state path (delete all items via "Mark all read" + clear)
 */
export default function NotificationsLayoutSample() {
  const [items, setItems] = useState<NotificationItem[]>(() =>
    seed(new Date()),
  );
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setItems(seed(new Date()));
    setRefreshing(false);
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setItems((prev) => prev.map((it) => ({ ...it, unread: false })));
  }, []);

  const itemsWithPress: NotificationItem[] = items.map((it) => ({
    ...it,
    onPress: () => {
      setItems((prev) =>
        prev.map((row) =>
          row.id === it.id ? { ...row, unread: false } : row,
        ),
      );
    },
  }));

  return (
    <>
      <Stack.Screen
        options={getNotificationsPageStackOptions({
          headerTitle: "Notifications (E3)",
          onMarkAllRead: handleMarkAllRead,
        })}
      />
      <NotificationsPage
        testID="notifications"
        items={itemsWithPress}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />
    </>
  );
}
