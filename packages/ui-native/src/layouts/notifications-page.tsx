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
 * Slots: replace or drop (`null`) `sectionHeader`, `row` or `empty`
 * through `slots`; feed a default part through `slotProps`.
 *
 * Header customization: `headerTitle`, `headerLeft`, `headerRight`,
 * `headerOptions`. Use `getNotificationsPageStackOptions()` to wire a
 * "Mark all read" action via `headerRight` automatically.
 *
 * @stability Beta
 */
import { useCallback, useContext, useMemo, type ReactNode } from "react";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  View,
} from "react-native";
import { SafeAreaInsetsContext, SafeAreaView } from "react-native-safe-area-context";
import { NativeSectionListHeader } from "../components/section-list";
import { NativeListItem } from "../components/list-item";
import { NativeEmptyState } from "../components/empty-state";
import { cn } from "../utils";
import { useGenesisModules } from "../native-modules";
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

/** The parts of a {@link NotificationsPage} that `slots` and `slotProps` reach. */
export type NotificationsPageSlotMap = {
  sectionHeader: { title: string };
  row: NotificationItem & { testID: string };
  empty: { title: string; body: string; testID: string };
};

export interface NotificationsPageProps extends ScreenHeaderProps {
  /** Notification items. Empty array → empty state. */
  items: NotificationItem[];
  /** When true, the SectionList shows the refresh spinner. */
  refreshing?: boolean;
  /** Pull-to-refresh handler. */
  onRefresh?: () => void | Promise<void>;
  /** Mark-all-read handler. When provided, exposes a header action. */
  onMarkAllRead?: () => void;
  /** Override the auto-rendered empty state. Prefer `slots.empty`. */
  emptyState?: ReactNode;
  /** Replace (a component) or drop (`null`) one part. */
  slots?: Slots<NotificationsPageSlotMap>;
  /** More props for a default part, merged over what the layout passes. */
  slotProps?: SlotPropsFor<NotificationsPageSlotMap>;
  /** Optional override of the empty-state title. */
  emptyTitle?: string;
  /** Optional override of the empty-state body copy. */
  emptyBody?: string;
  /**
   * Where a section header sticks, in points from the top of the list. The list runs under the
   * native header (iOS insets its rows, and the large title collapses as it scrolls), so a header
   * stuck at 0 would sit under the status bar. Default on iOS: under the collapsed navigation bar
   * (`defaultStickyHeaderOffset`); elsewhere 0. Without a header, pass the safe area's top.
   */
  stickyHeaderOffset?: number;
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

type FlatRow = { kind: "header"; title: string } | { kind: "item"; item: NotificationItem; last: boolean };

function flattenSections(sections: Section[]): { rows: FlatRow[]; headerIndices: number[] } {
  const rows: FlatRow[] = [];
  const headerIndices: number[] = [];
  for (const section of sections) {
    headerIndices.push(rows.length);
    rows.push({ kind: "header", title: section.title });
    section.data.forEach((item, i) => rows.push({ kind: "item", item, last: i === section.data.length - 1 }));
  }
  return { rows, headerIndices };
}

function flatRowKey(row: FlatRow) {
  return row.kind === "header" ? `header:${row.title}` : row.item.id;
}

/** A row with its separator and the section's last row differ in height: separate recycling pools. */
function flatRowType(row: FlatRow) {
  return row.kind === "header" ? "header" : row.last ? "item-last" : "item";
}

const NO_SLOTS = {};

/**
 * The height of iOS's compact navigation bar, below the status bar: 44 pt up to iOS 18, 54 pt
 * from iOS 26 (measured on an iOS 26 simulator, the collapsed large-title bar of a native stack).
 */
export function iosCompactNavigationBarHeight(version: number | string): number {
  const major = typeof version === "number" ? version : parseInt(version, 10);
  return Number.isFinite(major) && major >= 26 ? 54 : 44;
}

/**
 * Where a list's section headers stick by default: on iOS, the bottom of the collapsed
 * navigation bar (the safe area's top plus the compact bar), since the list runs under the
 * header; elsewhere 0 (the header sits above the list).
 */
export function defaultStickyHeaderOffset(os: string, version: number | string, safeAreaTop: number): number {
  return os === "ios" ? safeAreaTop + iosCompactNavigationBarHeight(version) : 0;
}

// Expose internal helpers for unit tests via a side-channel export.
export const __test = { bucketFor, groupByDate, flattenSections };

export function NotificationsPage({
  items,
  refreshing,
  onRefresh,
  emptyState,
  emptyTitle,
  emptyBody,
  className,
  testID = "notifications-page",
  slots = NO_SLOTS,
  slotProps = NO_SLOTS,
  stickyHeaderOffset,
}: NotificationsPageProps) {
  // The context, not useSafeAreaInsets(): before a provider has measured (tests, the first frame) it is null, not a throw.
  const safeTop = useContext(SafeAreaInsetsContext)?.top ?? 0;
  const stickAt = stickyHeaderOffset ?? defaultStickyHeaderOffset(Platform.OS, Platform.Version, safeTop);
  // Note: header props (headerTitle, headerLeft, headerRight, large,
  // scrollEdgeBehavior, headerOptions) are accepted on the type for API
  // ergonomics but consumed by getNotificationsPageStackOptions() at the
  // consumer's <Stack.Screen> level — not by this component.

  const sections = useMemo(() => groupByDate(items), [items]);
  // FlashList v2 (`modules.list`) has no SectionList: the sections become one
  // flat list whose header rows stick (FlashList's own section-list recipe).
  const { list: FlashList } = useGenesisModules();
  const flat = useMemo(() => flattenSections(sections), [sections]);
  // Stable, so a parent re-render doesn't re-render every visible cell.
  const renderFlatRow = useCallback(
    ({ item: row }: { item: FlatRow }) =>
      row.kind === "header" ? (
        renderSlot(DefaultSectionHeader, slots.sectionHeader, { title: row.title }, slotProps.sectionHeader)
      ) : (
        <>
          {renderSlot(DefaultRow, slots.row, { ...row.item, testID: row.item.testID ?? `${testID}-row-${row.item.id}` }, slotProps.row)}
          {row.last ? null : <RowSeparator />}
        </>
      ),
    [slots, slotProps, testID],
  );

  if (items.length === 0) {
    // A scroll view, like the lists below: iOS insets only scroll views for the large-title
    // header and the tab bar, so a plain view would sit under the header (and the Dynamic Island).
    return (
      <SafeAreaView
        testID={testID}
        edges={["left", "right", "bottom"]}
        className={cn("flex-1 bg-background", className)}
      >
        <ScrollView
          testID={`${testID}-empty-scroll`}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          refreshControl={
            onRefresh ? (
              <RefreshControl testID={`${testID}-refresh`} refreshing={!!refreshing} onRefresh={onRefresh} />
            ) : undefined
          }
        >
          {emptyState ??
            renderSlot(
              DefaultEmpty,
              slots.empty,
              {
                title: emptyTitle ?? "No notifications",
                body: emptyBody ?? "When you get a notification, it'll show up here.",
                testID: `${testID}-empty`,
              },
              slotProps.empty,
            )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (FlashList) {
    return (
      <SafeAreaView
        testID={testID}
        edges={["left", "right", "bottom"]}
        className={cn("flex-1 bg-background", className)}
      >
        <FlashList
          testID={`${testID}-list`}
          data={flat.rows}
          keyExtractor={flatRowKey}
          getItemType={flatRowType}
          stickyHeaderIndices={flat.headerIndices}
          // Under the native header, not under the status bar.
          stickyHeaderConfig={{ offset: stickAt }}
          renderItem={renderFlatRow}
          refreshing={onRefresh ? !!refreshing : undefined}
          onRefresh={onRefresh ? () => void onRefresh() : undefined}
          contentContainerStyle={{ paddingBottom: 28 }}
        />
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
        renderSectionHeader={({ section }) =>
          renderSlot(DefaultSectionHeader, slots.sectionHeader, { title: section.title }, slotProps.sectionHeader)
        }
        renderItem={({ item }) =>
          renderSlot(DefaultRow, slots.row, { ...item, testID: item.testID ?? `${testID}-row-${item.id}` }, slotProps.row)
        }
        ItemSeparatorComponent={RowSeparator}
        // React Native's sticky headers pin to the very top of the list, which is under the native
        // header on iOS, with no offset to move them down: with one, the headers scroll with
        // their rows instead. (FlashList, `modules.list`, sticks them under the header.)
        stickySectionHeadersEnabled={stickAt === 0}
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

function RowSeparator() {
  return <View className="h-px bg-border ml-4" />;
}

function DefaultSectionHeader({ title }: NotificationsPageSlotMap["sectionHeader"]) {
  return <NativeSectionListHeader title={title} />;
}

function DefaultRow(item: NotificationsPageSlotMap["row"]) {
  return (
    <NativeListItem
      testID={item.testID}
      title={item.title}
      subtitle={item.body}
      leading={item.leading ?? <UnreadDot unread={!!item.unread} testID={`${item.testID}-unread`} />}
      onPress={item.onPress}
    />
  );
}

function DefaultEmpty({ title, body, testID }: NotificationsPageSlotMap["empty"]) {
  return <NativeEmptyState variant="first-run" title={title} body={body} testID={testID} />;
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
