/**
 * @feat:chat
 * Your conversations, as Messages draws them on iOS 26: plain full-width rows on the page, a blue
 * dot for unread, a 40 pt face, the name in semibold, two grey lines of the last message, the
 * time and a chevron, hairlines inset to the text. Pinned conversations are large faces above the
 * rows. Each row has Messages' actions (`inboxRowActions`, through genesis-ui-native's
 * `NativeRowActions`): swipe right for Mark as Unread (or Read) and Pin, left for Hide Alerts and
 * Delete (for you, after asking), round buttons, the row a grey pill while open; a long press
 * shows the conversation's latest messages over a menu of every action, Archive included; every
 * action is also a screen reader action on the row.
 *
 * The screen is the whole of Messages: the stack's own header with a large title (it collapses as
 * the list, the screen's scroll view, scrolls), Back on the left when `onBack` is given, the filter
 * menu (All, Unread, Groups and the app's own, then Archived, Scheduled and the app's own entries)
 * and Compose on the right, as native header items; the glass search field at the bottom; and no
 * tab bar. The header needs `GenesisModules.router` (`StackScreen`), the tab bar
 * `TabBarVisibilityProvider`; `nativeHeader={false}` leaves both to the app.
 *
 * Every part is a slot (`slots` / `slotProps`, Genesis's slot contract): `row`, `pinned`,
 * `searchField`, `listHeader` and `empty`.
 */
import { memo, useCallback, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Alert, FlatList, Platform, RefreshControl, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RowSwipeAction } from "@marktiderman/genesis-core/row-actions";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { NativeEmptyState, NativeLoadingState, NativeRowActions, NativeText, useGenesisModules, type NativeIconName } from "@marktiderman/genesis-ui-native/components";
import { composeHeaderOptions, useHideTabBar, type InboxItem, type InboxPageProps } from "@marktiderman/genesis-ui-native/layouts";
import type { ChatInboxItem } from "../core/types";
import { inboxRowActions, useChat, useInbox, useInboxActions, usePeople, usePerson, type ChatAttachmentKind, type ChatConfirm } from "../react/index";
import { attachmentPreview } from "./attachment-cards";
import { fill, type ChatNativeCopy } from "./copy";
import { useChatNative, type ChatPerson } from "./context";
import { displayBody } from "./message-bubble";
import { CHAT_METRICS, CHAT_TYPE, ChatFace, ChatGlassCircle, ChatGlassPanel, ChatSymbol, ChatTap, useChatColors } from "./messages-look";
import { inboxTimeLabel } from "./messages-time";
import { ChatConversationPreview } from "./conversation-preview";

// ---- Filters and menu --------------------------------------------------------------------------

/** One of the inbox's filters, in the header's filter menu. */
export interface ChatInboxFilter {
  id: string;
  label: string;
  /** Genesis's icon, and the SF Symbol for it on iOS. */
  icon?: NativeIconName;
  sf?: string;
  /** Which conversations it shows. */
  predicate: (item: ChatInboxItem, context: { me: string }) => boolean;
  /** Their order, when not the inbox's (newest first). */
  sort?: (a: ChatInboxItem, b: ChatInboxItem) => number;
  /** Its own empty state's title. */
  emptyTitle?: string;
}

/** An entry under the filters in the header's menu (Archived, Scheduled, the app's own). */
export interface ChatInboxMenuItem {
  id: string;
  label: string;
  icon?: NativeIconName;
  sf?: string;
  onPress: () => void;
}

/** A group: a conversation of more than two people, or a kind that isn't direct with a title. */
export function isGroupConversation(item: Pick<ChatInboxItem, "kind" | "memberCount">): boolean {
  return item.kind !== "direct" && (item.kind === "group" || item.memberCount > 2);
}

/** The conversation with yourself: direct, and you its only member. It shows your own face. */
export function isSelfConversation(item: Pick<ChatInboxItem, "kind" | "otherUserId" | "memberCount">): boolean {
  return item.kind === "direct" && item.otherUserId === null && item.memberCount === 1;
}

