"use client";

// useViewCalendarRange: a calendar's data, pulled out of ResourceCalendar so a custom view (ADR
// 0019) can place a view's rows by date its own way. One query per visible window, live
// invalidation, and the same request rules ResourceCalendar has always used.

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { resourceKeys, useDataProvider, type BaseRecord, type DataRow, type FilterParam, type ListParams, type ResourceContract } from "@marktiderman/genesis-core";
import { encodeRecordKey } from "@marktiderman/genesis-core/schema";
import { addDays, deviceTimeZone, isTimeZone, type Day } from "@marktiderman/genesis-core/dates";
import { useLiveInvalidation, useOptionalViewerScope, type LiveOptions } from "@marktiderman/genesis-core/hooks";
import type { ResourceView as View } from "@marktiderman/genesis-core/resource-view";
import { timeStorage, windowBounds } from "../calendar/values";
import { warnOnce } from "../calendar/guard";

type Row = Record<string, unknown>;

/**
 * Most rows one request loads (a calendar with an `endField` makes two, so up to twice this).
 * A month grid is six weeks: 500 is about a dozen a day, more than a
 * busy shared calendar holds, and still one quick request. Past it the calendar says how many it
 * left out ("+N more") rather than dropping them silently.
 */
export const CALENDAR_LIMIT = 500;

/** The days a calendar shows: `start` inclusive, `end` exclusive, as `calendarWindow` gives them. @stability Beta */
export interface ViewCalendarRange {
  start: Day;
  end: Day;
}

/** @stability Beta */
export interface UseViewCalendarRangeOptions {
  /** The date or timestamp field. Default the view's `calendar.field`. */
  field?: string | undefined;
  /** Default the view's `calendar.endField`. */
  endField?: string | undefined;
  /** Default the view's `calendar.allDayField`. */
  allDayField?: string | undefined;
  /** Server filters (the scope's and the screen's), already as params (`useViewListParams().filters`). */
  filters?: readonly FilterParam[] | undefined;
  select?: string | undefined;
  /** False while the screen waits: nothing is fetched. Default true. */
  enabled?: boolean | undefined;
  live?: boolean | LiveOptions | undefined;
  /** Most rows per request. Default {@link CALENDAR_LIMIT}. */
  limit?: number | undefined;
  /**
   * The clock the window's days are on. Default the field's own (`fields.<field>.timeZone`),
   * else the viewer's, else the device's: the clock the field's cells use.
   */
  timeZone?: string | undefined;
  /**
   * Fields the rows must carry besides the date, end and all-day fields, for the select check.
   * Default the view's `calendar.durationField` and `laneBy`.
   */
  needs?: readonly (string | undefined)[] | undefined;
}

/** @stability Beta */
export interface ViewCalendarRangeState<T extends Row = Row> {
  /** The rows in the window, each once. */
  rows: T[];
  /** Rows the provider counted in all; above `rows.length` when the limit cut some. */
  total: number;
  /** Nothing yet for this window (the last window's rows may stand in). */
  loading: boolean;
  error: unknown;
  refetch: () => void;
  /** The clock the window was read on. */
  timeZone: string;
  /** A row's record key. */
  keyOf: (row: T) => string;
}

/** The clock a field's cells use (display.tsx): its own zone, the scope's, the viewer's, the device's. */
export function displayZone(own: string | undefined, viewer: string | undefined, scope: string | undefined): string {
  if (own && own !== "viewer" && own !== "scope" && isTimeZone(own)) return own;
  const picked = own === "scope" ? (scope ?? viewer) : viewer;
  return picked && isTimeZone(picked) ? picked : deviceTimeZone();
}

/** The fields a Supabase select string doesn't fetch (`*` fetches all; `alias:col` fetches col). */
function selectMissing(select: string, fields: readonly (string | undefined)[]): string[] {
  const top: string[] = [];
  let depth = 0;
  let token = "";
  for (const ch of select) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      top.push(token);
      token = "";
    } else token += ch;
  }
  top.push(token);
  const names = new Set(top.map((t) => t.trim().replace(/\(.*$/s, "").split(":").pop()!.split("::")[0]!.trim()));
  if (names.has("*")) return [];
  return fields.filter((f): f is string => Boolean(f) && !names.has(f!));
}

