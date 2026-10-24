/**
 * Where the Notifications tab gets its items. The starter has no notifications
 * source yet, so the list is empty and the tab shows its empty state. Point
 * `queryFn` at yours (a Supabase table read with `must(...)`, say) and keep
 * the query key: `["notifications"]`.
 */
import { useQuery } from "@tanstack/react-query";
import type { NotificationItem } from "@marktiderman/genesis-ui-native";

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationItem[]> => [],
  });
}
