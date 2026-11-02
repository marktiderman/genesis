"use client";

// ResourceView's calendar mode (docs/RESOURCE-VIEW.md, "Calendar"): a view's rows placed by a
// date field, one request per visible window. Drawn by EventCalendar; a click opens the same peek
// the list does, or the screen's `onSelect`.

import { useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { resourceKeys, useDataProvider, type BaseRecord, type DataRow, type FilterParam, type ListParams, type ResourceContract } from "@marktiderman/genesis-core";
import { encodeRecordKey } from "@marktiderman/genesis-core/schema";
import { addDays, dayIn, deviceTimeZone, isTimeZone, readEventTime, type Day } from "@marktiderman/genesis-core/dates";
import { loadRelationLabel, useLiveInvalidation, useOptionalViewerScope, type LiveOptions } from "@marktiderman/genesis-core/hooks";
import { calendarProblems, type ResourceView as View, type ViewCalendar, type ViewCalendarDurationUnit } from "@marktiderman/genesis-core/resource-view";
import { Button } from "../../ui/button";
import { cn } from "../../../utils";
import { fillMessage, useUiMessages } from "../../../messages";
import { DetailPanel } from "../DetailPanel";
import { EventCalendar } from "../calendar/EventCalendar";
import { calendarLanes, calendarWindow, type CalendarEvent, type CalendarLane, type CalendarLayout, type CalendarWeeks } from "../calendar/placement";
import { PrintableAgenda, type PrintableSection } from "../calendar/PrintableAgenda";
import { timeStorage, windowBounds } from "../calendar/values";
import { useFollowedState } from "../calendar/use-followed-state";
import { anchorOr, layoutOr, warnOnce } from "../calendar/guard";
import { useViewDetailFields } from "./view-list";
import { useIsMobile } from "../../../hooks/use-mobile";

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
   * Week counts the toolbar offers beside `layouts` (`[1, 2, 4]`), for the `weeks`, `agenda` and
   * `lanes` layouts. Without two or more, no switch. The pick is kept as the layout's is: with
   * `onWeeksChange` the screen owns it (`weeks`, in the URL), else the calendar does.
   */
  weeksOptions?: readonly CalendarWeeks[];
  onWeeksChange?: (weeks: CalendarWeeks) => void;
  /**
   * Beside the layout and weeks switches: a Print button, a mode switch. A function gets what the
   * calendar shows now.
   */
  toolbar?: ReactNode | ((state: ResourceCalendarToolbarState) => ReactNode);
  /** Give lanes with no colour of their own `laneColor(i)` (EventCalendar's `colorLanes`). Default false. */
  colorLanes?: boolean;
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
   * Classes for a row's event (`(row) => row.status === "cancelled" ? "line-through opacity-60" : undefined`):
   * a cancelled event struck through rather than dropped. Give `statusOf` too, so the look isn't
   * the only cue.
   */
  classNameOf?: (row: T) => string | undefined;
  /** Words read out after a row's title ("Cancelled"), for what `classNameOf` shows. */
  statusOf?: (row: T) => string | undefined;
  /**
   * Most rows one request loads. Default {@link CALENDAR_LIMIT}. With an `endField` the calendar
   * makes two (rows starting in the window, and rows that started before it and run into it),
   * each capped.
   */
  limit?: number;
  /** The agenda shows empty days too. */
  showEmptyDays?: boolean;
  /** A row was chosen. Default: the view's peek. */
  onSelect?: (row: T) => void;
  /**
   * Print one sheet per lane (PrintableAgenda) for the week the calendar shows, instead of the
   * calendar itself: the same rows, scope and filters, with no screen code reading data. Lanes
   * come from `lanes`, else the linked rows' words (`laneBy` on a link), else the lane values.
   */
  print?: { sections?: readonly PrintableSection[]; title?: ReactNode; headingLevel?: 2 | 3 | 4 | 5 };
}

/** What a calendar's `toolbar` function is given. @stability Beta */
export interface ResourceCalendarToolbarState {
  layout: CalendarLayout;
  weeks: CalendarWeeks;
  anchor: Day;
}

