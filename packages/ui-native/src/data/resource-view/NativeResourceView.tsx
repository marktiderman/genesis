// NativeResourceView: a native list screen from a genesis-core view, in one line
// (docs/RESOURCE-VIEW.md, "Native"). It reads the same view as the web's ResourceView:
//   - `view.summary(row)` → NativeListItem (title, subtitle, a chip); `view.columns()` → the peek;
//   - `definition.groupBy` → SectionList sections (sorted on the server first), inset grouped on iOS;
//   - `view.can()` → swipe actions (InboxPage's shape: long press and accessibility actions,
//     the `swipeable` slot for the gesture), every refusal with its reason;
//   - `view.form(mode)` + `view.writable(mode)` → the form sheet, over the row fetched by id,
//     sending only the writable fields the person changed.
//   - `mode="grid"` → cards in `numColumns` columns (as the web's `mode="grid"`); `renderCard` →
//     the app's own row or card, wired by the screen (press, long press, accessibility, swipe).
// Paging is by cursor on `onEndReached`, search is debounced 300 ms, a delete is optimistic and
// comes back if the server refuses, and a refusal shows inline in plain words.
//
// List performance follows React Native's "Optimizing FlatList configuration" (SectionList is a
// VirtualizedList and a PureComponent): a memoised row component, a stable `renderItem` and
// `keyExtractor`, and `extraData` only for what rows read besides their item.

import { memo, useCallback, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Alert, Platform, Pressable, SectionList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { encodeRecordKey, type BaseRecord, type DataRow } from "@marktiderman/genesis-core";
import { personTimeZone } from "@marktiderman/genesis-core/dates";
import { scopeClock, useOne, useOptionalViewerScope } from "@marktiderman/genesis-core/hooks";
import type { RowPicture } from "@marktiderman/genesis-core/resource-view";
import { NativeAvatar } from "../../components/avatar";
import { NativeBadge } from "../../components/badge";
import { NativeImage } from "../../components/image";
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

/** How rows show: a list (the default) or cards in columns, as the web's `mode`. */
export type NativeResourceViewMode = "list" | "grid";

/**
 * Spread onto your card's Pressable: the press (the screen's `onRowPress`, else the peek), the
 * long press (the row's actions), and the label and actions screen readers use. The same wiring
 * the built-in rows have, so a custom card never hand-rolls it.
 */
export interface NativeResourceCardPressableProps {
  testID: string;
  accessibilityRole: "button";
  accessibilityLabel: string;
  accessibilityActions: { name: string; label: string }[];
  onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => void;
  onPress: () => void;
  onLongPress: (() => void) | undefined;
}

/** What `renderCard` gets beside the row: the native counterpart of the web's ResourceCardActions. */
export interface NativeResourceCardActions {
  /** `view.summary(row)`: the title, subtitle, chips and picture the built-in row draws. */
  item: NativeResourceRowItem;
  /** The row's actions (edit, delete), each refusal with its reason; pressing one acts or explains. */
  actions: NativeResourceSwipeAction[];
  /** Opens the row, as pressing a built-in row does. */
  open: () => void;
  /** Shows the row's actions in an action sheet (what a long press does). */
  showActions: () => void;
  /** Everything above, for a Pressable: `<Pressable {...card.pressableProps}>`. */
  pressableProps: NativeResourceCardPressableProps;
  /** First and last in its section (list mode), for rounded group corners and separators. */
  first: boolean;
  last: boolean;
}

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
  /**
   * `"grid"`: cards in `numColumns` columns, as the web's `mode="grid"`. Sections, paging, pull to
   * refresh, the empty and error states, long press, accessibility and swipe actions all stay.
   * Default `"list"`.
   */
  mode?: NativeResourceViewMode;
  /** Columns in grid mode (React Native's FlatList name). Default 2. */
  numColumns?: number;
  /**
   * Draws each row (list) or card (grid) yourself, as the web's `renderCard`. Spread
   * `card.pressableProps` on your Pressable for the press, long press and accessibility; the
   * screen still wraps it in `swipeable`. It owns the whole row: no inset group cell or separator
   * is drawn around it. `index` is the row's place in its section. Pass a stable function
   * (`useCallback`) so rows redraw only when their data does.
   */
  renderCard?: (row: T, index: number, card: NativeResourceCardActions) => ReactNode;
  /** Hide the search box. Shown by default when the view has something to search. */
  searchable?: boolean;
  /**
   * The IANA zone of whatever this screen is scoped to (a location, a league, a team), for columns
   * with `timeZone: "scope"`. Default: ViewerScope's `scopeTimeZone`, else the viewer's clock.
   * Timestamps on other columns read on the viewer's clock (ViewerScope's zone, else the device's).
   */
  scopeTimeZone?: string;
  testID?: string;
}