/** The inbox's own filters: All Messages, Unread and Groups. */
export function defaultInboxFilters(copy: Pick<ChatNativeCopy, "filterAll" | "filterUnread" | "filterGroups" | "noUnreadTitle">): ChatInboxFilter[] {
  return [
    { id: "all", label: copy.filterAll, icon: "message", sf: "tray", predicate: () => true },
    { id: "unread", label: copy.filterUnread, icon: "message-unread", sf: "message.badge", predicate: (i) => i.unread > 0, emptyTitle: copy.noUnreadTitle },
    { id: "groups", label: copy.filterGroups, icon: "user", sf: "person.2", predicate: isGroupConversation },
  ];
}

/** The conversations a filter shows, in its order. */
export function applyInboxFilter<T extends ChatInboxItem>(items: readonly T[], filter: ChatInboxFilter | undefined, me: string): T[] {
  if (!filter) return [...items];
  const shown = items.filter((i) => filter.predicate(i, { me }));
  return filter.sort ? shown.sort(filter.sort) : shown;
}

/** The pinned faces above the rows: at most eight, in the inbox's order. */
export function pinnedConversations<T extends Pick<ChatInboxItem, "pinned" | "archived">>(items: readonly T[], max = 8): T[] {
  return items.filter((i) => i.pinned && !i.archived).slice(0, max);
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Whether a conversation matches what's typed in the search field: its title, the other person's name or its last message. */
export function matchesInboxSearch(item: Pick<ChatInboxItem, "title" | "otherUserId" | "lastMessage">, query: string, nameOf: (userId: string | null) => string | undefined): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const fields = [item.title, nameOf(item.otherUserId), item.lastMessage && !item.lastMessage.deleted ? item.lastMessage.body : null];
  return fields.some((f) => Boolean(f) && fold(f as string).includes(q));
}

