/**
 * InboxPage — a list of conversations or tickets: unread state, a time, a
 * preview line, swipe actions, pull to refresh, paging and an empty state.
 *
 * Generic: the rows are whatever the app has (support reports, direct
 * messages, an idea board). Data and actions come in as props; the layout
 * draws them the platform's way. On iOS it is the Settings app's inset
 * grouped style, like `SettingsPage`: the page is `groupedBackground`, the
 * rows one rounded group on `surface` with hairline separators that start at
 * the text. On Android rows are full width.
 *
 * Swipe actions: each row's `swipeActions` are always reachable without a
 * gesture library, as VoiceOver / TalkBack custom actions and on long press
 * (a menu). For the swipe itself, fill the `swipeable` slot with your
 * gesture-handler wrapper (`ReanimatedSwipeable` from
 * react-native-gesture-handler, an optional peer); it receives the actions
 * and the row.
 *
 * Slots: `row`, `swipeable`, `header` (above the group), `footer` (below it,
 * the paging spinner by default) and `empty`. `slots` swaps a part for your
 * component (same props), `slotProps` feeds the default more props, `null`
 * drops it.
 *
 * Header: `getInboxPageStackOptions()` for `<Stack.Screen options>`.
 *
 * @stability Beta
 */
import { Fragment, useState, type ReactNode } from "react";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { NativeEmptyState } from "../components/empty-state";
import { NativeText } from "../components/text";
import { NativeButton } from "../components/button";
import { NativeBadge } from "../components/badge";
import { composeHeaderOptions, type ScreenHeaderProps } from "./screen-container";

/** An action on a row: swipe, long press, or an accessibility action. */
export interface InboxSwipeAction {
  id: string;
  label: string;
  onPress: () => void;
  /** Destructive tone (delete, leave). */
  destructive?: boolean;
}

export interface InboxItem {
  /** Stable id for keying. */
  id: string;
  title: string;
  /** The latest message or a summary, at most two lines. */
  preview?: string;
  /** When it last changed. Shown as a short time or date. */
  timestamp?: string | Date;
  /** Something new the person hasn't read: a dot, and the title in bold. */
  unread?: boolean;
  /** How many unread messages; shown as a count instead of the dot when above 0. */
  unreadCount?: number;
  /** A short status shown under the preview ("In progress", "12 votes"). */
  meta?: string;
  /** Replaces the unread dot (an avatar, an icon). */
  leading?: ReactNode;
  /** Shown at the end of the row (a vote button, a badge). Replaces the chevron. */
  trailing?: ReactNode;
  /** Opens the conversation. Rows with `onPress` show a chevron unless `trailing` is set. */
  onPress?: () => void;
  swipeActions?: InboxSwipeAction[];
  /** testID override. Default `<page testID>-row-<id>`. */
  testID?: string;
}

/** The parts `slots` and `slotProps` reach, with the props each receives. */
export type InboxPageSlotMap = {
  row: InboxItem & { testID: string; isFirst: boolean; isLast: boolean; timeLabel: string | null };
  swipeable: { actions: InboxSwipeAction[]; testID: string; children?: ReactNode };
  header: { testID: string };
  footer: { loadingMore: boolean; testID: string };
  empty: { title: string; body: string; actionLabel?: string; onAction?: () => void; testID: string };
};

export interface InboxPageProps extends ScreenHeaderProps {
  /** Newest first, as they should show. Empty → the empty state. */
  items: InboxItem[];
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  /** Called near the end of the list, to load the next page. */
  onEndReached?: () => void;
  /** A next page is loading: the default footer shows a spinner. */
  loadingMore?: boolean;
  /** Above the group (a filter, a call to action). Prefer `slots.header` for a component. */
  header?: ReactNode;
  /** An optional title over the group, in the Settings header style. */
  sectionTitle?: string;
  emptyTitle?: string;
  emptyBody?: string;
  /** The first page is loading: a spinner instead of the empty state. */
  loading?: boolean;
  /** The read failed: the empty slot shows `errorTitle` / `errorBody` instead (and pull to refresh retries). */
  error?: boolean;
  errorTitle?: string;
  errorBody?: string;
  /** A button in the empty state ("Send feedback"). */
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  /** How a row's time reads. Default: the time today, "Yesterday", the weekday this week, else the date. */
  formatTime?: (date: Date, now: Date) => string;
  /** The clock, for tests. */
  now?: () => Date;
  slots?: Slots<InboxPageSlotMap>;
  slotProps?: SlotPropsFor<InboxPageSlotMap>;
  /** testID on the root. Default `"inbox-page"`. */
  testID?: string;
}