/** UIKit's inset grouped margin on a phone, in points (as InboxPage and SettingsPage). */
const IOS_GROUP_MARGIN = 16;
/** The group's corner radius: computed once, the OS version doesn't change while the app runs. */
const GROUP_RADIUS = Number.parseFloat(String(Platform.Version)) >= 26 ? 26 : 10;
const IOS = Platform.OS === "ios";

// Rows are keyed by the view's key fields (`keyFields`), so composite keys never collide.
const recordKey = (view: AnyResourceView<Row>, row: Row) => {
  try {
    return String(encodeRecordKey(view.contract, row as DataRow));
  } catch {
    return String((row as DataRow).id);
  }
};

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
  const scopeZone = props.scopeTimeZone ?? scope?.scopeTimeZone;
  const zones = useMemo<DisplayTimeZones>(() => {
    const own = personTimeZone({ timeZone: viewer });
    // An unknown zone is loud (core's scopeClock), never a quiet fall back to the viewer's clock.
    return { viewer: own, scope: scopeClock(scopeZone, own) };
  }, [viewer, scopeZone]);
  return (
    <DisplayTimeZonesProvider value={zones}>
      <Screen {...props} />
    </DisplayTimeZonesProvider>
  );
}

interface RowProps<T extends Row> {
  view: AnyResourceView<T>;
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

/** A row picture's size, in points (Mail's and Contacts' list avatars). */
const PICTURE_SIZE = 40;

/**
 * NativeListItem's `leading` from `rowPicture(summary)`: the image (decorative unless it has
 * `alt`), with its initials if it fails to load; initials alone; or nothing.
 */
function RowLeading({ picture, testID }: { picture: RowPicture; testID: string }) {
  // Which src failed, not a flag: a recycled row for another record starts fresh.
  const [failed, setFailed] = useState<string | null>(null);
  if (picture.kind === "image" && failed !== picture.src) {
    return (
      <NativeImage
        testID={`${testID}-image`}
        src={picture.src}
        {...(picture.alt ? { alt: picture.alt } : {})}
        width={PICTURE_SIZE}
        height={PICTURE_SIZE}
        className="rounded-full"
        onError={() => setFailed(picture.src)}
      />
    );
  }
  const initials = picture.kind === "image" ? picture.fallback : picture.text;
  if (!initials) return null;
  return (
    // The row's label already names it; the letters would only be read twice.
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <NativeAvatar testID={`${testID}-initials`} fallback={initials} size={PICTURE_SIZE} />
    </View>
  );
}

/** The press, long press and accessibility of one row or card: shared by every way a row draws. */
function cardFor<T extends Row>(
  row: T,
  { item: itemFor, actions: actionsFor, handlers, onPress, cancelLabel, testID, first, last }: Pick<RowProps<T>, "item" | "actions" | "handlers" | "onPress" | "cancelLabel" | "testID" | "first" | "last">,
): NativeResourceCardActions {
  const item: NativeResourceRowItem = itemFor(row);
  const actions = actionsFor(row, handlers);
  const chip = item.chips[0];
  const picture = item.picture;
  const open = () => onPress(row);
  const showActions = () => showInboxActions(item.title, actions, cancelLabel);
  return {
    item,
    actions,
    open,
    showActions,
    first,
    last,
    pressableProps: {
      testID: `${testID}-row-${item.id}`,
      accessibilityRole: "button",
      accessibilityLabel: [picture?.kind === "image" ? picture.alt : null, item.title, item.subtitle, chip?.label].filter(Boolean).join(", "),
      accessibilityActions: actions.map((a) => ({ name: a.id, label: a.reason ? `${a.label}: ${a.reason}` : a.label })),
      onAccessibilityAction: (event) => actions.find((a) => a.id === event.nativeEvent.actionName)?.onPress(),
      onPress: open,
      onLongPress: actions.length ? showActions : undefined,
    },
  };
}

/** Wraps a row in the screen's swipe gesture when it has actions and the screen passed one. */
function withSwipe(content: ReactNode, card: NativeResourceCardActions, Swipeable: ComponentType<NativeResourceSwipeableProps> | undefined) {
  return card.actions.length && Swipeable ? (
    <Swipeable actions={card.actions} testID={`${card.pressableProps.testID}-swipe`}>
      {content}
    </Swipeable>
  ) : (
    content
  );
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
  const card = cardFor(row, { item: itemFor, actions: actionsFor, handlers, onPress, cancelLabel, testID, first, last });
  const { item, pressableProps } = card;
  const chip = item.chips[0];
  const picture = item.picture;
  const rowTestID = pressableProps.testID;
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
      <Pressable {...pressableProps}>
        <NativeListItem
          testID={`${rowTestID}-item`}
          title={item.title}
          subtitle={item.subtitle}
          leading={picture ? <RowLeading picture={picture} testID={rowTestID} /> : undefined}
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
  return withSwipe(content, card, Swipeable);
}) as <T extends Row>(props: RowProps<T>) => ReactNode;

