// A list's controls, board and calendar on the phone (ADR 0017): what the web draws, from the same
// core pieces. The list state is core's `useListState`, segment counts `useSegmentCounts`, the
// board `useViewBoard` and the calendar `useViewCalendarRange` with `calendarEvents` and
// `placeEvents`. Only the drawing here is the phone's.

import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, SectionList, View } from "react-native";
import type { DataRow, FilterParam } from "@marktiderman/genesis-core";
import { dayIn, type Day } from "@marktiderman/genesis-core/dates";
import { useSegmentCounts, useViewBoard, useViewCalendarRange, type ListStateResult } from "@marktiderman/genesis-core/hooks";
import { calendarEvents, calendarWindow, displayZone, placeEvents, shiftAnchor, type PlacedEvent, type ViewFilterValue } from "@marktiderman/genesis-core/resource-view";
import { NativeBadge } from "../../components/badge";
import { NativeButton } from "../../components/button";
import { NativeChip, NativeChipGroup } from "../../components/chip-group";
import { NativeEmptyState } from "../../components/empty-state";
import { NativeInlineAlert } from "../../components/inline-alert";
import { NativeInput } from "../../components/input";
import { NativeListItem } from "../../components/list-item";
import { NativeLoadingState } from "../../components/loading-state";
import { NativeSegmentedControl } from "../../components/segmented-control";
import { NativeSheet, NativeSheetScrollView } from "../../components/sheet";
import { NativeText } from "../../components/text";
import { useThemeRoles } from "../../hooks/use-theme-roles";
import { showInboxActions } from "../../layouts/inbox-page";
import { badgeVariant, useDisplayTimeZones, useNativeResourceViewMessages } from "./display";
import type { AnyResourceView, NativeResourceScreenCan } from "./mapping";
import { defaultNativeListMessages, fill, type NativeListMessages } from "./messages";

type Row = Record<string, unknown>;

/** The list words: the app's catalogue over the English. */
export function useNativeListMessages(): NativeListMessages {
  const own = useNativeResourceViewMessages().lists;
  return useMemo(() => ({ ...defaultNativeListMessages, ...own, types: { ...defaultNativeListMessages.types, ...own?.types } }), [own]);
}

/** The view types the phone draws. @stability Beta */
export const NATIVE_VIEW_TYPES = ["list", "grid", "gallery", "inbox", "board", "calendar"] as const;

/**
 * The types a person may switch between on the phone: the view's, as the phone draws them (a
 * table is a list there), each once.
 *
 * @stability Beta
 */
export function nativeSwitchableTypes(view: AnyResourceView<Row>): string[] {
  const out: string[] = [];
  for (const t of view.types()) {
    const shown = t === "table" ? "list" : t;
    if ((NATIVE_VIEW_TYPES as readonly string[]).includes(shown) && !out.includes(shown)) out.push(shown);
  }
  return out;
}

/** The view's types as a segmented control: the phone's view-type switcher. @stability Beta */
export function NativeViewTypeSwitcher({ state, types, testID = "native-view-types" }: { state: ListStateResult; types: readonly string[]; testID?: string }) {
  const words = useNativeListMessages();
  if (types.length < 2) return null;
  return (
    <NativeSegmentedControl
      testID={testID}
      options={types.map((t) => ({ value: t, label: words.types[t] ?? t }))}
      value={state.type ?? types[0]!}
      onChange={(t) => state.setType(t)}
    />
  );
}

/** The view's segments as a row of chips, each with its count when it asks for one. @stability Beta */
export function NativeViewSegments({
  view,
  state,
  baseFilters = [],
  enabled = true,
  testID = "native-view-segments",
}: {
  view: AnyResourceView<Row>;
  state: ListStateResult;
  /** The list's other filters (the screen's), which counts include. */
  baseFilters?: readonly FilterParam[];
  /** False while the screen waits: no count is read. */
  enabled?: boolean;
  testID?: string;
}) {
  const words = useNativeListMessages();
  const segments = view.segments();
  const counts = useSegmentCounts(view, useMemo(() => [...baseFilters, ...state.valueFilters], [baseFilters, state.valueFilters]), { enabled });
  if (!segments.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={words.segments}>
      <NativeChipGroup mode="single" value={state.segment ?? ""} onChange={(id) => state.setSegment(String(id))} testID={testID} className="flex-nowrap">
        {segments.map((s) => (
          <NativeChip key={s.id} value={s.id} testID={`${testID}-${s.id}`}>
            {counts[s.id] !== undefined ? `${s.label} ${counts[s.id]!.toLocaleString()}` : s.label}
          </NativeChip>
        ))}
      </NativeChipGroup>
    </ScrollView>
  );
}

