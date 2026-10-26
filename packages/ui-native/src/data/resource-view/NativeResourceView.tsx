// NativeResourceView: a native list screen from a genesis-core view, in one line
// (docs/RESOURCE-VIEW.md, "Native"). It reads the same view as the web's ResourceView:
//   - `view.summary(row)` → NativeListItem (title, subtitle, a chip); `view.columns()` → the peek;
//   - `definition.groupBy` → SectionList sections (sorted on the server first), inset grouped on iOS;
//   - `view.can()` → swipe actions (InboxPage's shape: long press and accessibility actions,
//     the `swipeable` slot for the gesture), every refusal with its reason;
//   - `view.form(mode)` + `view.writable(mode)` → the form sheet, over the row fetched by id,
//     sending only the writable fields the person changed.
// Paging is by cursor on `onEndReached`, search is debounced 300 ms, a delete is optimistic and
// comes back if the server refuses, and a refusal shows inline in plain words.
//
// List performance follows React Native's "Optimizing FlatList configuration" (SectionList is a
// VirtualizedList and a PureComponent): a memoised row component, a stable `renderItem` and
// `keyExtractor`, and `extraData` only for what rows read besides their item.

import { memo, useCallback, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Alert, Platform, Pressable, SectionList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BaseRecord, DataRow } from "@marktiderman/genesis-core";
import { isTimeZone, personTimeZone } from "@marktiderman/genesis-core/dates";
import { useOne, useOptionalViewerScope } from "@marktiderman/genesis-core/hooks";
import { NativeBadge } from "../../components/badge";
import { NativeButton } from "../../components/button";
import { NativeEmptyState } from "../../components/empty-state";
import { NativeInlineAlert } from "../../components/inline-alert";
import { NativeListItem } from "../../components/list-item";
import { NativeLoadingState } from "../../components/loading-state";
import { NativeRefreshControl } from "../../components/refresh-control";
import { NativeSearchBar } from "../../components/search-bar";
import { NativeSectionListHeader } from "../../components/section-list";
import { NativeSheet } from "../../components/sheet";
import { NativeText } from "../../components/text";
import { useThemeRoles } from "../../hooks/use-theme-roles";
import { showInboxActions, type InboxPageSlotMap } from "../../layouts/inbox-page";
import { NativeDetailPanel } from "../NativeDetailPanel";
import {
  badgeVariant,
  DisplayTimeZonesProvider,
  useDisplayCell,
  useNativeResourceViewMessages,
  type DisplayTimeZones,
} from "./display";
import type { AnyResourceView, NativeResourceRowItem, NativeResourceSection, NativeResourceSwipeAction } from "./mapping";
import { fill } from "./messages";
import { NativeResourceFormSheet } from "./NativeResourceFormSheet";
import {
  useNativeResourceView,
  type NativeResourceViewOptions,
  type UseNativeResourceViewReturn,
} from "./use-native-resource-view";

type Row = Record<string, unknown>;

/** The gesture wrapper around a row, the same props as InboxPage's `swipeable` slot. */
export type NativeResourceSwipeableProps = Omit<InboxPageSlotMap["swipeable"], "actions"> & {
  actions: NativeResourceSwipeAction[];
};

export interface NativeResourceViewProps<T extends Row = Row> extends NativeResourceViewOptions<T> {
  view: AnyResourceView<T>;
  /** The heading above the list. Default the view's title; `false` when the navigation bar shows it. */
  title?: string | false;
  subtitle?: string;
  /**
   * A row was pressed: push its detail route (`router.push(\`/brands/${row.id}\`)`), so deep links
   * and notification taps land on the same screen. Without it, a press opens a peek sheet.
   */
  onRowPress?: (row: T) => void;
  /** Wraps each row that has actions in a swipe gesture (e.g. gesture-handler's ReanimatedSwipeable). */
  swipeable?: ComponentType<NativeResourceSwipeableProps>;
  /** Above the list, under the search (a filter, a call to action). */
  header?: ReactNode;
  /** Replaces the empty state. */
  emptyState?: ReactNode;
  /** Hide the search box. Shown by default when the view has something to search. */
  searchable?: boolean;
  /**
   * The practice's IANA zone, for columns with `timeZone: "practice"`. Timestamps otherwise read
   * on the viewer's clock (ViewerScope's zone, else the device's).
   */
  practiceTimeZone?: string;
  testID?: string;
}

/** UIKit's inset grouped margin on a phone, in points (as InboxPage and SettingsPage). */
const IOS_GROUP_MARGIN = 16;
/** The group's corner radius: computed once, the OS version doesn't change while the app runs. */
const GROUP_RADIUS = Number.parseFloat(String(Platform.Version)) >= 26 ? 26 : 10;
const IOS = Platform.OS === "ios";