/** The header's filter menu and Compose, as react-native-screens' native header items. */
export function inboxHeaderItems(options: {
  filters: readonly ChatInboxFilter[];
  active: string;
  onFilter: (id: string) => void;
  menu: readonly ChatInboxMenuItem[];
  onCompose?: () => void;
  copy: Pick<ChatNativeCopy, "filters" | "filterMenuTitle" | "startConversation">;
  tint: unknown;
}): unknown[] {
  const { filters, active, onFilter, menu, onCompose, copy, tint } = options;
  const filtered = active !== (filters[0]?.id ?? "all");
  const items: unknown[] = [];
  if (filters.length > 1 || menu.length) {
    items.push({
      type: "menu",
      identifier: "genesis-chat-inbox-filters",
      icon: { type: "sfSymbol", name: filtered ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease" },
      accessibilityLabel: copy.filters,
      tintColor: tint,
      menu: {
        items: [
          ...(filters.length > 1
            ? [
                {
                  type: "submenu",
                  title: copy.filterMenuTitle,
                  displayInline: true,
                  singleSelection: true,
                  items: filters.map((f) => ({ type: "action", title: f.label, ...(f.sf ? { icon: { type: "sfSymbol", name: f.sf } } : {}), state: f.id === active ? "on" : "off", onPress: () => onFilter(f.id) })),
                },
              ]
            : []),
          ...(menu.length
            ? [{ type: "submenu", displayInline: true, items: menu.map((m) => ({ type: "action", title: m.label, ...(m.sf ? { icon: { type: "sfSymbol", name: m.sf } } : {}), onPress: m.onPress })) }]
            : []),
        ],
      },
    });
  }
  if (onCompose) {
    items.push({ type: "button", identifier: "genesis-chat-inbox-compose", icon: { type: "sfSymbol", name: "square.and.pencil" }, accessibilityLabel: copy.startConversation, tintColor: tint, onPress: onCompose });
  }
  return items;
}

// ---- Slots -------------------------------------------------------------------------------------

/** A row as the inbox draws it. */
export interface ChatInboxRowData {
  id: string;
  item: ChatInboxItem;
  title: string;
  preview?: string;
  time: string | null;
  unread: boolean;
  muted: boolean;
  pinned: boolean;
  meta?: string;
  /** Who it is: a face's name and picture (null name: a person, as for the conversation with yourself). */
  face: { name: string | null; src: string | null };
  onPress: () => void;
  actions: readonly RowSwipeAction[];
}

/** The parts `slots` and `slotProps` reach. */
export type ChatInboxSlotMap = {
  /** One row's content (the actions wrap it). */
  row: { row: ChatInboxRowData; last: boolean; testID: string };
  /** The pinned faces above the rows. */
  pinned: { rows: ChatInboxRowData[]; testID: string };
  /** The glass search field at the bottom. */
  searchField: { value: string; onChange: (text: string) => void; onSubmit?: (text: string) => void; testID: string };
  /** Above the pins (a search's "Search messages for…"). */
  listHeader: { query: string; onSearchMessages?: (query: string) => void; testID: string };
  /** What shows when nothing does. */
  empty: { title: string; body?: string; actionLabel?: string; onAction?: () => void; loading: boolean; testID: string };
};

export interface ChatInboxScreenProps {
  /** Opens a conversation (`router.push(chatPath(id))`). */
  onOpen: (conversationId: string) => void;
  /** Starts one (opens your people picker, or `ChatStartSheet`). The empty state's button, and Compose by default. */
  onStart?: () => void;
  /** Compose in the header. Default `onStart`. */
  onCompose?: () => void;
  /** Back on the left of the header, for an inbox that isn't the root of its stack's first screen. */
  onBack?: () => void;
  /** The large title. Default `copy.inboxTitle` ("Messages"). */
  title?: string;
  /** One kind only. */
  kind?: string;
  /** Only these kinds. */
  kinds?: string[];
  /** Every kind but these (`["support"]` keeps support tickets out of a messages inbox). */
  excludeKinds?: string[];
  archived?: boolean;
  /**
   * Each row's actions: receives the conversation and the default set (`inboxRowActions`:
   * Messages' Unread, Pin, Hide Alerts, Delete for me and Archive) and returns the row's.
   */
  rowActions?: (item: ChatInboxItem, defaults: RowSwipeAction[]) => RowSwipeAction[];
  /**
   * The filter menu's filters: receives the defaults (All Messages, Unread, Groups) and returns
   * the menu's, in order. Add one with an id, label, icon and predicate.
   */
  filters?: (defaults: ChatInboxFilter[]) => ChatInboxFilter[];
  /** The filter shown, to control it; with `onFilterChange`. Default: the first filter, kept here. */
  filter?: string;
  onFilterChange?: (id: string) => void;
  /** Opens the archived conversations (a screen with `archived`): the menu's Archived. */
  onOpenArchived?: () => void;
  /** Opens your scheduled messages (`ChatScheduledList`): the menu's Scheduled Messages. */
  onOpenScheduled?: () => void;
  /** The menu's entries under the filters: receives Archived and Scheduled (as given) and returns the menu's. */
  menuItems?: (defaults: ChatInboxMenuItem[]) => ChatInboxMenuItem[];
  /** Searches the messages themselves (`ChatSearchScreen`): "Search messages for…" and the field's Search key. */
  onSearchMessages?: (query: string) => void;
  /** The search field at the bottom. Default true. */
  search?: boolean;
  /** Pinned conversations as faces above the rows. Default true. */
  pinned?: boolean;
  /** Sets the stack's header and hides the tab bar while the screen shows. Default true. */
  nativeHeader?: boolean;
  slots?: Slots<ChatInboxSlotMap>;
  slotProps?: SlotPropsFor<ChatInboxSlotMap>;
  /**
   * @deprecated The inbox no longer draws InboxPage: its `header` goes over the list, and
   * `emptyTitle` and `emptyBody` name the empty state. Use `slots` for anything else.
   */
  pageProps?: Partial<Omit<InboxPageProps, "items">>;
  testID?: string;
}

/** An inbox row from a conversation, on genesis-ui-native's `InboxItem`. Exported for apps that build their own list. */
export function inboxRow(
  item: ChatInboxItem,
  ctx: {
    me: string;
    copy: ChatNativeCopy;
    person: (id: string | null) => ChatPerson | undefined;
    /** The app's attachment kinds: a last message that is a card reads as its title ("Check-in"). */
    kinds?: Record<string, ChatAttachmentKind>;
  },
): Omit<InboxItem, "onPress" | "swipeActions"> {
  const other = item.otherUserId ? ctx.person(item.otherUserId) : undefined;
  const self = isSelfConversation(item);
  const title = item.title ?? other?.name ?? ctx.copy.untitled;
  const last = item.lastMessage;
  const text = last ? attachmentPreview(displayBody(last.body), last.attachment, ctx.kinds, last.deleted) : "";
  const preview = last && text && last.senderId === ctx.me && last.kind !== "system" ? `${ctx.copy.youPrefix}${text}` : text;
  const me = self ? ctx.person(ctx.me) : undefined;
  return {
    id: item.conversationId,
    title,
    preview: preview || undefined,
    timestamp: item.lastMessageAt ?? undefined,
    unread: item.unread > 0,
    unreadCount: item.unread,
    meta: item.mentioned ? ctx.copy.mentionedYou : undefined,
    muted: item.muted,
    pinned: item.pinned,
    avatar: <ChatFace name={self ? null : title} src={(self ? me?.avatarUrl : other?.avatarUrl) ?? null} recyclingKey={item.conversationId} />,
  };
}

/** Asks with the system alert: Cancel, then the destructive action. */
export function alertConfirm(cancelLabel: string): ChatConfirm {
  return (title, body, confirmLabel) =>
    new Promise((resolve) =>
      Alert.alert(title, body, [
        { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, style: "destructive", onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) }),
    );
}

const NO_SLOTS: Slots<ChatInboxSlotMap> = Object.freeze({});
const NO_SLOT_PROPS: SlotPropsFor<ChatInboxSlotMap> = Object.freeze({});

export function ChatInboxScreen(props: ChatInboxScreenProps) {
  const { onOpen, onStart, kind, kinds, excludeKinds, archived = false, rowActions, search = true, pinned: showPinned = true, nativeHeader = true, slots = NO_SLOTS, slotProps = NO_SLOT_PROPS, pageProps, testID = "chat-inbox" } = props;
  const { userId, attachmentKinds } = useChat();
  const act = useInboxActions();
  const { copy, person: known } = useChatNative();
  const c = useChatColors();
  const insets = useSafeAreaInsets();
  // The header and the tab bar are set through the app's router module; without it, the app's own.
  const hasRouter = Boolean(useGenesisModules().router?.StackScreen);
  const inbox = useInbox({ kind, kinds, excludeKinds, archived });
  const others = useMemo(() => inbox.items.map((i) => i.otherUserId), [inbox.items]);
  const people = usePeople(others);
  const meCard = usePerson(userId);
  const person = useCallback((id: string | null | undefined) => known(id) ?? (id ? people[id] : undefined) ?? (id === userId && meCard ? meCard : undefined), [known, people, userId, meCard]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const filters = useMemo(() => {
    const defaults = defaultInboxFilters(copy);
    return props.filters ? props.filters(defaults) : defaults;
  }, [copy, props.filters]);
  const [ownFilter, setOwnFilter] = useState(filters[0]?.id ?? "all");
  const activeId = props.filter ?? ownFilter;
  const setFilter = useCallback(
    (id: string) => {
      setOwnFilter(id);
      props.onFilterChange?.(id);
    },
    [props.onFilterChange],
  );
  const active = filters.find((f) => f.id === activeId) ?? filters[0];

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await inbox.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [inbox]);

  // A row action that fails says so, rather than leaving the row as it was without a word.
  const options = useMemo(
    () => ({
      confirm: alertConfirm(copy.cancel),
      onError: (e: unknown) => Alert.alert(copy.actionFailed, e instanceof Error ? e.message : undefined),
    }),
    [copy],
  );

  const nameOf = useCallback((id: string | null) => person(id)?.name, [person]);
  const searching = query.trim().length > 0;
  const visible = useMemo(() => {
    const filtered = applyInboxFilter(inbox.items, archived ? undefined : active, userId);
    return searching ? filtered.filter((i) => matchesInboxSearch(i, query, nameOf)) : filtered;
  }, [inbox.items, archived, active, userId, searching, query, nameOf]);
  const pinsShown = showPinned && !archived && !searching && active?.id === filters[0]?.id;
  const pinnedIds = useMemo(() => new Set(pinsShown ? pinnedConversations(inbox.items).map((i) => i.conversationId) : []), [pinsShown, inbox.items]);

  const now = new Date();
  const toRow = (item: ChatInboxItem): ChatInboxRowData => {
    const row = inboxRow(item, { me: userId, copy, person, kinds: attachmentKinds });
    const self = isSelfConversation(item);
    const other = item.otherUserId ? person(item.otherUserId) : undefined;
    const defaults = inboxRowActions(item, act, copy, options);
    return {
      id: item.conversationId,
      item,
      title: row.title,
      preview: row.preview,
      time: inboxTimeLabel(item.lastMessageAt, now),
      unread: item.unread > 0,
      muted: item.muted,
      pinned: item.pinned,
      meta: row.meta,
      face: self ? { name: null, src: meCard?.avatarUrl ?? null } : { name: row.title, src: other?.avatarUrl ?? null },
      onPress: () => onOpen(item.conversationId),
      actions: rowActions ? rowActions(item, defaults) : defaults,
    };
  };
  const pinnedRows = visible.filter((i) => pinnedIds.has(i.conversationId)).map(toRow);
  const rows = visible.filter((i) => !pinnedIds.has(i.conversationId)).map(toRow);

  // ---- The header ----
  const menu = useMemo(() => {
    const defaults: ChatInboxMenuItem[] = [
      ...(props.onOpenArchived ? [{ id: "archived", label: copy.archived, icon: "archive" as const, sf: "archivebox", onPress: props.onOpenArchived }] : []),
      ...(props.onOpenScheduled ? [{ id: "scheduled", label: copy.scheduledMessages, icon: "calendar" as const, sf: "calendar.badge.clock", onPress: props.onOpenScheduled }] : []),
    ];
    return props.menuItems ? props.menuItems(defaults) : defaults;
  }, [props.onOpenArchived, props.onOpenScheduled, props.menuItems, copy]);
  const onCompose = props.onCompose ?? onStart;
  const title = props.title ?? (archived ? copy.archived : copy.inboxTitle);

  const listHeader = (
    <View>
      {pageProps?.header}
      {renderSlot(SearchMessagesRow, slots.listHeader, { query, onSearchMessages: props.onSearchMessages, testID: `${testID}-search-messages` }, slotProps.listHeader)}
      {pinnedRows.length ? renderSlot(ChatPinnedFaces, slots.pinned, { rows: pinnedRows, testID: `${testID}-pins` }, slotProps.pinned) : null}
    </View>
  );

  const filteredEmpty = !archived && (searching || active?.id !== filters[0]?.id);
  const loading = inbox.isLoading;
  const empty = renderSlot(
    InboxEmpty,
    slots.empty,
    {
      loading,
      title: inbox.error
        ? copy.inboxErrorTitle
        : searching
          ? copy.noMatchTitle
          : filteredEmpty
            ? (active?.emptyTitle ?? copy.filteredEmptyTitle)
            : (pageProps?.emptyTitle ?? copy.inboxEmptyTitle),
      body: searching ? (props.onSearchMessages ? copy.noMatchBody : undefined) : filteredEmpty ? undefined : (pageProps?.emptyBody ?? copy.inboxEmptyBody),
      actionLabel: !filteredEmpty && onStart ? copy.startConversation : undefined,
      onAction: !filteredEmpty ? onStart : undefined,
      testID: inbox.error ? `${testID}-error` : `${testID}-empty`,
    },
    slotProps.empty,
  );

  const rowSlot = slots.row;
  const rowExtra = slotProps.row;
  const renderItem = useCallback(
    ({ item, index }: { item: ChatInboxRowData; index: number }) => <InboxRow row={item} last={index === rows.length - 1} slot={rowSlot} extra={rowExtra} testID={`${testID}-row-${item.id}`} />,
    [rows.length, rowSlot, rowExtra, testID],
  );

  return (
    <>
      {/* The list is the screen's first view and its scroll view, so the large title collapses with it. */}
      <FlatList
        testID={testID}
        data={rows}
        keyExtractor={rowKey}
        renderItem={renderItem}
        style={{ flex: 1, backgroundColor: c.roles.page }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        ListEmptyComponent={pinnedRows.length ? undefined : <>{empty}</>}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: search ? insets.bottom + 96 : insets.bottom + 16 }}
        refreshControl={<RefreshControl testID={`${testID}-refresh`} refreshing={refreshing} onRefresh={() => void refresh()} />}
      />
      {search
        ? renderSlot(
            ChatSearchField,
            slots.searchField,
            { value: query, onChange: setQuery, onSubmit: props.onSearchMessages ? (q) => q.trim().length >= 2 && props.onSearchMessages?.(q.trim()) : undefined, testID: `${testID}-search` },
            slotProps.searchField,
          )
        : null}
      {nativeHeader && hasRouter ? (
        <InboxChrome
          title={title}
          filters={archived ? [] : filters}
          active={active?.id ?? ""}
          onFilter={setFilter}
          menu={archived ? [] : menu}
          onCompose={archived ? undefined : onCompose}
          onBack={props.onBack}
        />
      ) : null}
    </>
  );
}

