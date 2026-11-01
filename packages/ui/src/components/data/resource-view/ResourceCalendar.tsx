"use client";

// ResourceView's calendar mode (docs/RESOURCE-VIEW.md, "Calendar"): a view's rows placed by a
// date field, one request per visible window. Drawn by EventCalendar; a click opens the same peek
// the list does, or the screen's `onSelect`.

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDataProvider, type BaseRecord, type DataRow, type FilterParam, type ResourceContract } from "@marktiderman/genesis-core";
import { dayIn, deviceTimeZone, type Day } from "@marktiderman/genesis-core/dates";
import { encodeRecordKey, type FieldSchema } from "@marktiderman/genesis-core/schema";
import type { ResourceView as View } from "@marktiderman/genesis-core/resource-view";
import { Button } from "../../ui/button";
import { fillMessage, useUiMessages } from "../../../messages";
import { DetailPanel } from "../DetailPanel";
import { EventCalendar } from "../calendar/EventCalendar";
import { calendarWindow, type CalendarEvent, type CalendarLane, type CalendarLayout, type CalendarWeeks } from "../calendar/placement";
import { readEventTime, windowBounds } from "../calendar/values";
import { useDisplayCell } from "./display";

type Row = Record<string, unknown>;

/** Most rows one window loads. */
export const CALENDAR_LIMIT = 500;

/**
 * How a view shows as a calendar. Only `field` is required.
 *
 * @stability Beta
 */
export interface ResourceCalendarOptions<T extends Row = Row> {
  /** The date or timestamp field that places each row. */
  field: string;
  /** Where a row ends: the last day for a date field, the end instant for a timestamp. */
  endField?: string;
  /** A yes/no field: the row is all day (a timestamp shown without its time). */
  allDayField?: string;
  /** Default `month`. */
  layout?: CalendarLayout;
  /** The layouts the toolbar offers to switch between. Without two or more, no switch. */
  layouts?: readonly CalendarLayout[];
  onLayoutChange?: (layout: CalendarLayout) => void;
  /** 1 to 4, for `weeks`, `agenda` and `lanes`. Default 2. */
  weeks?: CalendarWeeks;
  /** 0 Sunday or 1 Monday (default). */
  weekStartsOn?: 0 | 1;
  /** The clock days are counted on. Default the device's. */
  timeZone?: string;
  /** A day in the window (default today). With `onAnchorChange` the screen owns it (put it in the URL). */
  anchor?: Day;
  onAnchorChange?: (anchor: Day) => void;
  /** The field whose value (or list of values) names a row's lanes: one dot each, one lane each. */
  laneField?: string;
  /** A row's lanes, when a field doesn't say (several people on one event). Wins over `laneField`. */
  lanesOf?: (row: T) => readonly string[];
  /** The lanes, in order, with their labels and colours. */
  lanes?: readonly CalendarLane[];
  /** A row's dot colours, when not its lanes'. */
  colorsOf?: (row: T) => readonly string[];
  /** Longest a row runs, in days: how far before the window to look. Default 0, or 31 with `endField`. */
  maxSpanDays?: number;
  /** Most rows one window loads. Default 500. */
  limit?: number;
  /** The agenda shows empty days too. */
  showEmptyDays?: boolean;
  /** A row was chosen. Default: the view's peek. */
  onSelect?: (row: T) => void;
}

export interface ResourceCalendarProps<T extends Row = Row> extends ResourceCalendarOptions<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: View<ResourceContract<any>, T & DataRow>;
  /** Server filters (the view's scope and the screen's), already as params. */
  filters?: readonly FilterParam[];
  title?: string;
  className?: string;
  testID?: string;
}

const isDateOnly = (field: FieldSchema | undefined) => field?.dbType === "date" || field?.widget === "date";

function laneKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined).map(String);
  return value === null || value === undefined || value === "" ? [] : [String(value)];
}

/**
 * A view's rows on a calendar. Prefer `<ResourceView view={v} mode="calendar" calendar={{ field }} />`,
 * which passes the scope and the screen's filters.
 *
 * @stability Beta
 */