const keyExtractor = (row: Row) => String((row as DataRow).id);

/**
 * A native list screen from a view:
 *
 * ```tsx
 * <NativeResourceView view={brandsView} onRowPress={(b) => router.push(`/brands/${b.id}`)} />
 * ```
 */
export function NativeResourceView<T extends Row = Row>(props: NativeResourceViewProps<T>) {
  const scope = useOptionalViewerScope();
  const viewer = scope?.timeZone;
  const { practiceTimeZone } = props;
  const zones = useMemo<DisplayTimeZones>(() => {
    const own = personTimeZone({ timeZone: viewer });
    return { viewer: own, practice: practiceTimeZone && isTimeZone(practiceTimeZone) ? practiceTimeZone : own };
  }, [viewer, practiceTimeZone]);
  return (
    <DisplayTimeZonesProvider value={zones}>
      <Screen {...props} />
    </DisplayTimeZonesProvider>
  );
}

interface RowProps<T extends Row> {
  row: T;
  first: boolean;
  last: boolean;
  item: UseNativeResourceViewReturn<T>["item"];
  actions: UseNativeResourceViewReturn<T>["actions"];
  handlers: Parameters<UseNativeResourceViewReturn<T>["actions"]>[1];
  onPress: (row: T) => void;
  chevron: boolean;
  Swipeable: ComponentType<NativeResourceSwipeableProps> | undefined;
  cancelLabel: string;
  surface: string;
  separator: string;
  testID: string;
}

/** One row. Memoised: it redraws only when its row or what it reads changes, not per keystroke. */
const ResourceRow = memo(function ResourceRow<T extends Row>({
  row,
  first,
  last,
  item: itemFor,
  actions: actionsFor,
  handlers,
  onPress,
  chevron,
  Swipeable,
  cancelLabel,
  surface,
  separator,
  testID,
}: RowProps<T>) {
  const item: NativeResourceRowItem = itemFor(row);
  const actions = actionsFor(row, handlers);
  const chip = item.chips[0];
  const rowTestID = `${testID}-row-${item.id}`;
  const content = (
    <View
      testID={`${rowTestID}-cell`}
      style={[
        { backgroundColor: surface },
        IOS
          ? {
              marginHorizontal: IOS_GROUP_MARGIN,
              borderTopLeftRadius: first ? GROUP_RADIUS : 0,
              borderTopRightRadius: first ? GROUP_RADIUS : 0,
              borderBottomLeftRadius: last ? GROUP_RADIUS : 0,
              borderBottomRightRadius: last ? GROUP_RADIUS : 0,
              overflow: "hidden",
            }
          : null,
      ]}
    >
      <Pressable
        testID={rowTestID}
        accessibilityRole="button"
        accessibilityLabel={[item.title, item.subtitle, chip?.label].filter(Boolean).join(", ")}
        accessibilityActions={actions.map((a) => ({ name: a.id, label: a.reason ? `${a.label}: ${a.reason}` : a.label }))}
        onAccessibilityAction={(event) => actions.find((a) => a.id === event.nativeEvent.actionName)?.onPress()}
        onPress={() => onPress(row)}
        onLongPress={actions.length ? () => showInboxActions(item.title, actions, cancelLabel) : undefined}
      >
        <NativeListItem
          testID={`${rowTestID}-item`}
          title={item.title}
          subtitle={item.subtitle}
          className="bg-transparent"
          trailing={
            chip ? (
              <NativeBadge testID={`${rowTestID}-chip`} variant={badgeVariant(chip.tone)}>
                {chip.label}
              </NativeBadge>
            ) : undefined
          }
          showChevron={chevron}
        />
      </Pressable>
      {!last ? <View style={{ height: 0.5, marginLeft: 16, backgroundColor: separator }} /> : null}
    </View>
  );
  return actions.length && Swipeable ? (
    <Swipeable actions={actions} testID={`${rowTestID}-swipe`}>
      {content}
    </Swipeable>
  ) : (
    content
  );
}) as <T extends Row>(props: RowProps<T>) => ReactNode;