const rowKey = (r: ChatInboxRowData) => r.id;

/** The stack's header for the inbox (large title, Back, the filter menu and Compose), and no tab bar. */
function InboxChrome({ title, filters, active, onFilter, menu, onCompose, onBack }: { title: string; filters: ChatInboxFilter[]; active: string; onFilter: (id: string) => void; menu: ChatInboxMenuItem[]; onCompose?: () => void; onBack?: () => void }) {
  const { router } = useGenesisModules();
  const { copy } = useChatNative();
  const c = useChatColors();
  useHideTabBar(true);
  const StackScreen = router?.StackScreen;
  const options = useMemo(
    () =>
      composeHeaderOptions({
        headerTitle: title,
        large: true,
        scrollEdgeBehavior: "match",
        headerRightItems: () => inboxHeaderItems({ filters, active, onFilter, menu, onCompose, copy, tint: c.label }),
        ...(onBack ? { headerLeftItems: () => [{ type: "button", identifier: "genesis-chat-inbox-back", icon: { type: "sfSymbol", name: "chevron.backward" }, accessibilityLabel: copy.back, tintColor: c.label, onPress: onBack }] } : {}),
        headerOptions: {
          headerShadowVisible: false,
          headerLargeTitleShadowVisible: false,
          // The bar's titles follow light and dark as Messages' do, whatever the brand's tint.
          headerLargeTitleStyle: { color: c.roles.titleSolid },
          headerTitleStyle: { color: c.roles.titleSolid },
          headerStyle: { backgroundColor: c.roles.page },
          ...(Platform.OS === "ios" ? {} : { headerLargeTitle: false }),
        },
      }),
    [title, filters, active, onFilter, menu, onCompose, onBack, copy, c],
  );
  return StackScreen ? <StackScreen options={options} /> : null;
}

