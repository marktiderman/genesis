// useViewCalendarRange: a calendar's data, shared by the web's calendar, a custom view (ADR 0019)
// and the phone's calendar, so each places a view's rows by date from the same reads. One query
// per visible window, live invalidation, and the same request rules everywhere.

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import type { BaseRecord, FilterParam, ListParams } from "../provider/types";
import { resourceKeys } from "../query-keys";
import { encodeRecordKey } from "../schema/keys";
import type { DataRow, ResourceContract } from "../schema/types";
import { addDays, type Day } from "../dates";
import type { ResourceView as View } from "../resource-view/types";
import { displayZone, timeStorage, warnOnce, windowBounds } from "../resource-view/calendar";
import { useLiveInvalidation, type LiveOptions } from "./use-live";
import { useOptionalViewerScope } from "./viewer-scope";

type Row = Record<string, unknown>;

/**
 * Most rows one request loads (a calendar with an `endField` makes two, so up to twice this).
 * A month grid is six weeks: 500 is about a dozen a day, more than a
 * busy shared calendar holds, and still one quick request. Past it the calendar says how many it
 * left out ("+N more") rather than dropping them silently.
 */
export const CALENDAR_LIMIT = 500;

const DURATION_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;

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
  /** Default the view's `calendar.durationField`. */
  durationField?: string | undefined;
  /** Default the view's `calendar.durationUnit`, else minutes. */
  durationUnit?: "minutes" | "hours" | "days" | undefined;
  /** Default the view's `calendar.maxDuration`: how far before the window a row with a duration is read. */
  maxDuration?: number | undefined;
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
  const durationField = options.durationField ?? own?.durationField;
  const durationUnit = options.durationUnit ?? own?.durationUnit ?? "minutes";
  const maxDuration = options.maxDuration ?? own?.maxDuration;
  const needs = options.needs ?? [durationField, own?.laneBy];
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
  // A row whose end is its start plus a duration (no end column, or an empty one) can start before
  // the window and run into it: with `maxDuration`, the rows that started that long before are read
  // too (whole days, so the start's clock doesn't matter), and placement keeps only the ones that
  // reach the window. Without it, such a row shows only from the days it starts on: said once.
  const leadDays = durationField && maxDuration && maxDuration > 0 ? Math.ceil((maxDuration * DURATION_MS[durationUnit]) / DURATION_MS.days) : 0;
  if (durationField && !leadDays) {
    warnOnce(`ResourceView(${view.resource}): calendar durationField "${durationField}" has no maxDuration, so a row that starts before the window and runs into it isn't read; set calendar.maxDuration`);
  }
  const lookback = leadDays ? windowBounds(fetched, storage, zone, leadDays).from : undefined;

  // Everything the rows depend on except the window: what decides whether the last rows may stand in.
  const listScope = JSON.stringify([filters, select ?? null, fieldName, endField ?? null, limit, durationField ?? null, leadDays]);
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
  // Rows that started within `maxDuration` before the window with no end of their own (no end
  // column, or an empty one): their end is their duration's, which a filter can't compute.
  const lasting: ListParams | undefined = lookback !== undefined
    ? {
        ...base,
        filters: [
          ...filters,
          { field: fieldName, operator: "gte", value: lookback },
          { field: fieldName, operator: "lt", value: from },
          ...(endField ? [{ field: endField, operator: "is_null" as const }] : []),
        ],
      }
    : undefined;
  const reads = [starting, ...(running ? [running] : []), ...(lasting ? [lasting] : [])];
  const query = useQuery({
    queryKey: [...resourceKeys(view.resource).lists, { calendar: reads, scope: listScope }],
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[2] as { scope?: string } | undefined)?.scope === listScope ? keepPreviousData(previous) : undefined,
    enabled,
    queryFn: async () => {
      const lists = await Promise.all(reads.map((params) => provider.getList<BaseRecord>(view.resource, params)));
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