function Screen<T extends Row = Row>(props: NativeResourceViewProps<T>) {
  const {
    view,
    title,
    subtitle,
    onRowPress,
    swipeable: Swipeable,
    header,
    emptyState,
    searchable,
    practiceTimeZone: _zone,
    testID = "native-resource-view",
    ...options
  } = props;
  void _zone;
  const state = useNativeResourceView<T>(view, options);
  const messages = useNativeResourceViewMessages();
  const colors = useThemeRoles();
  const cell = useDisplayCell();

  const [peekId, setPeekId] = useState<{ row: T } | null>(null);
  const [sheet, setSheet] = useState<{ mode: "create" | "edit"; row?: T } | null>(null);

  const refused = useCallback((label: string, reason: string) => Alert.alert(label, reason), []);
  const { remove, softDelete, item: itemFor, actions: actionsFor } = state;
  const confirmDelete = useCallback(
    (row: T) => {
      const name = itemFor(row).title;
      const words = softDelete ? messages.bin : messages.delete;
      Alert.alert(fill(words.confirmTitle, { name }), words.confirmBody, [
        { text: messages.common.cancel, style: "cancel" },
        {
          text: words.action,
          style: "destructive",
          onPress: () => {
            setPeekId(null);
            remove(row);
          },
        },
      ]);
    },
    [itemFor, softDelete, messages, remove],
  );
  const edit = useCallback((row: T) => {
    setPeekId(null);
    setSheet({ mode: "edit", row });
  }, []);
  const handlers = useMemo(() => ({ onEdit: edit, onDelete: confirmDelete, onRefused: refused }), [edit, confirmDelete, refused]);

  // The screen's handler through a ref, so an inline `onRowPress` doesn't redraw every row.
  const rowPress = useRef(onRowPress);
  rowPress.current = onRowPress;
  const press = useCallback((row: T) => (rowPress.current ? rowPress.current(row) : setPeekId({ row })), []);
  const chevron = !!onRowPress;

  const renderItem = useCallback(
    ({ item: row, index, section }: { item: T; index: number; section: NativeResourceSection<T> }) => (
      <ResourceRow<T>
        row={row}
        first={index === 0}
        last={index === section.data.length - 1}
        item={itemFor}
        actions={actionsFor}
        handlers={handlers}
        onPress={press}
        chevron={chevron}
        Swipeable={Swipeable}
        cancelLabel={messages.common.cancel}
        surface={colors.surface as string}
        separator={colors.separator as string}
        testID={testID}
      />
    ),
    [itemFor, actionsFor, handlers, press, chevron, Swipeable, messages, colors.surface, colors.separator, testID],
  );

  // Rows are counted only as far as they're loaded, so the header shows the title alone.
  const renderSectionHeader = useCallback(
    ({ section }: { section: NativeResourceSection<T> }) =>
      section.title ? (
        <NativeSectionListHeader
          testID={`${testID}-section-${section.key || "none"}`}
          title={section.title}
          className="border-b-0 bg-transparent pt-4"
        />
      ) : null,
    [testID],
  );

  const create = () => {
    if (state.canCreate === true) setSheet({ mode: "create" });
    else if (typeof state.canCreate === "string") refused(fill(messages.common.create, { noun: view.noun }), state.canCreate);
  };

  const showSearch = searchable ?? !!(options.searchFields?.length || view.labelField);
  const heading = title === false ? null : (title ?? view.title);
  const hasRows = state.rows.length > 0;

  const listHeader = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 12 }}>
      {heading || state.canCreate !== false ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            {heading ? (
              <NativeText preset="h2" accessibilityRole="header">
                {heading}
              </NativeText>
            ) : null}
            {(subtitle ?? view.definition.copy?.subtitle) ? (
              <NativeText preset="body-sm" className="text-muted-foreground mt-0.5">
                {subtitle ?? view.definition.copy?.subtitle}
              </NativeText>
            ) : null}
          </View>
          {state.canCreate !== false ? (
            <NativeButton size="sm" testID={`${testID}-create`} onPress={create}>
              {view.definition.copy?.create ?? fill(messages.common.create, { noun: view.noun })}
            </NativeButton>
          ) : null}
        </View>
      ) : null}
      {showSearch ? (
        <NativeSearchBar
          testID={`${testID}-search`}
          value={state.search}
          onChange={state.setSearch}
          placeholder={fill(messages.common.search, { nounPlural: view.nounPlural })}
        />
      ) : null}
      {state.error && hasRows ? (
        // A refetch or the next page failed: keep the rows, say so above them.
        <View testID={`${testID}-read-error`} style={{ gap: 8 }}>
          <NativeInlineAlert variant="destructive" description={state.error} />
          <NativeButton variant="outline" size="sm" onPress={() => void state.refresh()}>
            {messages.list.retry}
          </NativeButton>
        </View>
      ) : null}
      {state.refusal ? (
        <NativeInlineAlert
          testID={`${testID}-refusal`}
          variant="destructive"
          description={state.refusal}
          onDismiss={state.dismissRefusal}
        />
      ) : null}
      {header}
    </View>
  );

  const empty = state.loading ? (
    <NativeLoadingState fullScreen={false} testID={`${testID}-loading`} />
  ) : state.error ? (
    <NativeEmptyState
      testID={`${testID}-error`}
      variant="error"
      title={state.error}
      primaryAction={
        <NativeButton variant="outline" size="sm" onPress={() => void state.refresh()}>
          {messages.list.retry}
        </NativeButton>
      }
    />
  ) : (
    (emptyState ??
    (state.search ? (
      <NativeEmptyState testID={`${testID}-empty`} variant="no-results" title={messages.list.noResultsTitle} body={messages.list.noResultsBody} />
    ) : (
      <NativeEmptyState
        testID={`${testID}-empty`}
        title={view.definition.copy?.empty?.title ?? fill(messages.list.emptyTitle, { nounPlural: view.nounPlural })}
        body={view.definition.copy?.empty?.body ?? messages.list.emptyBody}
      />
    )))
  );

  // The peek and the edit sheet read the row by id: the list's select may be narrower.
  const peekRow = useOne<T & BaseRecord>(view.resource, peekId ? ((peekId.row as DataRow).id as string) : null);
  const editRow = useOne<T & BaseRecord>(view.resource, sheet?.mode === "edit" ? ((sheet.row as DataRow).id as string) : null);
  const peek = peekId ? ((peekRow.data as T | undefined) ?? peekId.row) : null;

  // Peek: the view's full column list, drawn like the cells (so `when` hides there too), never
  // every key of the row: sensitive values and columns the view leaves out stay out. As the web's.
  const peekFields = useMemo(
    () =>
      view.columns().map((column) => ({
        key: column.key,
        label: column.label,
        render: (_value: unknown, row: Row) => cell(column as never, row),
      })),
    [view, cell],
  );
  const { formFields } = state;
  const createFields = useMemo(() => formFields("create"), [formFields]);
  const editFields = useMemo(() => formFields("edit"), [formFields]);
  const peekActions = peek ? actionsFor(peek, handlers) : [];
  const editLoading = sheet?.mode === "edit" && editRow.data === undefined && !editRow.isError;

  return (
    <SafeAreaView testID={testID} edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
      <SectionList<T, NativeResourceSection<T>>
        testID={`${testID}-list`}
        sections={state.sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        // Rows read their item and actions besides `sections`; they change only with the view,
        // the bin capability or the words, never per keystroke.
        extraData={actionsFor}
        stickySectionHeadersEnabled={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        ListEmptyComponent={empty}
        ListFooterComponent={
          state.loadingMore ? (
            <NativeLoadingState fullScreen={false} size="small" label={messages.list.loadingMore} testID={`${testID}-more`} />
          ) : null
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        onEndReached={state.hasMore ? state.loadMore : undefined}
        onEndReachedThreshold={0.5}
        refreshControl={<NativeRefreshControl testID={`${testID}-refresh`} refreshing={state.refreshing} onRefresh={() => void state.refresh()} />}
      />

      <NativeSheet open={peek !== null} onOpenChange={(open) => (open ? undefined : setPeekId(null))} testID={`${testID}-peek`}>
        {peek ? (
          <NativeDetailPanel<Row>
            item={peek}
            title={itemFor(peek).title}
            fields={peekFields}
            footer={
              peekActions.length ? (
                <View testID={`${testID}-peek-actions`} style={{ gap: 12 }}>
                  {peekActions.map((action) => (
                    <View key={action.id} style={{ gap: 4 }}>
                      <NativeButton
                        testID={`${testID}-peek-${action.id}`}
                        variant={action.destructive ? "destructive" : "outline"}
                        // A refused action stays, dimmed, and pressing it says why.
                        className={action.reason ? "opacity-50" : undefined}
                        onPress={action.onPress}
                      >
                        {action.label}
                      </NativeButton>
                      {action.reason ? (
                        <NativeText testID={`${testID}-peek-${action.id}-reason`} preset="caption" className="text-muted-foreground">
                          {action.reason}
                        </NativeText>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null
            }
          />
        ) : null}
      </NativeSheet>

      <NativeResourceFormSheet
        open={sheet !== null}
        mode={sheet?.mode ?? "create"}
        title={fill(sheet?.mode === "edit" ? messages.common.editTitle : messages.common.create, { noun: view.noun })}
        fields={sheet?.mode === "edit" ? editFields : createFields}
        initial={sheet?.mode === "edit" ? ((editRow.data as Row | undefined) ?? (editRow.isError ? sheet.row : undefined)) : undefined}
        loading={editLoading}
        recordKey={sheet?.row ? String((sheet.row as DataRow).id) : "new"}
        onCancel={() => setSheet(null)}
        onSave={async (values, dirty) => {
          const result = await state.save(sheet?.mode ?? "create", values, sheet?.row, dirty);
          if (result.ok) setSheet(null);
          return result;
        }}
        testID={`${testID}-form`}
      />
    </SafeAreaView>
  );
}