/** One row: its content (the `row` slot) inside Genesis's row actions, and the hairline under it. */
const InboxRow = memo(function InboxRow({ row, last, slot, extra, testID }: { row: ChatInboxRowData; last: boolean; slot: Slots<ChatInboxSlotMap>["row"]; extra: Partial<ChatInboxSlotMap["row"]> | undefined; testID: string }) {
  const c = useChatColors();
  const preview = useCallback(() => <ChatConversationPreview conversationId={row.id} title={row.title} testID={`${testID}-preview`} />, [row.id, row.title, testID]);
  return (
    <View>
      <NativeRowActions actions={row.actions} title={row.title} preview={preview} appearance="round" testID={`${testID}-actions`}>
        {renderSlot(ChatInboxRowContent, slot, { row, last, testID }, extra)}
      </NativeRowActions>
      {last ? null : <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginLeft: CHAT_METRICS.rowText, height: StyleSheet.hairlineWidth, backgroundColor: c.separator }} />}
    </View>
  );
});

/** The default row: the unread dot, the face, the name and time with a chevron, two lines of the last message. */
export function ChatInboxRowContent({ row, testID }: ChatInboxSlotMap["row"]) {
  const c = useChatColors();
  const { copy } = useChatNative();
  const label = [row.unread ? copy.unread : null, row.title, row.pinned ? copy.pinnedMark : null, row.muted ? copy.alertsOff : null, row.time, row.preview, row.meta].filter(Boolean).join(", ");
  return (
    <ChatTap
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={row.onPress}
      look={(pressed) => ({
        flexDirection: "row",
        alignItems: "center",
        minHeight: CHAT_METRICS.rowMinHeight,
        paddingVertical: 10,
        paddingRight: CHAT_METRICS.margin,
        // Clear, so the grey pill Genesis draws behind an open swipe shows through.
        backgroundColor: pressed ? c.roles.pressed : "transparent",
      })}
    >
      <View style={{ width: CHAT_METRICS.rowUnreadColumn, alignItems: "center" }}>
        {row.unread ? <View testID={`${testID}-unread`} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: row.muted ? c.secondaryLabel : c.roles.sent }} /> : null}
      </View>
      <ChatFace name={row.face.name} src={row.face.src} recyclingKey={row.id} testID={`${testID}-avatar`} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: 12, alignSelf: "stretch", justifyContent: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <NativeText numberOfLines={1} style={[CHAT_TYPE.title, { flex: 1, color: c.label }]}>
            {row.title}
          </NativeText>
          {row.muted ? <ChatSymbol icon="bell-off" sf="bell.slash.fill" size={12} color={c.secondaryLabel} testID={`${testID}-muted`} /> : null}
          {row.time ? (
            <NativeText testID={`${testID}-time`} style={[CHAT_TYPE.meta, { color: c.secondaryLabel }]}>
              {row.time}
            </NativeText>
          ) : null}
          <ChatSymbol icon="chevron-right" sf="chevron.forward" size={13} weight="semibold" color={c.tertiaryLabel} />
        </View>
        {row.preview ? (
          <NativeText numberOfLines={2} style={[CHAT_TYPE.preview, { color: c.secondaryLabel, marginTop: 1, paddingRight: 8 }]}>
            {row.preview}
          </NativeText>
        ) : null}
        {row.meta ? (
          <NativeText testID={`${testID}-meta`} numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, marginTop: 2, color: c.secondaryLabel }}>
            {row.meta}
          </NativeText>
        ) : null}
      </View>
    </ChatTap>
  );
}

