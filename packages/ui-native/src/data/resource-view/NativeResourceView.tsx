// NativeResourceView: a native list screen from a genesis-core view, in one line
// (docs/RESOURCE-VIEW.md, "Native"). It reads the same view as the web's ResourceView:
//   - `view.summary(row)` and `view.columns(preset)` → NativeListItem (title, subtitle, a chip);
//   - `definition.groupBy` → SectionList sections, inset grouped on iOS;
//   - `view.can()` → swipe actions (InboxPage's shape: long press and accessibility actions,
//     the `swipeable` slot for the gesture), every refusal with its reason;
//   - `view.form(mode)` + `view.writable(mode)` → the form sheet, sending only writable keys.
// Paging is by cursor on `onEndReached`, search is debounced 300 ms, a delete is optimistic and
// comes back if the server refuses, and a refusal shows inline in plain words.

import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Alert, Platform, Pressable, SectionList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { DataRow } from "@marktiderman/genesis-core";
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
import { badgeVariant, useDisplayCell, useNativeResourceViewMessages } from "./display";
import type { AnyResourceView, NativeResourceSection, NativeResourceSwipeAction } from "./mapping";
import { fill } from "./messages";
import { NativeResourceFormSheet } from "./NativeResourceFormSheet";
import { useNativeResourceView, type NativeResourceViewOptions } from "./use-native-resource-view";

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
  testID?: string;
}

/** UIKit's inset grouped margin on a phone, in points (as InboxPage and SettingsPage). */
const IOS_GROUP_MARGIN = 16;

function iosGroupRadius(): number {
  return Number.parseFloat(String(Platform.Version)) >= 26 ? 26 : 10;
}

/**
 * A native list screen from a view:
 *
 * ```tsx
 * <NativeResourceView view={brandsView} onRowPress={(b) => router.push(`/brands/${b.id}`)} />
 * ```
 */
export function NativeResourceView<T extends Row = Row>(props: NativeResourceViewProps<T>) {
  const {
    view,
    title,
    subtitle,
    onRowPress,
    swipeable: Swipeable,
    header,
    emptyState,
    searchable,
    testID = "native-resource-view",
    ...options
  } = props;
  const state = useNativeResourceView<T>(view, options);
  const messages = useNativeResourceViewMessages();
  const colors = useThemeRoles();
  const cell = useDisplayCell();
  const ios = Platform.OS === "ios";

  const [peek, setPeek] = useState<T | null>(null);
  const [sheet, setSheet] = useState<{ mode: "create" | "edit"; row?: T } | null>(null);

  const refused = useCallback((label: string, reason: string) => Alert.alert(label, reason), []);
  const { remove, softDelete, item: itemFor } = state;
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
            setPeek(null);
            remove(row);
          },
        },
      ]);
    },
    [itemFor, softDelete, messages, remove],
  );
  const edit = useCallback((row: T) => {
    setPeek(null);
    setSheet({ mode: "edit", row });
  }, []);
  const handlers = useMemo(() => ({ onEdit: edit, onDelete: confirmDelete, onRefused: refused }), [edit, confirmDelete, refused]);

  const press = useCallback((row: T) => (onRowPress ? onRowPress(row) : setPeek(row)), [onRowPress]);

  const renderItem = useCallback(
    ({ item: row, index, section }: { item: T; index: number; section: NativeResourceSection<T> }) => {
      const item = state.item(row);
      const actions = state.actions(row, handlers);
      const chip = item.chips[0];
      const first = index === 0;
      const last = index === section.data.length - 1;
      const radius = iosGroupRadius();
      const rowTestID = `${testID}-row-${item.id}`;
      const content = (
        <View
          testID={`${rowTestID}-cell`}
          style={[
            { backgroundColor: colors.surface },
            ios
              ? {
                  marginHorizontal: IOS_GROUP_MARGIN,
                  borderTopLeftRadius: first ? radius : 0,
                  borderTopRightRadius: first ? radius : 0,
                  borderBottomLeftRadius: last ? radius : 0,
                  borderBottomRightRadius: last ? radius : 0,
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
            onPress={() => press(row)}
            onLongPress={actions.length ? () => showInboxActions(item.title, actions, messages.common.cancel) : undefined}
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
              showChevron={!!onRowPress}
            />
          </Pressable>
          {!last ? <View style={{ height: 0.5, marginLeft: 16, backgroundColor: colors.separator }} /> : null}
        </View>
      );
      return actions.length && Swipeable ? (
        <Swipeable actions={actions} testID={`${rowTestID}-swipe`}>
          {content}
        </Swipeable>
      ) : (
        content
      );
    },
    [state, handlers, colors, ios, testID, press, onRowPress, Swipeable, messages],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: NativeResourceSection<T> }) =>
      section.title ? (
        <NativeSectionListHeader
          testID={`${testID}-section-${section.key || "none"}`}
          title={section.title}
          className="border-b-0 bg-transparent pt-4"
          trailing={
            <NativeText preset="caption" className="text-muted-foreground">
              {String(section.data.length)}
            </NativeText>
          }
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

  // Peek: every column of the preset, drawn by the display renderers, with the guarded actions.
  const peekFields = useMemo(
    () =>
      view.columns(options.columns ?? "default").map((column) => ({
        key: column.key,
        label: column.label,
        render: (_value: unknown, row: Row) => cell(column as never, row),
      })),
    [view, options.columns, cell],
  );
  const { formFields } = state;
  const createFields = useMemo(() => formFields("create"), [formFields]);
  const editFields = useMemo(() => formFields("edit"), [formFields]);
  const peekActions = peek ? state.actions(peek, handlers).filter((a) => !a.reason) : [];
  const peekEdit = peekActions.find((a) => a.id === "edit");
  const peekDelete = peekActions.find((a) => a.id === "delete");

  return (
    <SafeAreaView testID={testID} edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
      <SectionList<T, NativeResourceSection<T>>
        testID={`${testID}-list`}
        sections={state.sections}
        keyExtractor={(row) => String((row as DataRow).id)}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        // A PureComponent: re-render rows when what they read changes, not only `sections`.
        extraData={renderItem}
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

      <NativeSheet open={peek !== null} onOpenChange={(open) => (open ? undefined : setPeek(null))} testID={`${testID}-peek`}>
        {peek ? (
          <NativeDetailPanel<Row>
            item={peek}
            {...(view.labelField ? { titleField: view.labelField } : {})}
            fields={peekFields}
            {...(peekEdit ? { onEdit: () => peekEdit.onPress() } : {})}
            {...(peekDelete ? { onDelete: () => peekDelete.onPress() } : {})}
          />
        ) : null}
      </NativeSheet>

      <NativeResourceFormSheet
        open={sheet !== null}
        mode={sheet?.mode ?? "create"}
        title={fill(sheet?.mode === "edit" ? messages.common.editTitle : messages.common.create, { noun: view.noun })}
        fields={sheet?.mode === "edit" ? editFields : createFields}
        initial={sheet?.row}
        onCancel={() => setSheet(null)}
        onSave={async (values) => {
          const result = await state.save(sheet?.mode ?? "create", values, sheet?.row);
          if (result.ok) setSheet(null);
          return result;
        }}
        testID={`${testID}-form`}
      />
    </SafeAreaView>
  );
}