type RenderCard<T extends Row> = NonNullable<NativeResourceViewProps<T>["renderCard"]>;

/** A row the app draws (`renderCard`), with the screen's wiring and swipe around it. */
const CustomRow = memo(function CustomRow<T extends Row>(props: RowProps<T> & { index: number; renderCard: RenderCard<T> }) {
  const card = cardFor(props.row, props);
  return withSwipe(props.renderCard(props.row, props.index, card), card, props.Swipeable);
}) as <T extends Row>(props: RowProps<T> & { index: number; renderCard: RenderCard<T> }) => ReactNode;

/** The space between grid cards and around the grid, in points. */
const GRID_GAP = 12;

/** The built-in grid card: the row's picture, title, subtitle and chip on the surface. */
function GridCard<T extends Row>(props: RowProps<T>) {
  const card = cardFor(props.row, props);
  const { item, pressableProps } = card;
  const chip = item.chips[0];
  const content = (
    <Pressable
      {...pressableProps}
      style={{ backgroundColor: props.surface, borderRadius: GROUP_RADIUS, padding: 12, gap: 8, minHeight: 44, flexGrow: 1 }}
    >
      {item.picture ? <RowLeading picture={item.picture} testID={pressableProps.testID} /> : null}
      <NativeText preset="label" numberOfLines={2}>
        {item.title}
      </NativeText>
      {item.subtitle ? (
        <NativeText preset="body-sm" className="text-muted-foreground" numberOfLines={2}>
          {item.subtitle}
        </NativeText>
      ) : null}
      {chip ? (
        <View style={{ flexDirection: "row" }}>
          <NativeBadge testID={`${pressableProps.testID}-chip`} variant={badgeVariant(chip.tone)}>
            {chip.label}
          </NativeBadge>
        </View>
      ) : null}
    </Pressable>
  );
  return withSwipe(content, card, props.Swipeable);
}

/**
 * A grid line: line `n` of a section holds the section's rows `n * numColumns` up to the next
 * line, counted from the section's real start, rows `maxPages` dropped included. So a line is
 * the same line whatever pages are loaded, and its key never changes while it's on screen.
 */
interface GridLine<T> {
  key: string;
  /** The first row's place in its section. */
  index: number;
  /** Empty columns before the first row: the rest of the line was dropped from the front. */
  lead: number;
  rows: T[];
  /** The section's last row's place, when this line holds it; else -1. */
  lastIndex: number;
}

type GridLineProps<T extends Row> = Omit<RowProps<T>, "row" | "first" | "last"> & {
  line: GridLine<T>;
  numColumns: number;
  renderCard: RenderCard<T> | undefined;
};

/** One line of the grid. Memoised like a row; spacers keep each card in its column. */
const GridRow = memo(function GridRow<T extends Row>({ line, numColumns, renderCard, ...shared }: GridLineProps<T>) {
  const cells: ReactNode[] = [];
  for (let i = 0; i < line.lead; i += 1) cells.push(<View key={`lead-${i}`} style={{ flex: 1 }} />);
  line.rows.forEach((row, offset) => {
    const index = line.index + offset;
    const props = { ...shared, row, first: index === 0, last: index === line.lastIndex };
    cells.push(
      <View key={recordKey(shared.view as AnyResourceView<Row>, row)} style={{ flex: 1 }}>
        {renderCard ? <CustomRow<T> {...props} index={index} renderCard={renderCard} /> : <GridCard<T> {...props} />}
      </View>,
    );
  });
  for (let i = line.lead + line.rows.length; i < numColumns; i += 1) cells.push(<View key={`spacer-${i}`} style={{ flex: 1 }} />);
  return (
    <View testID={`${shared.testID}-grid-line-${line.key}`} style={{ flexDirection: "row", gap: GRID_GAP, paddingHorizontal: 16, paddingBottom: GRID_GAP }}>
      {cells}
    </View>
  );
}) as <T extends Row>(props: GridLineProps<T>) => ReactNode;

/**
 * A section's loaded rows cut into grid lines of `numColumns`, `above` of its rows being above
 * the loaded window. A line whose rows haven't changed is the same object as last time
 * (`previous`), so its memoised GridRow skips the redraw.
 */