/** A pinned face's actions: the same menu and screen reader actions, never a swipe. */
const menuOnly = (actions: readonly RowSwipeAction[]) => actions.map((a) => ({ ...a, swipe: false as const }));

/** Pinned conversations: large faces, three to a line, the name under each, a blue dot when unread. */
export function ChatPinnedFaces({ rows, testID }: ChatInboxSlotMap["pinned"]) {
  const c = useChatColors();
  const { copy } = useChatNative();
  const { width } = useWindowDimensions();
  const cell = (width - 2 * CHAT_METRICS.margin) / 3;
  const size = Math.min(CHAT_METRICS.pinnedAvatar, cell - 16);
  return (
    <View testID={testID} style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: CHAT_METRICS.margin, paddingTop: 4, paddingBottom: 12 }}>
      {rows.map((row) => (
        <NativeRowActions
          key={row.id}
          actions={menuOnly(row.actions)}
          title={row.title}
          preview={() => <ChatConversationPreview conversationId={row.id} title={row.title} testID={`${testID}-${row.id}-preview`} />}
          testID={`${testID}-${row.id}-actions`}
        >
          <ChatTap
            testID={`${testID}-${row.id}`}
            accessibilityRole="button"
            accessibilityLabel={[fill(copy.pinnedConversation, { name: row.title }), row.unread ? copy.unread : null].filter(Boolean).join(", ")}
            onPress={row.onPress}
            look={(pressed) => ({ width: cell, alignItems: "center", paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}
          >
            <View>
              <ChatFace name={row.face.name} src={row.face.src} size={size} recyclingKey={row.id} />
              {row.unread ? <View style={{ position: "absolute", left: -2, top: size / 2 - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: c.roles.sent }} /> : null}
            </View>
            <NativeText numberOfLines={1} style={{ marginTop: 6, fontSize: 12, lineHeight: 16, color: row.unread ? c.label : c.secondaryLabel, fontWeight: row.unread ? "600" : "400", maxWidth: cell - 8 }}>
              {row.title}
            </NativeText>
          </ChatTap>
        </NativeRowActions>
      ))}
    </View>
  );
}