/** The view's declared filters: a Filters button (with how many are set) and a sheet to set them. @stability Beta */
export function NativeViewFilterControls({ view, state, testID = "native-view-filters" }: { view: AnyResourceView<Row>; state: ListStateResult; testID?: string }) {
  const words = useNativeListMessages();
  const filters = view.filters();
  const [open, setOpen] = useState(false);
  const set = Object.values(state.values).length;
  if (!filters.length) return null;
  return (
    <>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <NativeButton size="sm" variant="outline" testID={testID} onPress={() => setOpen(true)}>
          {set ? fill(words.filtersSet, { count: set }) : words.filters}
        </NativeButton>
        {state.active ? (
          <NativeButton size="sm" variant="ghost" testID={`${testID}-clear`} onPress={state.clear}>
            {words.clear}
          </NativeButton>
        ) : null}
      </View>
      <NativeSheet open={open} onOpenChange={setOpen} testID={`${testID}-sheet`}>
        <NativeSheetScrollView>
          <View style={{ gap: 16, padding: 16 }}>
            {filters.map((f) => {
              const value = state.values[f.field];
              const put = (next: ViewFilterValue | undefined) => state.setValue(f.field, next);
              return (
                <View key={f.field} style={{ gap: 6 }} testID={`${testID}-${f.field}`}>
                  <NativeText preset="label">{f.label}</NativeText>
                  {f.kind === "choice" ? (
                    <NativeChipGroup mode="multiple" value={Array.isArray(value) ? [...value] : []} onChange={(v) => put(Array.isArray(v) ? v : [v])}>
                      {f.options.map((o) => (
                        <NativeChip key={o.value} value={o.value} testID={`${testID}-${f.field}-${o.value}`}>
                          {o.label}
                        </NativeChip>
                      ))}
                    </NativeChipGroup>
                  ) : f.kind === "range" ? (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {(["gte", "lte"] as const).map((end) => {
                        const range = value && typeof value === "object" && !Array.isArray(value) ? (value as { gte?: string; lte?: string }) : {};
                        return (
                          <NativeInput
                            key={end}
                            className="flex-1"
                            label={end === "gte" ? words.from : words.to}
                            testID={`${testID}-${f.field}-${end}`}
                            value={range[end] ?? ""}
                            keyboardType={f.input === "number" ? "numeric" : "default"}
                            placeholder={f.input === "date" ? "YYYY-MM-DD" : f.input === "datetime" ? "YYYY-MM-DDTHH:MM" : undefined}
                            onChangeText={(text) => put({ ...range, [end]: text })}
                          />
                        );
                      })}
                    </View>
                  ) : (
                    <NativeInput testID={`${testID}-${f.field}-text`} value={typeof value === "string" ? value : ""} onChangeText={(text) => put(text)} />
                  )}
                </View>
              );
            })}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <NativeButton variant="outline" onPress={state.clear} testID={`${testID}-sheet-clear`}>
                {words.clear}
              </NativeButton>
              <NativeButton onPress={() => setOpen(false)} testID={`${testID}-sheet-done`}>
                {words.done}
              </NativeButton>
            </View>
          </View>
        </NativeSheetScrollView>
      </NativeSheet>
    </>
  );
}

/** The segments, the declared filters and the type switcher above a list (NativeResourceView's). */
export function NativeListControls({
  view,
  state,
  baseFilters,
  types,
  testID,
  enabled = true,
}: {
  view: AnyResourceView<Row>;
  state: ListStateResult;
  baseFilters: readonly FilterParam[];
  types: readonly string[];
  testID: string;
  /** False while the screen waits: the segments' counts aren't read. */
  enabled?: boolean;
}) {
  if (!view.segments().length && !view.filters().length && types.length < 2) return null;
  return (
    <View style={{ gap: 8 }} testID={`${testID}-controls`}>
      <NativeViewTypeSwitcher state={state} types={types} testID={`${testID}-types`} />
      <NativeViewSegments view={view} state={state} baseFilters={baseFilters} enabled={enabled} testID={`${testID}-segment`} />
      <NativeViewFilterControls view={view} state={state} testID={`${testID}-filters`} />
    </View>
  );
}

