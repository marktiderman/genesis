/**
 * NotificationsPage — feed-style notifications list.
 *
 * Composes:
 *   - SectionList grouped by relative date (Today / Yesterday / Earlier)
 *   - Pull-to-refresh
 *   - Empty state slot (auto-rendered when `items` is empty)
 *   - Mark-all-read action surfaced via `headerRight` helper
 *   - Per-row "mark read" action exposed via the consumer's row press
 *     (swipe-to-mark-read is documented as Maestro / E2E only because it
 *     requires gesture-handler — consumers wire it via their own row
 *     wrapper; this layout exposes the unread state via row props).
 *
 * Layer-3 customization: `headerTitle`, `headerLeft`, `headerRight`,
 * `headerOptions`. Use `getNotificationsPageStackOptions()` to wire a
 * "Mark all read" action via `headerRight` automatically.
 *
 * @stability Beta
 */
import { type ReactNode } from "react";
import {
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeSectionListHeader } from "../components/section-list";
import { NativeListItem } from "../components/list-item";
import { NativeEmptyState } from "../components/empty-state";
import { cn } from "../utils";
import {
  composeHeaderOptions,
  type ScreenHeaderProps,
} from "./screen-container";

export interface NotificationItem {
  /** Stable id. */
  id: string;
  /** Headline text. */
  title: string;
  /** Optional secondary line. */
  body?: string;
  /** ISO date string OR Date instance. Used for grouping. */
  timestamp: string | Date;
  /** Read flag. Unread rows render with emphasis (a leading dot). */
  unread?: boolean;
  /** Optional press handler — typically opens the related screen. */
  onPress?: () => void;
  /** Optional leading slot (avatar / icon). */
  leading?: ReactNode;
  /** testID override. Falls back to `notifications-row-<id>`. */
  testID?: string;
}

export interface NotificationsPageProps extends ScreenHeaderProps {
  /** Notification items. Empty array → empty state. */
  items: NotificationItem[];
  /** When true, the SectionList shows the refresh spinner. */
  refreshing?: boolean;
  /** Pull-to-refresh handler. */
  onRefresh?: () => void | Promise<void>;
  /** Mark-all-read handler. When provided, exposes a header action. */
  onMarkAllRead?: () => void;
  /** Override the auto-rendered empty state. */
  emptyState?: ReactNode;
  /** Optional override of the empty-state title. */
  emptyTitle?: string;
  /** Optional override of the empty-state body copy. */
  emptyBody?: string;
  /** Override root container styling. */
  className?: string;
  /** testID on the root container. Default `"notifications-page"`. */
  testID?: string;
}

/**
 * Compose `<Stack.Screen options={...}>` for a NotificationsPage. Wires
 * a "Mark all read" action via `headerRight` when `onMarkAllRead` is
 * passed.
 */
export function getNotificationsPageStackOptions(props: {
  headerTitle?: string;
  onMarkAllRead?: () => void;
  large?: boolean;
  scrollEdgeBehavior?: ScreenHeaderProps["scrollEdgeBehavior"];
  headerLeft?: ScreenHeaderProps["headerLeft"];
  headerRight?: ScreenHeaderProps["headerRight"];
  headerOptions?: ScreenHeaderProps["headerOptions"];
}): Record<string, unknown> {
  const {
    headerTitle,
    onMarkAllRead,
    large,
    scrollEdgeBehavior,
    headerLeft,
    headerRight,
    headerOptions,
  } = props;

  const resolvedHeaderRight =
    headerRight ??
    (onMarkAllRead
      ? () => (
          <Pressable
            testID="notifications-mark-all-read"
            accessibilityRole="button"
            accessibilityLabel="Mark all read"
            onPress={onMarkAllRead}
            hitSlop={8}
            className="min-h-[44px] justify-center px-3"
          >
            <Text className="text-base text-primary">Mark all read</Text>
          </Pressable>
        )
      : undefined);

  return composeHeaderOptions({
    headerTitle: headerTitle ?? "Notifications",
    headerLeft,
    headerRight: resolvedHeaderRight,
    large: large ?? true,
    scrollEdgeBehavior: scrollEdgeBehavior ?? "match",
    headerOptions,
  });
}

// Returns a stable section title for a timestamp. Computes against the
// caller's local clock for consistency with the rest of the app.
function bucketFor(ts: string | Date, now = new Date()): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const startOfDay = (date: Date) => {
    const x = new Date(date);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const today = startOfDay(now);
  const yesterday = today - 24 * 60 * 60 * 1000;
  const day = startOfDay(d);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return "Earlier";
}

interface Section {
  title: string;
  data: NotificationItem[];
}

function groupByDate(items: NotificationItem[], now = new Date()): Section[] {
  const map = new Map<string, NotificationItem[]>();
  // Iterate in input order so stable sort within bucket.
  for (const item of items) {
    const bucket = bucketFor(item.timestamp, now);
    const arr = map.get(bucket) ?? [];
    arr.push(item);
    map.set(bucket, arr);
  }
  // Stable section order: Today / Yesterday / Earlier.
  const order = ["Today", "Yesterday", "Earlier"];
  return order
    .filter((title) => map.has(title))
    .map((title) => ({
      title,
      data: map.get(title) ?? [],
    }));
}

// Expose internal helpers for unit tests via a side-channel export.
export const __test = { bucketFor, groupByDate };

export function NotificationsPage({
  items,
  refreshing,
  onRefresh,
  emptyState,
  emptyTitle,
  emptyBody,
  className,
  testID = "notifications-page",
}: NotificationsPageProps) {
  // Note: header props (headerTitle, headerLeft, headerRight, large,
  // scrollEdgeBehavior, headerOptions) are accepted on the type for API
  // ergonomics but consumed by getNotificationsPageStackOptions() at the
  // consumer's <Stack.Screen> level — not by this component.

  const sections = groupByDate(items);

  if (items.length === 0) {
    return (
      <SafeAreaView
        testID={testID}
        edges={["left", "right", "bottom"]}
        className={cn("flex-1 bg-background", className)}
      >
        {emptyState ?? (
          <NativeEmptyState
            variant="first-run"
            title={emptyTitle ?? "No notifications"}
            body={
              emptyBody ??
              "When you get a notification, it'll show up here."
            }
            testID={`${testID}-empty`}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      testID={testID}
      edges={["left", "right", "bottom"]}
      className={cn("flex-1 bg-background", className)}
    >
      <SectionList<NotificationItem, Section>
        testID={`${testID}-list`}
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <NativeSectionListHeader title={section.title} />
        )}
        renderItem={({ item }) => (
          <NativeListItem
            testID={item.testID ?? `${testID}-row-${item.id}`}
            title={item.title}
            subtitle={item.body}
            leading={
              item.leading ?? (
                <UnreadDot
                  unread={!!item.unread}
                  testID={`${testID}-row-${item.id}-unread`}
                />
              )
            }
            onPress={item.onPress}
          />
        )}
        ItemSeparatorComponent={() => <View className="h-px bg-border ml-4" />}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              testID={`${testID}-refresh`}
              refreshing={!!refreshing}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
        contentContainerClassName="pb-8"
      />
    </SafeAreaView>
  );
}

function UnreadDot({
  unread,
  testID,
}: {
  unread: boolean;
  testID?: string;
}) {
  if (!unread) {
    return <View className="h-2 w-2" testID={testID} />;
  }
  return (
    <View
      testID={testID}
      accessibilityLabel="Unread"
      className="h-2 w-2 rounded-full bg-primary"
    />
  );
}