/** "Search messages for “…”", while two or more letters are typed and the app can search messages. */
function SearchMessagesRow({ query, onSearchMessages, testID }: ChatInboxSlotMap["listHeader"]) {
  const c = useChatColors();
  const { copy } = useChatNative();
  const q = query.trim();
  if (q.length < 2 || !onSearchMessages) return null;
  return (
    <ChatTap
      testID={testID}
      onPress={() => onSearchMessages(q)}
      accessibilityRole="button"
      look={(pressed) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: pressed ? c.roles.pressed : undefined })}
    >
      <ChatSymbol icon="search" sf="magnifyingglass" size={16} color={c.roles.sent} />
      <NativeText numberOfLines={1} style={{ fontSize: 17, color: c.roles.sent }}>
        {fill(copy.searchMessagesFor, { text: q })}
      </NativeText>
    </ChatTap>
  );
}

function InboxEmpty({ loading, title, body, actionLabel, onAction, testID }: ChatInboxSlotMap["empty"]) {
  if (loading) return <NativeLoadingState fullScreen={false} testID={testID.replace(/-(empty|error)$/, "-loading")} />;
  return (
    <NativeEmptyState
      variant="first-run"
      title={title}
      body={body}
      testID={testID}
      primaryAction={
        actionLabel && onAction ? (
          <ChatTap testID={`${testID}-action`} onPress={onAction} accessibilityRole="button" hitSlop={8} look={() => ({ padding: 8 })}>
            <EmptyActionLabel label={actionLabel} />
          </ChatTap>
        ) : undefined
      }
    />
  );
}

