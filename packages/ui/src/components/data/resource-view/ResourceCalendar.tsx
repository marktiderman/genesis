"use client";

// ResourceView's calendar mode (docs/RESOURCE-VIEW.md, "Calendar"): a view's rows placed by a
// date field, one request per visible window. Drawn by EventCalendar; a click opens the same peek
// the list does, or the screen's `onSelect`.

import { useMemo, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { resourceKeys, useDataProvider, type BaseRecord, type DataRow, type FilterParam, type ListParams, type ResourceContract } from "@marktiderman/genesis-core";
import { encodeRecordKey } from "@marktiderman/genesis-core/schema";
import { dayIn, deviceTimeZone, isTimeZone, readEventTime, type Day } from "@marktiderman/genesis-core/dates";
import { useOptionalViewerScope } from "@marktiderman/genesis-core/hooks";
import { calendarProblems, type ResourceView as View, type ViewCalendar } from "@marktiderman/genesis-core/resource-view";
import { Button } from "../../ui/button";
import { fillMessage, useUiMessages } from "../../../messages";
import { DetailPanel } from "../DetailPanel";
import { EventCalendar } from "../calendar/EventCalendar";
import { calendarWindow, type CalendarEvent, type CalendarLane, type CalendarLayout } from "../calendar/placement";
import { timeStorage, windowBounds } from "../calendar/values";
import { useFollowedState } from "../calendar/use-followed-state";
import { useDisplayCell } from "./display";

type Row = Record<string, unknown>;

/**
 * Most rows one request loads (a calendar with an `endField` makes two, so up to twice this).
 * A month grid is six weeks: 500 is about a dozen a day, more than a
 * busy shared calendar holds, and still one quick request. Past it the calendar says how many it
 * left out ("+N more") rather than dropping them silently.
 */
export const CALENDAR_LIMIT = 500;

/**
 * A screen's calendar settings. The view's `calendar` block (`defineView`) is the default for every
 * key it has; these override it, and add what a description can't hold (functions, the anchor).
 *
 * @stability Beta
 */
export interface ResourceCalendarOptions<T extends Row = Row> extends Partial<ViewCalendar> {
  /** The layouts the toolbar offers to switch between. Without two or more, no switch. */
  layouts?: readonly CalendarLayout[];
  onLayoutChange?: (layout: CalendarLayout) => void;
  /**
   * The clock timestamps land on days by. Default the field's own (`fields.<field>.timeZone`:
   * the scope's or a fixed zone), else the viewer's (ViewerScope's `timeZone`), else the device's:
   * the same clock the field's cells use.
   */
  timeZone?: string;
  /** A day in the window (default today). With `onAnchorChange` the screen owns it (put it in the URL). */
  anchor?: Day;
  onAnchorChange?: (anchor: Day) => void;
  /** A row's lanes, when a field doesn't say (several people on one event). Wins over `laneBy`. */
  lanesOf?: (row: T) => readonly string[];
  /** The lanes, in order, with their labels and colours. */
  lanes?: readonly CalendarLane[];
  /** A row's dot colours, when not its lanes'. */
  colorsOf?: (row: T) => readonly string[];
  /**
   * Most rows one request loads. Default {@link CALENDAR_LIMIT}. With an `endField` the calendar
   * makes two (rows that overlap the window, and open-ended rows starting in it), each capped.
   */
  limit?: number;
  /** The agenda shows empty days too. */
  showEmptyDays?: boolean;
  /** A row was chosen. Default: the view's peek. */
  onSelect?: (row: T) => void;
}

export interface ResourceCalendarProps<T extends Row = Row> extends ResourceCalendarOptions<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: View<ResourceContract<any>, T & DataRow>;
  /** Draw some peek fields the screen's own way, by column key (ResourceView's `cells`). */
  cells?: Partial<Record<string, (row: T) => ReactNode>>;
  /** Server filters (the view's scope and the screen's), already as params. */
  filters?: readonly FilterParam[];
  title?: string;
  className?: string;
  testID?: string;
}

/** The clock a field's cells use (display.tsx): its own zone, the scope's, the viewer's, the device's. */
function displayZone(own: string | undefined, viewer: string | undefined, scope: string | undefined): string {
  if (own && own !== "viewer" && own !== "scope" && isTimeZone(own)) return own;
  const picked = own === "scope" ? (scope ?? viewer) : viewer;
  return picked && isTimeZone(picked) ? picked : deviceTimeZone();
}

function withoutUndefined<O extends object>(o: O): Partial<O> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<O>;
}


function laneKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined).map(String);
  return value === null || value === undefined || value === "" ? [] : [String(value)];
}

