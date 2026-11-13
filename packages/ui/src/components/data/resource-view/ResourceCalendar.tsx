"use client";

// ResourceView's calendar mode (docs/RESOURCE-VIEW.md, "Calendar"): a view's rows placed by a
// date field, one request per visible window. Drawn by EventCalendar; a click opens the same peek
// the list does, or the screen's `onSelect`.

import { useMemo, useState, type ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { useDataProvider, type DataRow, type FilterParam, type ResourceContract } from "@marktiderman/genesis-core";
import { encodeRecordKey } from "@marktiderman/genesis-core/schema";
import { dayIn, isTimeZone, type Day } from "@marktiderman/genesis-core/dates";
import { loadRelationLabel, useOptionalViewerScope, type LiveOptions } from "@marktiderman/genesis-core/hooks";
import { calendarEvents, calendarProblems, type RecordOpen, type RecordView as RecordViewDef, type ResourceView as View, type ViewCalendar } from "@marktiderman/genesis-core/resource-view";
import { defaultNavigate, type NavigateFn } from "../../../navigation";
import { Button } from "../../ui/button";
import { cn } from "../../../utils";
import { fillMessage, useUiMessages } from "../../../messages";
import { EventCalendar } from "../calendar/EventCalendar";
import { calendarLanes, calendarWindow, type CalendarLane, type CalendarLayout, type CalendarWeeks } from "../calendar/placement";
import { PrintableAgenda, type PrintableSection } from "../calendar/PrintableAgenda";
import { useFollowedState } from "../calendar/use-followed-state";
import { anchorOr, layoutOr } from "../calendar/guard";
import { useViewDetailFields } from "./view-list";
import { CALENDAR_LIMIT, displayZone, useViewCalendarRange } from "./use-view-calendar-range";
import { recordViewOf, resolveRecordOpen, ViewRecordPeek } from "./record-open";

export { CALENDAR_LIMIT };
import { useIsMobile } from "../../../hooks/use-mobile";

type Row = Record<string, unknown>;

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
  /** A row was chosen. Default: the view's peek (or page, with `open="page"`). */
  onSelect?: (row: T) => void;
  /**
   * How an event's record opens (ADR 0021): `side-peek`, `center-peek` or `page` (navigates to
   * `/{resource}/{id}` through `onNavigate`), or `none`. Default the view's `open`, else a side peek.
   */
  open?: RecordOpen | "none";
  /** The record view a peek draws. Default the view's `recordView`, else the view's columns. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  recordView?: RecordViewDef<ResourceContract<any>, any>;
  /** With `open="page"`: how to go to the record's page. Default a full-page navigation. */
  onNavigate?: NavigateFn;
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

function withoutUndefined<O extends object>(o: O): Partial<O> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<O>;
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
    limit = CALENDAR_LIMIT, showEmptyDays, onSelect, print, onNavigate,
  } = settings;
  const openMode = resolveRecordOpen(view, props.open);
  const recordView = recordViewOf(view, props.recordView);
  const m = useUiMessages();
  const provider = useDataProvider();
  const viewerScope = useOptionalViewerScope();
  if (!fieldName) throw new Error(`ResourceView(${view.resource}): mode="calendar" needs a calendar field: the view's calendar.field, or calendar={{ field }}`);
  // The screen's overrides get the checks the view's own block got in defineView. Layout and
  // anchor are left out: they often come from the URL, so a bad one falls back instead of throwing.
  const { layout: _urlLayout, ...configured } = settings;
  const problems = calendarProblems(view.contract.fields, configured);
  if (problems.length) throw new Error(`ResourceView(${view.resource}): ${problems.join("; ")}`);
  const badWeeks = (weeksOptions ?? []).filter((w) => ![1, 2, 3, 4].includes(w));
  if (badWeeks.length) throw new Error(`ResourceView(${view.resource}): calendar weeksOptions are 1 to 4, not ${badWeeks.join(", ")}`);
  if (timeZone !== undefined && !isTimeZone(timeZone)) {
    throw new Error(`ResourceView(${view.resource}): calendar timeZone "${timeZone}" isn't a time zone the runtime knows`);
  }
  const zone = timeZone ?? displayZone(view.definition.fields?.[fieldName as never]?.timeZone, viewerScope?.timeZone, viewerScope?.scopeTimeZone);
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
  // The window's rows: one query per window, refreshed live (useViewCalendarRange, which a custom
  // view calls the same way).
  const data = useViewCalendarRange<T>(view, range, {
    field: fieldName,
    endField,
    allDayField,
    filters,
    select,
    enabled,
    live,
    limit,
    timeZone: zone,
    needs: [durationField, lanesOf ? undefined : laneBy],
  });
  const { rows, loading } = data;
  const loaded = rows.length;
  const total = data.total;
  const error = data.error;

  // The rows as events: core's calendarEvents, the same reading the phone's calendar uses.
  const events = useMemo(
    () =>
      calendarEvents<T>(view, rows, {
        field: fieldName,
        endField,
        durationField,
        durationUnit,
        allDayField,
        laneBy,
        timeZone: zone,
        lanesOf,
        colorsOf,
        classNameOf,
        statusOf,
      }),
    [rows, fieldName, endField, durationField, durationUnit, allDayField, zone, lanesOf, laneBy, colorsOf, classNameOf, statusOf, view],
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
        onSelect={(e) => {
          if (onSelect) return onSelect(e.row as T);
          if (openMode === "page") return (onNavigate ?? defaultNavigate)(`/${view.resource}/${e.key}`);
          if (openMode !== "none") setOpenKey(e.key);
        }}
        loading={loading}
        testID={testID}
      />
      <ViewRecordPeek<T> view={view} recordView={recordView} open={openMode} row={open} onClose={() => setOpenKey(null)} fields={detailFields} />
    </div>
  );
}