function EmptyActionLabel({ label }: { label: string }): ReactNode {
  const c = useChatColors();
  return <NativeText style={{ fontSize: 17, color: c.roles.sent }}>{label}</NativeText>;
}

/** Messages' search field: a glass capsule at the bottom, a magnifying glass and "Search"; Cancel (a glass circle) clears it. */
export function ChatSearchField({ value, onChange, onSubmit, testID }: ChatInboxSlotMap["searchField"]) {
  const c = useChatColors();
  const { copy, modules } = useChatNative();
  const insets = useSafeAreaInsets();
  const input = useRef<ComponentRef<typeof TextInput> | null>(null);
  const [focused, setFocused] = useState(false);
  const field = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: CHAT_METRICS.margin + 4, paddingBottom: 8 }} pointerEvents="box-none">
      <View style={{ flex: 1 }}>
        <ChatGlassPanel radius={24} interactive>
          <ChatTap testID={testID} accessible={false} onPress={() => input.current?.focus()} look={() => ({ flexDirection: "row", alignItems: "center", height: 48, paddingLeft: 14, paddingRight: 8, gap: 8 })}>
            <ChatSymbol icon="search" sf="magnifyingglass" size={17} color={c.secondaryLabel} />
            <TextInput
              ref={input}
              testID={`${testID}-input`}
              value={value}
              onChangeText={onChange}
              onSubmitEditing={(e) => onSubmit?.(e.nativeEvent.text)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={copy.search}
              placeholderTextColor={c.secondaryLabel}
              accessibilityLabel={copy.search}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
              style={{ flex: 1, fontSize: 17, color: c.label, paddingVertical: 0 }}
            />
          </ChatTap>
        </ChatGlassPanel>
      </View>
      {focused || value ? (
        <ChatGlassCircle
          size={48}
          testID={`${testID}-cancel`}
          label={copy.cancel}
          onPress={() => {
            onChange("");
            input.current?.blur();
          }}
        >
          <ChatSymbol icon="close" sf="xmark" size={17} weight="medium" color={c.label} />
        </ChatGlassCircle>
      ) : null}
    </View>
  );
  // It rides up on the keyboard with react-native-keyboard-controller's KeyboardStickyView, when the app gave it.
  const Sticky = modules.keyboardStickyView;
  const style = { position: "absolute" as const, left: 0, right: 0, bottom: insets.bottom };
  if (Sticky) {
    return (
      <Sticky offset={{ closed: 0, opened: insets.bottom }} style={style} pointerEvents="box-none">
        {field}
      </Sticky>
    );
  }
  return (
    <View style={style} pointerEvents="box-none">
      {field}
    </View>
  );
}