/** `<Stack.Screen options>` for an InboxPage: a large title that collapses on scroll. */
export function getInboxPageStackOptions(props: ScreenHeaderProps & { headerTitle?: string }): Record<string, unknown> {
  return composeHeaderOptions({
    headerTitle: props.headerTitle ?? "Inbox",
    large: props.large ?? true,
    scrollEdgeBehavior: props.scrollEdgeBehavior ?? "match",
    headerLeft: props.headerLeft,
    headerRight: props.headerRight,
    headerOptions: props.headerOptions,
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The default row time: `9:41`, `Yesterday`, `Monday`, then a short date. */
export function formatInboxTime(date: Date, now: Date): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / DAY_MS);
  if (days <= 0) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

/** UIKit's inset grouped margin on a phone, in points (as SettingsPage). */
const IOS_GROUP_MARGIN = 16;

function iosGroupRadius(): number {
  return Number.parseFloat(String(Platform.Version)) >= 26 ? 26 : 10;
}

export function InboxPage({
  items,
  refreshing,
  onRefresh,
  onEndReached,
  loadingMore = false,
  header,
  sectionTitle,
  emptyTitle,
  emptyBody,
  emptyActionLabel,
  onEmptyAction,
  loading = false,
  error = false,
  errorTitle,
  errorBody,
  formatTime = formatInboxTime,
  now = () => new Date(),
  slots = {},
  slotProps = {},
  testID = "inbox-page",
}: InboxPageProps) {
  const colors = useThemeRoles();
  const clock = now();
  const rows: InboxPageSlotMap["row"][] = items.map((item, index) => ({
    ...item,
    testID: item.testID ?? `${testID}-row-${item.id}`,
    isFirst: index === 0,
    isLast: index === items.length - 1,
    timeLabel: item.timestamp ? formatTime(typeof item.timestamp === "string" ? new Date(item.timestamp) : item.timestamp, clock) : null,
  }));

  const headerNode = (
    <View>
      {header ?? renderSlot(EmptyPart, slots.header, { testID: `${testID}-header` }, slotProps.header)}
      {sectionTitle ? <SectionTitle title={sectionTitle} testID={`${testID}-section-title`} /> : null}
    </View>
  );

  if (items.length === 0) {
    return (
      <SafeAreaView testID={testID} edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
        {headerNode}
        {loading ? (
          <View testID={`${testID}-loading`} style={{ paddingVertical: 32 }}>
            <ActivityIndicator accessibilityLabel="Loading" />
          </View>
        ) : (
          renderSlot(
            DefaultEmpty,
            slots.empty,
            error
              ? {
                  title: errorTitle ?? "Couldn't load this",
                  body: errorBody ?? "Check your connection, then pull to refresh.",
                  actionLabel: onRefresh ? "Try again" : undefined,
                  onAction: onRefresh ? () => void onRefresh() : undefined,
                  testID: `${testID}-error`,
                }
              : {
                  title: emptyTitle ?? "Nothing here yet",
                  body: emptyBody ?? "When there's something new, it shows up here.",
                  actionLabel: emptyActionLabel,
                  onAction: onEmptyAction,
                  testID: `${testID}-empty`,
                },
            slotProps.empty,
          )
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView testID={testID} edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
      <FlatList
        testID={`${testID}-list`}
        data={rows}
        keyExtractor={(row) => row.id}
        contentInsetAdjustmentBehavior="automatic"
        // The header can hold a text field (the idea board's "Suggest"): its button's first tap
        // must press it, not only close the keyboard.
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={headerNode}
        ListFooterComponent={renderSlot(DefaultFooter, slots.footer, { loadingMore, testID: `${testID}-footer` }, slotProps.footer)}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={onRefresh ? <RefreshControl testID={`${testID}-refresh`} refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
        renderItem={({ item: row }) => {
          const content = renderSlot(DefaultRow, slots.row, row, slotProps.row);
          const actions = row.swipeActions ?? [];
          return (
            <Fragment>
              {actions.length && slots.swipeable !== null
                ? renderSlot(PassThroughSwipeable, slots.swipeable, { actions, testID: `${row.testID}-swipe`, children: content }, slotProps.swipeable)
                : content}
            </Fragment>
          );
        }}
      />
    </SafeAreaView>
  );
}

function EmptyPart(_props: InboxPageSlotMap["header"]) {
  return null;
}

/** The default `swipeable`: no gesture, just the row (its actions are on long press and in the accessibility actions). */
function PassThroughSwipeable({ children }: InboxPageSlotMap["swipeable"]) {
  return <>{children}</>;
}

function SectionTitle({ title, testID }: { title: string; testID: string }) {
  const colors = useThemeRoles();
  const ios = Platform.OS === "ios";
  return (
    <NativeText
      testID={testID}
      accessibilityRole="header"
      className={ios ? "px-4 pb-1.5 pt-2" : "px-4 pb-2 pt-4 text-primary"}
      style={
        ios
          ? { marginHorizontal: IOS_GROUP_MARGIN, color: colors.secondaryLabel, fontSize: 13, lineHeight: 18, textTransform: "uppercase" }
          : { fontSize: 14, lineHeight: 20, fontWeight: "500" }
      }
    >
      {title}
    </NativeText>
  );
}

/** Opens a row's actions as a menu (long press). */
export function showInboxActions(title: string, actions: InboxSwipeAction[], cancelLabel = "Cancel"): void {
  Alert.alert(title, undefined, [
    ...actions.map((a) => ({ text: a.label, style: a.destructive ? ("destructive" as const) : ("default" as const), onPress: a.onPress })),
    { text: cancelLabel, style: "cancel" as const },
  ]);
}

function DefaultRow(row: InboxPageSlotMap["row"]) {
  const colors = useThemeRoles();
  const ios = Platform.OS === "ios";
  const [pressed, setPressed] = useState(false);
  const actions = row.swipeActions ?? [];
  const radius = iosGroupRadius();
  const unreadLabel = row.unreadCount && row.unreadCount > 0 ? `${row.unreadCount} unread` : row.unread ? "Unread" : null;
  const label = [unreadLabel, row.title, row.timeLabel, row.preview, row.meta].filter(Boolean).join(", ");
  return (
    <View
      testID={`${row.testID}-cell`}
      style={[
        { backgroundColor: colors.surface },
        ios
          ? {
              marginHorizontal: IOS_GROUP_MARGIN,
              borderTopLeftRadius: row.isFirst ? radius : 0,
              borderTopRightRadius: row.isFirst ? radius : 0,
              borderBottomLeftRadius: row.isLast ? radius : 0,
              borderBottomRightRadius: row.isLast ? radius : 0,
              overflow: "hidden",
            }
          : null,
      ]}
    >
      <Pressable
        testID={row.testID}
        accessibilityRole={row.onPress ? "button" : undefined}
        accessibilityLabel={label}
        accessibilityActions={actions.map((a) => ({ name: a.id, label: a.label }))}
        onAccessibilityAction={(event) => actions.find((a) => a.id === event.nativeEvent.actionName)?.onPress()}
        onPress={row.onPress}
        onLongPress={actions.length ? () => showInboxActions(row.title, actions) : undefined}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11, minHeight: 60, backgroundColor: pressed && row.onPress ? colors.fill : undefined }}
      >
        <View style={{ width: 18, alignItems: "flex-start" }}>
          {row.leading ?? (row.unreadCount && row.unreadCount > 0 ? null : <UnreadDot unread={!!row.unread} testID={`${row.testID}-unread`} color={colors.tint} />)}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <NativeText
              numberOfLines={1}
              style={{ flex: 1, color: colors.label, fontSize: 17, lineHeight: 22, fontWeight: row.unread || (row.unreadCount ?? 0) > 0 ? "600" : "400" }}
            >
              {row.title}
            </NativeText>
            {row.timeLabel ? (
              <NativeText testID={`${row.testID}-time`} style={{ marginLeft: 8, color: colors.secondaryLabel, fontSize: 15, lineHeight: 20 }}>
                {row.timeLabel}
              </NativeText>
            ) : null}
          </View>
          {row.preview ? (
            <NativeText numberOfLines={2} style={{ marginTop: 2, color: colors.secondaryLabel, fontSize: 15, lineHeight: 20 }}>
              {row.preview}
            </NativeText>
          ) : null}
          {row.meta ? (
            <NativeText testID={`${row.testID}-meta`} style={{ marginTop: 4, color: colors.tertiaryLabel, fontSize: 13, lineHeight: 18 }}>
              {row.meta}
            </NativeText>
          ) : null}
        </View>
        {row.unreadCount && row.unreadCount > 0 ? (
          <View style={{ marginLeft: 8 }}>
            <NativeBadge testID={`${row.testID}-count`}>{String(row.unreadCount)}</NativeBadge>
          </View>
        ) : null}
        {row.trailing ? <View style={{ marginLeft: 8 }}>{row.trailing}</View> : row.onPress ? <Chevron color={colors.tertiaryLabel} /> : null}
      </Pressable>
      {row.isLast ? null : (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", height: StyleSheet.hairlineWidth }}>
          <View style={{ width: 34 }} />
          <View testID={`${row.testID}-separator-line`} style={{ flex: 1, backgroundColor: colors.separator }} />
        </View>
      )}
    </View>
  );
}

function Chevron({ color }: { color: unknown }) {
  return (
    <NativeText accessibilityElementsHidden importantForAccessibility="no" style={{ marginLeft: 8, color: color as string, fontSize: 20, lineHeight: 22 }}>
      ›
    </NativeText>
  );
}

function UnreadDot({ unread, testID, color }: { unread: boolean; testID: string; color: unknown }) {
  if (!unread) return <View testID={testID} style={{ width: 10, height: 10 }} />;
  return <View testID={testID} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color as string }} />;
}

function DefaultFooter({ loadingMore, testID }: InboxPageSlotMap["footer"]) {
  if (!loadingMore) return null;
  return (
    <View testID={testID} style={{ paddingVertical: 16 }}>
      <ActivityIndicator accessibilityLabel="Loading more" />
    </View>
  );
}

function DefaultEmpty({ title, body, actionLabel, onAction, testID }: InboxPageSlotMap["empty"]) {
  return (
    <NativeEmptyState
      variant="first-run"
      title={title}
      body={body}
      testID={testID}
      primaryAction={
        actionLabel && onAction ? (
          <NativeButton onPress={onAction} testID={`${testID}-action`}>
            {actionLabel}
          </NativeButton>
        ) : undefined
      }
    />
  );
}