export interface ResourceCalendarProps<T extends Row = Row> extends ResourceCalendarOptions<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: View<ResourceContract<any>, T & DataRow>;
  /** Draw some peek fields the screen's own way, by column key (ResourceView's `cells`). */
  cells?: Partial<Record<string, (row: T) => ReactNode>>;
  /** Supabase select syntax for joined columns (`resourceOptions.select`), sent with each request. */
  select?: string;
  /** False while the screen waits (on its scope, say): nothing is fetched. Default true. */
  enabled?: boolean;
  /** Refetch when the provider reports a change, as a list's `live` does. */
  live?: boolean | LiveOptions;
  /** Server filters (the view's scope and the screen's), already as params. */
  filters?: readonly FilterParam[];
  title?: string;
  /** A line under the title (ResourceView's `subtitle`, else the view's `copy.subtitle`). */
  subtitle?: string;
  className?: string;
  testID?: string;
}

const UNIT_MS: Readonly<Record<ViewCalendarDurationUnit, number>> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

/** A duration field's value as a count of its unit, or null when it isn't a positive number. */
function durationOf(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** An instant at 00:00:00.000 UTC: how an all-day event is stored as an instant. */
const atUtcMidnight = (at: Date) => at.getTime() % UNIT_MS.days === 0;

/** The latest instant a Date holds (ECMAScript's limit, about the year 275760). */
const MAX_TIME = 8.64e15;

/**
 * A row's end from its start and a duration in ms: the last day (inclusive) for a date or an
 * all-day row, the end instant for a timed one; null when it can't be represented.
 */
function durationEnd(start: Day | Date, startDay: Day, allDay: boolean, ms: number): Day | Date | null {
  if (!Number.isFinite(ms)) return null;
  if (typeof start === "string" || allDay) {
    const days = Math.max(1, Math.ceil(ms / UNIT_MS.days));
    if (!Number.isSafeInteger(days) || days * UNIT_MS.days > MAX_TIME) return null;
    try {
      return addDays(startDay, days - 1);
    } catch {
      return null;
    }
  }
  const end = start.getTime() + ms;
  return Number.isFinite(end) && Math.abs(end) <= MAX_TIME ? new Date(end) : null;
}

/** The clock a field's cells use (display.tsx): its own zone, the scope's, the viewer's, the device's. */
function displayZone(own: string | undefined, viewer: string | undefined, scope: string | undefined): string {
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
  const { view, filters = [], title, subtitle, className, cells, select, enabled = true, live, testID = "resource-calendar" } = props;
  // The view's block, then the screen's settings over it.
  const settings = { ...view.definition.calendar, ...withoutUndefined(props) } as ResourceCalendarOptions<T>;
  const {
    field: fieldName, endField, durationField, durationUnit = "minutes", allDayField, layout: layoutProp, phoneLayout, layouts, onLayoutChange,
    weeks: weeksProp = 2, weeksOptions, onWeeksChange, toolbar, colorLanes, weekStartsOn = 1, timeZone, anchor: anchorProp, onAnchorChange, laneBy, lanesOf, lanes, colorsOf, classNameOf, statusOf,
    limit = CALENDAR_LIMIT, showEmptyDays, onSelect, print,
  } = settings;
  const m = useUiMessages();
  const provider = useDataProvider();
  const viewerScope = useOptionalViewerScope();
  if (!fieldName) throw new Error(`ResourceView(${view.resource}): mode="calendar" needs a calendar field: the view's calendar.field, or calendar={{ field }}`);
  // The screen's overrides get the checks the view's own block got in defineView. Layout and
  // anchor are left out: they often come from the URL, so a bad one falls back instead of throwing.
  const { layout: _urlLayout, ...configured } = settings;
  const problems = calendarProblems(view.contract.fields, configured);
  if (problems.length) throw new Error(`ResourceView(${view.resource}): ${problems.join("; ")}`);
  const field = view.field(fieldName)!;
  const badWeeks = (weeksOptions ?? []).filter((w) => ![1, 2, 3, 4].includes(w));
  if (badWeeks.length) throw new Error(`ResourceView(${view.resource}): calendar weeksOptions are 1 to 4, not ${badWeeks.join(", ")}`);
  if (timeZone !== undefined && !isTimeZone(timeZone)) {
    throw new Error(`ResourceView(${view.resource}): calendar timeZone "${timeZone}" isn't a time zone the runtime knows`);
  }
  const zone = timeZone ?? displayZone(view.definition.fields?.[fieldName as never]?.timeZone, viewerScope?.timeZone, viewerScope?.scopeTimeZone);
  const storage = timeStorage(field);
  const endStorage = endField ? timeStorage(view.field(endField)) : storage;
  const where = `ResourceView(${view.resource})`;

  const [ownLayout, setOwnLayout] = useFollowedState<CalendarLayout>(layoutProp, () => "month");
  // `phoneLayout`: below 768px, that layout until the person picks one from the switch. Unset,
  // a phone shows the same layout as a desktop, as before.
  const phone = useIsMobile();
  const [picked, setPicked] = useState(false);
  const layout = layoutOr(phoneLayout && phone && !picked ? phoneLayout : onLayoutChange ? layoutProp : ownLayout, where);
  // `weeksOptions`' pick is kept where the layout's is: the screen's with `onWeeksChange`, else ours.
  const [ownWeeks, setOwnWeeks] = useFollowedState<CalendarWeeks>(weeksProp, () => 2);
  const weeksPicked = onWeeksChange ? weeksProp : ownWeeks;
  const weeks: CalendarWeeks = [1, 2, 3, 4].includes(weeksPicked) ? weeksPicked : 2;
  const [ownAnchor, setOwnAnchor] = useFollowedState<Day>(anchorProp, () => dayIn(zone));
  const anchor = anchorOr(onAnchorChange ? anchorProp : ownAnchor, dayIn(zone), where);
  const range = calendarWindow(layout, anchor, { weeks, weekStartsOn });
  // An all-day row stored as instants lands on its UTC day (below), which can be a day either
  // side of the window's own midnights on this clock: ask for a day more each side, and let
  // placement keep only the window's days.
  const fetched = allDayField && storage === "zoned" ? { start: addDays(range.start, -1), end: addDays(range.end, 1) } : range;
  const { from, to } = windowBounds(fetched, storage, zone);
  const end = endField ? windowBounds(allDayField && endStorage === "zoned" ? fetched : range, endStorage, zone) : undefined;

  // At most two lists, each a plain filter list the provider rules apply to, that neither overlap
  // nor leave a gap:
  // - rows that start in the window, whatever their end (a moment at its first midnight included);
  // - with an end field, rows that started before it and end inside or after it (a long event that
  //   began weeks ago; no guessing how far back to look). A timestamp end is exclusive, so one
  //   exactly at the window's first midnight is out (`gt`); a date end is the last day (`gte`).
  // A select that leaves out the calendar's own fields makes every event vanish, silently: say so.
  if (select) {
    const missing = selectMissing(select, [fieldName, endField, durationField, allDayField, lanesOf ? undefined : laneBy]);
    if (missing.length) warnOnce(`ResourceView(${view.resource}): calendar select "${select}" leaves out ${missing.join(", ")}; events need them`);
  }
  // Everything the rows depend on except the window: what decides whether the last rows may stand in.
  const listScope = JSON.stringify([filters, select ?? null, fieldName, endField ?? null, limit]);
  const base = { pagination: { page: 1, perPage: limit }, sort: { field: fieldName, order: "asc" as const }, ...(select ? { select } : {}) };
  const starting: ListParams = {
    ...base,
    filters: [...filters, { field: fieldName, operator: "gte", value: from }, { field: fieldName, operator: "lt", value: to }],
  };
  const running: ListParams | undefined = end && {
    ...base,
    filters: [...filters, { field: fieldName, operator: "lt", value: from }, { field: endField!, operator: endStorage === "date" ? "gte" : "gt", value: end.from }],
  };
  // One query for both, so they load, refresh and show placeholder data together: two windows'
  // rows never mix. Under core's list keys, and shaped like a provider's list (`{ data, total }`),
  // so a save refreshes it and optimistic or undoable writes patch it like any list.
  const query = useQuery({
    queryKey: [...resourceKeys(view.resource).lists, { calendar: running ? [starting, running] : [starting], scope: listScope }],
    // The last window's rows stay up while the next window loads, but never across a change of
    // scope or filter: those rows aren't this list's, and shouldn't be shown or opened.
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
  const loading = query.isPending || query.isPlaceholderData;
  // `live`, as a list has it: a change to the resource refetches the calendar.
  useLiveInvalidation(view.resource, live, enabled, { filters: [...filters] }, resourceKeys(view.resource).all);
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
  const loaded = rows.length;
  const total = query.data?.total ?? 0;
  const error = query.error;

  const events = useMemo(
    () =>
      rows.flatMap((row): CalendarEvent<T>[] => {
        const start = readEventTime(row[fieldName], { dateOnly: storage === "date", timeZone: zone });
        if (start === null) return [];
        const ownEnd = endField ? readEventTime(row[endField], { dateOnly: endStorage === "date", timeZone: zone }) : null;
        const allDay = allDayField ? Boolean(row[allDayField]) : typeof start === "string";
        // An all-day row's days. Stored as days (`YYYY-MM-DD`), they are those days, with no clock
        // at all. Stored as instants at UTC midnight (how Google's API and most sources write an
        // all-day event), they are read on UTC: on a clock behind UTC that midnight is the
        // evening before. Any other instants (a midnight on the viewer's clock) are read on the
        // viewer's clock, as before.
        const clock = allDay && typeof start !== "string" && atUtcMidnight(start) && (ownEnd === null || typeof ownEnd === "string" || atUtcMidnight(ownEnd)) ? "UTC" : zone;
        const startDay = typeof start === "string" ? start : dayIn(clock, start);
        // No end of its own: the start plus its duration. A timed row ends that long after it
        // starts (exclusive, like a stored end); a date or an all-day row runs that many days
        // from its start day, so its last day is the one before (two days from the 3rd end on
        // the 4th), and never before its first. An end that can't be represented (a typo of
        // 1e308 days) leaves the row on its start alone, never breaking the calendar.
        const length = ownEnd === null && durationField ? durationOf(row[durationField]) : null;
        const rowEnd = length === null ? ownEnd : durationEnd(start, startDay, allDay, length * UNIT_MS[durationUnit]);
        // An all-day row stored as instants runs to an exclusive end: its last day is the one
        // before the end instant, and never before its first.
        const lastDay = (v: Day | Date) => {
          const d = typeof v === "string" ? v : dayIn(clock, new Date(v.getTime() - 1));
          return d < startDay ? startDay : d;
        };
        const rowLanes = lanesOf ? lanesOf(row) : laneBy ? laneKeys(row[laneBy]) : undefined;
        const colors = colorsOf?.(row);
        const look = classNameOf?.(row);
        const status = statusOf?.(row);
        return [
          {
            key: String(encodeRecordKey(view.contract, row as DataRow)),
            title: view.summary(row as T & DataRow).title,
            start: allDay ? startDay : start,
            ...(rowEnd !== null ? { end: allDay ? lastDay(rowEnd) : rowEnd } : {}),
            allDay,
            ...(rowLanes ? { lanes: rowLanes } : {}),
            ...(colors ? { colors } : {}),
            ...(look ? { className: look } : {}),
            ...(status ? { status } : {}),
            row,
          },
        ];
      }),
    [rows, fieldName, endField, durationField, durationUnit, allDayField, storage, endStorage, zone, lanesOf, laneBy, colorsOf, classNameOf, statusOf, view],
  );

  // The peek holds the record's key and reads the row from the current data, so it shows the row
  // as it is now (after a save or a refetch), and closes if the row leaves the calendar.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = useMemo(
    () => (openKey === null ? null : (rows.find((row) => String(encodeRecordKey(view.contract, row as DataRow)) === openKey) ?? null)),
    [openKey, rows, view],
  );
  const detailFields = useViewDetailFields(view, cells);

  // Lanes named by a link (`laneBy` on a field with `references`) are labelled by the linked row's
  // words, as a relation cell is: never the raw id. Lanes the screen names itself keep its labels.
  const laneField = laneBy && !lanesOf ? view.field(laneBy) : undefined;
  const reference = laneField?.references;
  const linkLabelField = laneBy ? view.definition.fields?.[laneBy as never]?.labelField : undefined;
  // Each lane's id as stored (a number stays a number), so its label shares the cache entry a
  // relation cell for the same row uses.
  const linkedIds = useMemo(() => {
    if (!reference || !laneBy) return [];
    const named = new Set((lanes ?? []).map((l) => l.key));
    const raw = new Map<string, string | number>();
    for (const row of rows) {
      const value = row[laneBy];
      for (const v of Array.isArray(value) ? value : [value]) {
        if ((typeof v === "string" && v !== "") || (typeof v === "number" && Number.isFinite(v))) {
          if (!named.has(String(v)) && !raw.has(String(v))) raw.set(String(v), v);
        }
      }
    }
    return [...raw.values()];
  }, [reference, laneBy, rows, lanes]);
  const linkedLabels = useQueries({
    queries: linkedIds.map((id) => ({
      queryKey: [reference?.resource, "relation-label", { field: reference?.field, labelField: linkLabelField ?? null, id: `${typeof id}:${String(id)}` }],
      staleTime: 60_000,
      retry: false,
      queryFn: () => loadRelationLabel(provider, reference!, id, linkLabelField),
    })),
  });
  const shownLanes = useMemo(
    () =>
      reference
        ? [
            ...(lanes ?? []),
            ...linkedIds.map((id, i) => {
              const q = linkedLabels[i];
              // Words, never a raw id or a bare ellipsis: "Loading…" while they come, then the
              // hidden-link words when there are none.
              return { key: String(id), label: q?.data ?? (q?.isPending ? m.common.loading : m.common.hiddenLink) };
            }),
          ]
        : lanes,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reference, lanes, linkedIds, linkedLabels.map((q) => q.data ?? (q.isPending ? "" : null)).join("\u0001")],
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
            onClick={() => {
              // A pick is the person's, on a phone too: `phoneLayout` stops applying.
              setPicked(true);
              if (onLayoutChange) onLayoutChange(l);
              else setOwnLayout(l);
            }}
            testID={`${testID}-layout-${l}`}
          >
            {m.calendar.layouts[l]}
          </Button>
        ))}
      </div>
    ) : undefined;
  const weeksSwitch =
    weeksOptions && weeksOptions.length > 1 && layout !== "month" ? (
      <div className="flex items-center overflow-hidden rounded-lg border" role="group" aria-label={m.calendar.weeksShown}>
        {weeksOptions.map((w) => (
          <Button
            key={w}
            type="button"
            size="sm"
            variant={w === weeks ? "default" : "ghost"}
            className="h-8 rounded-none"
            aria-pressed={w === weeks}
            onClick={() => (onWeeksChange ? onWeeksChange(w) : setOwnWeeks(w))}
            testID={`${testID}-weeks-${w}`}
          >
            {w === 1 ? m.calendar.weeksOne : fillMessage(m.calendar.weeksOther, { count: w })}
          </Button>
        ))}
      </div>
    ) : undefined;
  const ownTools = typeof toolbar === "function" ? toolbar({ layout, weeks, anchor }) : toolbar;
  const bar =
    switcher || weeksSwitch || ownTools ? (
      <>
        {switcher}
        {weeksSwitch}
        {ownTools}
      </>
    ) : undefined;

  return (
    <div className={className}>
      {title && <h2 className={cn(subtitle ? "text-lg font-semibold" : "mb-2 text-lg font-semibold", print && "print:hidden")}>{title}</h2>}
      {subtitle && <p className={cn("mb-2 text-sm text-muted-foreground", print && "print:hidden")}>{subtitle}</p>}
      {print && (
        <PrintableAgenda<T>
          events={events}
          lanes={shownLanes ?? calendarLanes(events)}
          anchor={anchor}
          weekStartsOn={weekStartsOn}
          timeZone={zone}
          {...(print.sections ? { sections: print.sections } : {})}
          {...(print.title !== undefined ? { title: print.title } : {})}
          {...(print.headingLevel ? { headingLevel: print.headingLevel } : {})}
          className="hidden print:block"
          testID={`${testID}-print`}
        />
      )}
      <EventCalendar<T>
        {...(print ? { className: "print:hidden" } : {})}
        events={events}
        layout={layout}
        anchor={anchor}
        onAnchorChange={(d) => (onAnchorChange ? onAnchorChange(d) : setOwnAnchor(d))}
        weeks={weeks}
        weekStartsOn={weekStartsOn}
        timeZone={zone}
        {...(shownLanes ? { lanes: shownLanes } : {})}
        {...(showEmptyDays !== undefined ? { showEmptyDays } : {})}
        label={title ?? view.title}
        toolbar={bar}
        {...(colorLanes ? { colorLanes } : {})}
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
        onSelect={(e) => (onSelect ? onSelect(e.row as T) : setOpenKey(e.key))}
        loading={loading}
        testID={testID}
      />
      <DetailPanel<T>
        item={open}
        open={open !== null}
        onClose={() => setOpenKey(null)}
        title={open ? view.summary(open as T & DataRow).title : undefined}
        subtitle={open ? view.summary(open as T & DataRow).subtitle : undefined}
        fields={detailFields}
      />
    </div>
  );
}