export function ResourceCalendar<T extends Row = Row>(props: ResourceCalendarProps<T>) {
  const {
    view, filters = [], title, className, testID = "resource-calendar",
    field: fieldName, endField, allDayField, layout: layoutProp, layouts, onLayoutChange, weeks = 2, weekStartsOn = 1, timeZone,
    anchor: anchorProp, onAnchorChange, laneField, lanesOf, lanes, colorsOf, maxSpanDays, limit = CALENDAR_LIMIT, showEmptyDays, onSelect,
  } = props;
  const m = useUiMessages();
  const provider = useDataProvider();
  const cell = useDisplayCell();
  const zone = timeZone ?? deviceTimeZone();
  const field = view.field(fieldName);
  if (!field) throw new Error(`ResourceView(${view.resource}): calendar field "${fieldName}" isn't in the view`);
  const dateOnly = isDateOnly(field);
  const endDateOnly = endField ? isDateOnly(view.field(endField)) : dateOnly;

  const [ownLayout, setOwnLayout] = useState<CalendarLayout>(layoutProp ?? "month");
  const layout = onLayoutChange ? (layoutProp ?? "month") : ownLayout;
  const [ownAnchor, setOwnAnchor] = useState<Day>(() => anchorProp ?? dayIn(zone));
  const anchor = onAnchorChange ? (anchorProp ?? dayIn(zone)) : ownAnchor;
  const range = calendarWindow(layout, anchor, { weeks, weekStartsOn });
  const { from, to } = windowBounds(range, dateOnly, zone, maxSpanDays ?? (endField ? 31 : 0));
  const filterKey = JSON.stringify(filters);

  const query = useQuery({
    queryKey: ["genesis-calendar", provider, view.resource, fieldName, from, to, filterKey, limit],
    placeholderData: keepPreviousData,
    queryFn: () =>
      provider.getList<BaseRecord>(view.resource, {
        pagination: { page: 1, perPage: limit },
        sort: { field: fieldName, order: "asc" },
        filters: [...filters, { field: fieldName, operator: "gte", value: from }, { field: fieldName, operator: "lt", value: to }],
      }),
  });
  const rows = (query.data?.data ?? []) as unknown as T[];
  const total = query.data?.total ?? rows.length;

  const events = useMemo(
    () =>
      rows.flatMap((row): CalendarEvent<T>[] => {
        const start = readEventTime(row[fieldName], dateOnly);
        if (start === null) return [];
        const end = endField ? readEventTime(row[endField], endDateOnly) : null;
        const allDay = allDayField ? Boolean(row[allDayField]) : typeof start === "string";
        const own = (v: Day | Date) => (allDay && v instanceof Date ? dayIn(zone, v) : v);
        const rowLanes = lanesOf ? lanesOf(row) : laneField ? laneKeys(row[laneField]) : undefined;
        const colors = colorsOf?.(row);
        return [
          {
            key: String(encodeRecordKey(view.contract, row as DataRow)),
            title: view.summary(row as T & DataRow).title,
            start: own(start),
            ...(end !== null ? { end: own(end) } : {}),
            allDay,
            ...(rowLanes ? { lanes: rowLanes } : {}),
            ...(colors ? { colors } : {}),
            row,
          },
        ];
      }),
    [rows, fieldName, endField, allDayField, dateOnly, endDateOnly, zone, lanesOf, laneField, colorsOf, view],
  );

  const [open, setOpen] = useState<T | null>(null);
  const detailFields = useMemo(
    () => view.columns().map((c) => ({ key: c.key, label: c.label, render: (_v: unknown, row: T) => cell(c as never, row) })),
    [view, cell],
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
            {total > rows.length && (
              <p role="status" className="text-xs text-muted-foreground print:hidden" data-testid={`${testID}-capped`}>
                {fillMessage(m.calendar.capped, { shown: rows.length.toLocaleString(), total: total.toLocaleString() })}
              </p>
            )}
            {query.isError && (
              <p role="alert" className="text-sm text-destructive">
                {query.error instanceof Error ? query.error.message : String(query.error)}
              </p>
            )}
          </>
        }
        onSelect={(e) => (onSelect ? onSelect(e.row as T) : setOpen(e.row as T))}
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