/**
 * A view's rows in one calendar window, for a screen that places them itself (a custom view,
 * ADR 0019). ResourceCalendar loads its rows through it.
 *
 * ```tsx
 * const range = calendarWindow("weeks", today, { weeks: 1 });
 * const week = useViewCalendarRange(sessionsView, range, { filters: useViewListParams({ view: sessionsView }).filters });
 * ```
 *
 * At most two requests, each a plain filter list the provider rules apply to, that neither
 * overlap nor leave a gap: rows that start in the window, and, with an end field, rows that
 * started before it and end inside or after it. One query for both, under core's list keys, so a
 * save refreshes it; the last window's rows stand in while the next loads, never across a change
 * of filters.
 *
 * @stability Beta
 */
export function useViewCalendarRange<T extends Row = Row>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: View<ResourceContract<any>, T & DataRow>,
  range: ViewCalendarRange,
  options: UseViewCalendarRangeOptions = {},
): ViewCalendarRangeState<T> {
  const own = view.definition.calendar;
  const fieldName = options.field ?? own?.field;
  const endField = options.endField ?? own?.endField;
  const allDayField = options.allDayField ?? own?.allDayField;
  const { filters = [], select, enabled = true, live, limit = CALENDAR_LIMIT } = options;
  const needs = options.needs ?? [own?.durationField, own?.laneBy];
  const provider = useDataProvider();
  const viewerScope = useOptionalViewerScope();
  if (!fieldName) throw new Error(`ResourceView(${view.resource}): a calendar needs a date field: the view's calendar.field, or { field }`);
  const zone = options.timeZone ?? displayZone(view.definition.fields?.[fieldName as never]?.timeZone, viewerScope?.timeZone, viewerScope?.scopeTimeZone);
  const storage = timeStorage(view.field(fieldName));
  const endStorage = endField ? timeStorage(view.field(endField)) : storage;
  // An all-day row stored as instants lands on its UTC day, which can be a day either side of the
  // window's own midnights on this clock: ask for a day more each side, and let placement keep
  // only the window's days.
  const fetched = allDayField && storage === "zoned" ? { start: addDays(range.start, -1), end: addDays(range.end, 1) } : range;
  const { from, to } = windowBounds(fetched, storage, zone);
  const end = endField ? windowBounds(allDayField && endStorage === "zoned" ? fetched : range, endStorage, zone) : undefined;

  // A select that leaves out the calendar's own fields makes every event vanish, silently: say so.
  if (select) {
    const missing = selectMissing(select, [fieldName, endField, allDayField, ...needs]);
    if (missing.length) warnOnce(`ResourceView(${view.resource}): calendar select "${select}" leaves out ${missing.join(", ")}; events need them`);
  }
  // Everything the rows depend on except the window: what decides whether the last rows may stand in.
  const listScope = JSON.stringify([filters, select ?? null, fieldName, endField ?? null, limit]);
  const base = { pagination: { page: 1, perPage: limit }, sort: { field: fieldName, order: "asc" as const }, ...(select ? { select } : {}) };
  const starting: ListParams = {
    ...base,
    filters: [...filters, { field: fieldName, operator: "gte", value: from }, { field: fieldName, operator: "lt", value: to }],
  };
  // A timestamp end is exclusive, so one exactly at the window's first midnight is out (`gt`); a
  // date end is the last day (`gte`).
  const running: ListParams | undefined = end && {
    ...base,
    filters: [...filters, { field: fieldName, operator: "lt", value: from }, { field: endField!, operator: endStorage === "date" ? "gte" : "gt", value: end.from }],
  };
  const query = useQuery({
    queryKey: [...resourceKeys(view.resource).lists, { calendar: running ? [starting, running] : [starting], scope: listScope }],
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[2] as { scope?: string } | undefined)?.scope === listScope ? keepPreviousData(previous) : undefined,
    enabled,
    queryFn: async () => {
      const lists = await Promise.all([starting, ...(running ? [running] : [])].map((params) => provider.getList<BaseRecord>(view.resource, params)));
      return {
        data: lists.flatMap((l) => l.data),
        total: lists.reduce((n, l) => n + (l.total ?? l.data.length), 0),
      };
    },
  });
  // `live`, as a list has it: a change to the resource refetches the calendar.
  useLiveInvalidation(view.resource, live, enabled, { filters: [...filters] }, resourceKeys(view.resource).all);
  const keyOf = (row: T) => String(encodeRecordKey(view.contract, row as DataRow));
  // The two filters can't both match a row; keyed anyway, so a row is never drawn twice.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return ((query.data?.data ?? []) as unknown as T[]).filter((row) => {
      const key = String(encodeRecordKey(view.contract, row as DataRow));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [query.data, view]);
  return {
    rows,
    total: query.data?.total ?? 0,
    loading: query.isPending || query.isPlaceholderData,
    error: query.error,
    refetch: () => void query.refetch(),
    timeZone: zone,
    keyOf,
  };
}