export function gridLines<T>(
  sectionKey: string,
  rows: T[],
  above: number,
  numColumns: number,
  previous: Map<string, GridLine<T>> = new Map(),
): GridLine<T>[] {
  const lines: GridLine<T>[] = [];
  const lastIndex = above + rows.length - 1;
  let j = 0;
  while (j < rows.length) {
    const index = above + j;
    const n = Math.floor(index / numColumns);
    const lead = index - n * numColumns;
    const take = numColumns - lead;
    const next: GridLine<T> = {
      key: `${sectionKey || "none"}-${n}`,
      index,
      lead,
      rows: rows.slice(j, j + take),
      lastIndex: index + take > lastIndex ? lastIndex : -1,
    };
    const old = previous.get(next.key);
    const same =
      old !== undefined &&
      old.index === next.index &&
      old.lastIndex === next.lastIndex &&
      old.rows.length === next.rows.length &&
      old.rows.every((row, i) => row === next.rows[i]);
    lines.push(same ? old : next);
    j += take;
  }
  return lines;
}

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
    mode = "list",
    numColumns: columnsProp,
    renderCard,
    scopeTimeZone: _zone,
    testID = "native-resource-view",
    ...options
  } = props;
  void _zone;
  const state = useNativeResourceView<T>(view, options);
  const keyExtractor = useCallback((row: T) => recordKey(view as AnyResourceView<Row>, row), [view]);
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

  const shared = useMemo(
    () => ({
      view,
      item: itemFor,
      actions: actionsFor,
      handlers,
      onPress: press,
      chevron,
      Swipeable,
      cancelLabel: messages.common.cancel,
      surface: colors.surface as string,
      separator: colors.separator as string,
      testID,
    }),
    [view, itemFor, actionsFor, handlers, press, chevron, Swipeable, messages, colors.surface, colors.separator, testID],
  );
  const renderItem = useCallback(
    ({ item: row, index, section }: { item: T; index: number; section: NativeResourceSection<T> }) => {
      const props = { ...shared, row, first: index === 0, last: index === section.data.length - 1 };
      return renderCard ? <CustomRow<T> {...props} index={index} renderCard={renderCard} /> : <ResourceRow<T> {...props} />;
    },
    [shared, renderCard],
  );

  // Grid mode: each section's rows in lines of `numColumns`. SectionList has no columns of its
  // own, so a line is one item; sections, paging and refresh stay the list's.
  const numColumns = Math.max(1, Math.floor(columnsProp ?? 2));
  const grid = mode === "grid";
  // Each section's real start, so a section cut by `maxPages` keeps its lines; and last time's
  // lines, so unchanged ones stay the same objects. Only the first loaded section can be cut.
  const sectionStarts = useRef(new Map<string, number>());
  const lastLines = useRef(new Map<string, GridLine<T>>());
  const { rowOffset, hasPrevious } = state;
  const gridSections = useMemo(() => {
    if (!grid) return [];
    const starts = new Map<string, number>();
    const lines = new Map<string, GridLine<T>>();
    let at = rowOffset;
    const out = state.sections.map((section, i) => {
      const seen = sectionStarts.current.get(section.key);
      const start = i === 0 && hasPrevious && seen !== undefined ? Math.min(seen, at) : at;
      starts.set(section.key, start);
      const data = gridLines(section.key, section.data, at - start, numColumns, lastLines.current);
      for (const line of data) lines.set(line.key, line);
      at += section.data.length;
      return { key: section.key, title: section.title, data };
    });
    sectionStarts.current = starts;
    lastLines.current = lines;
    return out;
  }, [grid, state.sections, numColumns, rowOffset, hasPrevious]);
  const gridKey = useCallback((line: GridLine<T>) => line.key, []);
  const renderGridLine = useCallback(
    ({ item: line }: { item: GridLine<T> }) => <GridRow<T> {...shared} line={line} numColumns={numColumns} renderCard={renderCard} />,
    [shared, numColumns, renderCard],
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
      {state.loadingPrevious ? (
        <NativeLoadingState fullScreen={false} size="small" label={messages.list.loadingMore} testID={`${testID}-previous`} />
      ) : null}
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
        // Grid mode hands the list lines of cards in place of rows; everything else is the same list.
        sections={grid ? (gridSections as unknown as NativeResourceSection<T>[]) : state.sections}
        keyExtractor={grid ? (gridKey as unknown as (row: T) => string) : keyExtractor}
        renderItem={grid ? (renderGridLine as unknown as typeof renderItem) : renderItem}
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
        // maxPages drops pages from the front; reaching the top loads them back, and the rows on
        // screen keep their place while they're added above (VirtualizedList's onStartReached and
        // ScrollView's maintainVisibleContentPosition, both inherited by SectionList).
        onStartReached={state.hasPrevious ? state.loadPrevious : undefined}
        onStartReachedThreshold={0.5}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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
        recordKey={sheet?.row ? recordKey(view as AnyResourceView<Row>, sheet.row) : "new"}
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