/** A column's width on the phone's board, in points. */
const COLUMN_WIDTH = 280;

/**
 * The view as a board on the phone: its columns side by side, scrolled across; a card opens on a
 * press, and a long press offers its moves ("Move to …"), each through the view's guards and the
 * resource's own update (core's useViewBoard, as the web's board).
 */
export function NativeResourceBoard({
  view,
  filters,
  can,
  onOpen,
  header,
  testID,
  enabled = true,
}: {
  view: AnyResourceView<Row>;
  filters: readonly FilterParam[];
  can?: NativeResourceScreenCan<Row> | undefined;
  onOpen: (row: Row) => void;
  header?: ReactNode;
  testID: string;
  /** False while the screen waits: nothing is fetched. */
  enabled?: boolean;
}) {
  const words = useNativeListMessages();
  const colors = useThemeRoles();
  const board = useViewBoard<Row>(view as never, {
    filters,
    enabled,
    // The screen's rule, in the board's words: a card moves only when the screen allows `update`.
    ...(can
      ? {
          can: (action: "create" | "edit" | "delete", row?: Row) => {
            const verdict = can(action === "edit" ? "update" : action, row);
            return verdict !== false && typeof verdict !== "string";
          },
        }
      : {}),
    words: {
      notAllowed: words.notAllowed,
      noValue: words.noValue,
      stillSaving: (name) => fill(words.stillSaving, { name }),
      notChanged: (noun) => fill(words.notChanged, { noun }),
      moveFailed: (name) => fill(words.moveFailed, { name }),
    },
  });
  const cancel = useNativeResourceViewMessages().common.cancel;
  const showMoves = (row: Row) => {
    const verdict = board.movable ? board.canMove(row) : words.notAllowed;
    const from = String(row[board.field] ?? "");
    showInboxActions(
      board.titleOf(row),
      board.columns
        .filter((c) => c.value !== from)
        .map((c) => ({
          id: c.value,
          label: fill(words.moveTo, { column: c.label }),
          onPress: () => {
            if (verdict !== true) {
              showInboxActions(verdict, [], cancel);
              return;
            }
            void board.move(row, c.value).catch(() => undefined);
          },
        })),
      cancel,
    );
  };
  return (
    <View style={{ flex: 1 }} testID={`${testID}-board`}>
      {header}
      {board.refusal ? <NativeInlineAlert variant="destructive" description={board.refusal} onDismiss={board.clearRefusal} testID={`${testID}-board-refusal`} /> : null}
      <ScrollView horizontal contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 16 }}>
        {board.columns.map((column) => (
          <View key={column.value} testID={`${testID}-board-column-${column.value}`} style={{ width: COLUMN_WIDTH, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8 }}>
              <NativeText preset="label" accessibilityRole="header">
                {column.label}
              </NativeText>
              <NativeBadge variant={badgeVariant(column.tone)}>{String(column.total ?? column.items.length)}</NativeBadge>
            </View>
            <ScrollView style={{ maxHeight: "100%" }} contentContainerStyle={{ gap: 8 }}>
              {column.items.map((row) => {
                const key = board.keyOf(row);
                const summary = view.summary(row as Row & DataRow);
                return (
                  <Pressable
                    key={key}
                    testID={`${testID}-board-card-${key}`}
                    accessibilityRole="button"
                    accessibilityLabel={summary.title}
                    accessibilityActions={[{ name: "move", label: words.moveTo.replace(" {column}", "") }]}
                    onAccessibilityAction={() => showMoves(row)}
                    onPress={() => onOpen(row)}
                    onLongPress={() => showMoves(row)}
                    style={{ backgroundColor: colors.surface as string, borderRadius: 12, opacity: board.saving.has(key) ? 0.5 : 1 }}
                  >
                    <NativeListItem title={summary.title} subtitle={summary.subtitle} className="bg-transparent" />
                  </Pressable>
                );
              })}
              {column.loading ? <NativeLoadingState fullScreen={false} size="small" /> : null}
              {column.hasMore ? (
                <NativeButton size="sm" variant="ghost" onPress={() => board.loadMore(column.value)} testID={`${testID}-board-more-${column.value}`}>
                  {words.loadMore}
                </NativeButton>
              ) : null}
            </ScrollView>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * The view as a calendar on the phone: an agenda (the window's days with their events) or a
 * month (a grid of days with dots; a tap shows that day's events below). Rows come through core's
 * useViewCalendarRange and calendarEvents, and land by placeEvents, as on the web.
 */
export function NativeResourceCalendar({
  view,
  filters,
  onOpen,
  header,
  testID,
  enabled = true,
}: {
  view: AnyResourceView<Row>;
  filters: readonly FilterParam[];
  onOpen: (row: Row) => void;
  header?: ReactNode;
  testID: string;
  /** False while the screen waits: nothing is fetched. */
  enabled?: boolean;
}) {
  const words = useNativeListMessages();
  const listWords = useNativeResourceViewMessages().list;
  const colors = useThemeRoles();
  const block = view.definition.calendar;
  if (!block?.field) throw new Error(`NativeResourceView(${view.resource}): type="calendar" needs the view's calendar block (calendar.field)`);
  const [layout, setLayout] = useState<"agenda" | "month">(block.phoneLayout === "month" || block.layout === "month" ? "month" : "agenda");
  const weekStartsOn = block.weekStartsOn ?? 1;
  // The clocks the cells use (the screen's `scopeTimeZone` over ViewerScope's): one clock for the
  // calendar's window, its placement and its times, and the field's cells.
  const zones = useDisplayTimeZones();
  const zone = displayZone(view.definition.fields?.[block.field as never]?.timeZone, zones.viewer, zones.scope);
  const [anchor, setAnchor] = useState<Day>(() => dayIn(zone));
  const [picked, setPicked] = useState<Day>(() => dayIn(zone));
  const range = calendarWindow(layout === "month" ? "month" : "agenda", anchor, { weeks: 2, weekStartsOn });
  const data = useViewCalendarRange<Row>(view as never, range, { filters, timeZone: zone, enabled });
  const events = useMemo(
    () => calendarEvents<Row>(view as never, data.rows, { field: block.field, endField: block.endField, durationField: block.durationField, durationUnit: block.durationUnit, allDayField: block.allDayField, laneBy: block.laneBy, timeZone: zone }),
    [view, data.rows, block, zone],
  );
  const byDay = useMemo(() => placeEvents(events, range, zone), [events, range.start, range.end, zone]); // eslint-disable-line react-hooks/exhaustive-deps -- the window by value
  const step = (n: number) => setAnchor((a) => shiftAnchor(layout === "month" ? "month" : "agenda", a, n, 2));
  const time = (at: Day | Date) => (typeof at === "string" ? words.allDay : at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: zone }));
  const eventRow = (placed: PlacedEvent<Row>) => (
    <Pressable
      key={`${placed.day}:${placed.event.key}`}
      testID={`${testID}-calendar-event-${placed.event.key}`}
      accessibilityRole="button"
      onPress={() => placed.event.row && onOpen(placed.event.row)}
      style={{ backgroundColor: colors.surface as string, borderRadius: 10, marginHorizontal: 16 }}
    >
      <NativeListItem title={placed.event.title} subtitle={placed.allDay ? words.allDay : time(placed.event.start)} className="bg-transparent" />
    </Pressable>
  );
  const toolbar = (
    <View style={{ gap: 8, paddingHorizontal: 16 }}>
      <NativeSegmentedControl
        testID={`${testID}-calendar-layout`}
        options={[
          { value: "agenda", label: words.agenda },
          { value: "month", label: words.month },
        ]}
        value={layout}
        onChange={(l) => setLayout(l as "agenda" | "month")}
      />
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <NativeButton size="sm" variant="outline" accessibilityLabel={words.previous} onPress={() => step(-1)} testID={`${testID}-calendar-previous`}>
          ‹
        </NativeButton>
        <NativeButton
          size="sm"
          variant="outline"
          onPress={() => {
            setAnchor(dayIn(zone));
            setPicked(dayIn(zone));
          }}
          testID={`${testID}-calendar-today`}
        >
          {words.today}
        </NativeButton>
        <NativeButton size="sm" variant="outline" accessibilityLabel={words.next} onPress={() => step(1)} testID={`${testID}-calendar-next`}>
          ›
        </NativeButton>
        <NativeText preset="label" className="ml-2">
          {anchor.slice(0, 7)}
        </NativeText>
      </View>
      {data.total > data.rows.length ? <NativeText preset="caption">{fill(words.more, { count: data.total - data.rows.length })}</NativeText> : null}
    </View>
  );

  // A failed read is said, with a retry: never an empty calendar.
  const failed = data.error ? (
    <NativeEmptyState
      testID={`${testID}-calendar-error`}
      variant="error"
      title={fill(listWords.loadFailed, { nounPlural: view.nounPlural })}
      primaryAction={
        <NativeButton variant="outline" size="sm" onPress={() => data.refetch()} testID={`${testID}-calendar-retry`}>
          {listWords.retry}
        </NativeButton>
      }
    />
  ) : null;
  if (failed) {
    return (
      <ScrollView testID={`${testID}-calendar-failed`} contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
        {header}
        {toolbar}
        {failed}
      </ScrollView>
    );
  }

  if (layout === "agenda") {
    const sections = [...byDay.entries()].filter(([, list]) => list.length).map(([day, list]) => ({ key: day, title: day, data: list }));
    return (
      <SectionList<PlacedEvent<Row>, { key: string; title: string; data: PlacedEvent<Row>[] }>
        testID={`${testID}-calendar-agenda`}
        sections={sections}
        keyExtractor={(p) => `${p.day}:${p.event.key}`}
        renderItem={({ item }) => eventRow(item)}
        renderSectionHeader={({ section }) => (
          <NativeText preset="label" className="px-4 pt-4 pb-1" accessibilityRole="header">
            {section.title}
          </NativeText>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <>
            {header}
            {toolbar}
          </>
        }
        ListEmptyComponent={data.loading ? <NativeLoadingState fullScreen={false} /> : <NativeText className="px-4 pt-4 text-muted-foreground">{words.noEvents}</NativeText>}
        stickySectionHeadersEnabled={false}
      />
    );
  }
  // Month: weeks of seven days, each with a dot per event (up to three).
  const days = [...byDay.keys()];
  const weeks: Day[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const month = anchor.slice(0, 7);
  const today = dayIn(zone);
  const ofPicked = byDay.get(picked) ?? [];
  return (
    <ScrollView testID={`${testID}-calendar-month`} contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
      {header}
      {toolbar}
      <View style={{ paddingHorizontal: 16 }}>
        {weeks.map((week) => (
          <View key={week[0]} style={{ flexDirection: "row" }}>
            {week.map((day) => {
              const list = byDay.get(day) ?? [];
              const selected = day === picked;
              return (
                <Pressable
                  key={day}
                  testID={`${testID}-calendar-day-${day}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${day}${list.length ? `, ${list.length}` : ""}`}
                  onPress={() => setPicked(day)}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 8, backgroundColor: selected ? (colors.surface as string) : undefined }}
                >
                  <NativeText preset="body-sm" className={day.slice(0, 7) !== month ? "text-muted-foreground" : day === today ? "font-semibold" : undefined}>
                    {String(Number(day.slice(8)))}
                  </NativeText>
                  <View style={{ flexDirection: "row", gap: 2, height: 6 }}>
                    {list.slice(0, 3).map((p) => (
                      <View key={p.event.key} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.tint }} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <NativeText preset="label" className="px-4" accessibilityRole="header">
        {picked}
      </NativeText>
      {ofPicked.length ? <View style={{ gap: 8 }}>{ofPicked.map((p) => eventRow(p))}</View> : <NativeText className="px-4 text-muted-foreground">{words.noEvents}</NativeText>}
      {data.loading ? <NativeLoadingState fullScreen={false} size="small" /> : null}
    </ScrollView>
  );
}