/**
 * A view's rows on a calendar, as its `calendar` block describes them. Prefer
 * `<ResourceView view={v} mode="calendar" />`, which passes the scope and the screen's filters.
 *
 * @stability Beta
 */
export function ResourceCalendar<T extends Row = Row>(props: ResourceCalendarProps<T>) {
  const { view, filters = [], title, className, cells, testID = "resource-calendar" } = props;
  // The view's block, then the screen's settings over it.
  const settings = { ...view.definition.calendar, ...withoutUndefined(props) } as ResourceCalendarOptions<T>;
  const {
    field: fieldName, endField, allDayField, layout: layoutProp, layouts, onLayoutChange, weeks = 2, weekStartsOn = 1, timeZone,
    anchor: anchorProp, onAnchorChange, laneBy, lanesOf, lanes, colorsOf, limit = CALENDAR_LIMIT, showEmptyDays, onSelect,
  } = settings;
  const m = useUiMessages();
  const provider = useDataProvider();
  const cell = useDisplayCell();
  const viewerScope = useOptionalViewerScope();
  if (!fieldName) throw new Error(`ResourceView(${view.resource}): mode="calendar" needs a calendar field: the view's calendar.field, or calendar={{ field }}`);
  // The screen's overrides get the checks the view's own block got in defineView.
  const problems = calendarProblems(view.contract.fields, settings);
  if (problems.length) throw new Error(`ResourceView(${view.resource}): ${problems.join("; ")}`);
  const field = view.field(fieldName)!;
  const zone = timeZone ?? displayZone(view.definition.fields?.[fieldName as never]?.timeZone, viewerScope?.timeZone, viewerScope?.scopeTimeZone);
  const storage = timeStorage(field);
  const endStorage = endField ? timeStorage(view.field(endField)) : storage;

  const [ownLayout, setOwnLayout] = useFollowedState<CalendarLayout>(layoutProp, () => "month");
  const layout = onLayoutChange ? (layoutProp ?? "month") : ownLayout;
  const [ownAnchor, setOwnAnchor] = useFollowedState<Day>(anchorProp, () => dayIn(zone));
  const anchor = onAnchorChange ? (anchorProp ?? dayIn(zone)) : ownAnchor;
  const range = calendarWindow(layout, anchor, { weeks, weekStartsOn });
  const { from, to } = windowBounds(range, storage, zone);
  const end = endField ? windowBounds(range, endStorage, zone) : undefined;

  // Two requests at most, each one plain filter list the provider rules apply to:
  // - rows that overlap the window: start before its end, and end after its start (a long event
  //   that began weeks ago is in; no guessing how far back to look). A timestamp end is
  //   exclusive, so one at the window's first midnight is out (`gt`); a date end is the last day,
  //   so one on the window's first day is in (`gte`);
  // - with an end field, rows without an end that start inside it.
  const base = { pagination: { page: 1, perPage: limit }, sort: { field: fieldName, order: "asc" as const } };
  const overlapping: ListParams = {
    ...base,
    filters: end
      ? [...filters, { field: fieldName, operator: "lt", value: to }, { field: endField!, operator: endStorage === "date" ? "gte" : "gt", value: end.from }]
      : [...filters, { field: fieldName, operator: "gte", value: from }, { field: fieldName, operator: "lt", value: to }],
  };
  const openEnded: ListParams = {
    ...base,
    filters: [...filters, { field: fieldName, operator: "gte", value: from }, { field: fieldName, operator: "lt", value: to }, { field: endField ?? fieldName, operator: "is_null" }],
  };
  // Under core's list keys, so a save to the resource refreshes the calendar like any list.
  const main = useQuery({
    queryKey: resourceKeys(view.resource).list(overlapping),
    placeholderData: keepPreviousData,
    queryFn: () => provider.getList<BaseRecord>(view.resource, overlapping),
  });
  const extra = useQuery({
    queryKey: resourceKeys(view.resource).list(openEnded),
    placeholderData: keepPreviousData,
    enabled: Boolean(endField),
    queryFn: () => provider.getList<BaseRecord>(view.resource, openEnded),
  });
  // While one request still shows the last window's rows and the other the new window's, the two
  // don't belong together: keep showing the last pair that did.
  const consistent = !endField || main.isPlaceholderData === extra.isPlaceholderData;
  const loading = main.isPending || main.isPlaceholderData || (Boolean(endField) && (extra.isPending || extra.isPlaceholderData));
  const lastPair = useRef<{ main: typeof main.data; extra: typeof extra.data }>({ main: undefined, extra: undefined });
  if (consistent) lastPair.current = { main: main.data, extra: extra.data };
  const shownMain = lastPair.current.main;
  const shownExtra = lastPair.current.extra;
  // The two filters can't both match a row; keyed anyway, so a row is never drawn twice.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return [...((shownMain?.data ?? []) as unknown as T[]), ...(endField ? ((shownExtra?.data ?? []) as unknown as T[]) : [])].filter((row) => {
      const key = String(encodeRecordKey(view.contract, row as DataRow));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [shownMain, shownExtra, endField, view]);
  const loaded = rows.length;
  const total = (shownMain?.total ?? shownMain?.data.length ?? 0) + (endField ? (shownExtra?.total ?? shownExtra?.data.length ?? 0) : 0);
  const error = main.error ?? (endField ? extra.error : null);

  const events = useMemo(
    () =>
      rows.flatMap((row): CalendarEvent<T>[] => {
        const start = readEventTime(row[fieldName], { dateOnly: storage === "date", timeZone: zone });
        if (start === null) return [];
        const rowEnd = endField ? readEventTime(row[endField], { dateOnly: endStorage === "date", timeZone: zone }) : null;
        const allDay = allDayField ? Boolean(row[allDayField]) : typeof start === "string";
        const startDay = typeof start === "string" ? start : dayIn(zone, start);
        // An all-day row stored as instants runs to an exclusive end: its last day is the one
        // before the end instant, and never before its first.
        const lastDay = (v: Day | Date) => {
          const d = typeof v === "string" ? v : dayIn(zone, new Date(v.getTime() - 1));
          return d < startDay ? startDay : d;
        };
        const rowLanes = lanesOf ? lanesOf(row) : laneBy ? laneKeys(row[laneBy]) : undefined;
        const colors = colorsOf?.(row);
        return [
          {
            key: String(encodeRecordKey(view.contract, row as DataRow)),
            title: view.summary(row as T & DataRow).title,
            start: allDay ? startDay : start,
            ...(rowEnd !== null ? { end: allDay ? lastDay(rowEnd) : rowEnd } : {}),
            allDay,
            ...(rowLanes ? { lanes: rowLanes } : {}),
            ...(colors ? { colors } : {}),
            row,
          },
        ];
      }),
    [rows, fieldName, endField, allDayField, storage, endStorage, zone, lanesOf, laneBy, colorsOf, view],
  );

  const [open, setOpen] = useState<T | null>(null);
  const detailFields = useMemo(
    () =>
      view.columns().map((c) => ({
        key: c.key,
        label: c.label,
        render: (_v: unknown, row: T) => (cells?.[c.key] ? cells[c.key]!(row) : cell(c as never, row)),
      })),
    [view, cell, cells],
  );

  const switcher =
    layouts && layouts.length > 1 ? (
      <div className="flex items-center overflow-hidden rounded-lg border" role="group" aria-label={m.view.mode}>
        {layouts.map((l) => (
          <Button
            key={l}
            type="button"
            size="sm"
            variant={l === layout ? "default" : "ghost"}
            className="h-8 rounded-none"
            aria-pressed={l === layout}
            onClick={() => (onLayoutChange ? onLayoutChange(l) : setOwnLayout(l))}
            testID={`${testID}-layout-${l}`}
          >
            {m.calendar.layouts[l]}
          </Button>
        ))}
      </div>
    ) : undefined;

  return (
    <div className={className}>
      {title && <h2 className="mb-2 text-lg font-semibold">{title}</h2>}
      <EventCalendar<T>
        events={events}
        layout={layout}
        anchor={anchor}
        onAnchorChange={(d) => (onAnchorChange ? onAnchorChange(d) : setOwnAnchor(d))}
        weeks={weeks}
        weekStartsOn={weekStartsOn}
        timeZone={zone}
        {...(lanes ? { lanes } : {})}
        {...(showEmptyDays !== undefined ? { showEmptyDays } : {})}
        label={title ?? view.title}
        toolbar={switcher}
        notice={
          <>
            {total > loaded && (
              <p role="status" className="text-xs text-muted-foreground" data-testid={`${testID}-capped`}>
                {fillMessage(m.calendar.capped, { more: (total - loaded).toLocaleString(), shown: loaded.toLocaleString(), total: total.toLocaleString() })}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error instanceof Error ? error.message : String(error)}
              </p>
            )}
          </>
        }
        onSelect={(e) => (onSelect ? onSelect(e.row as T) : setOpen(e.row as T))}
        loading={loading}
        testID={testID}
      />
      <DetailPanel<T>
        item={open}
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? view.summary(open as T & DataRow).title : undefined}
        subtitle={open ? view.summary(open as T & DataRow).subtitle : undefined}
        fields={detailFields}
      />
    </div>
  );
}
