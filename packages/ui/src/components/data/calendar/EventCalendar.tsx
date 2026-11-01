"use client";

// A calendar of events: a month grid, 1 to 4 weeks, a day-by-day agenda, or one lane per person.
// Presentational: it places the events it is given. ResourceCalendar (resource-view) loads them
// for a view's visible window; Studio's calendar draws its month with it too.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, dayIn, deviceTimeZone, eachDay, weekdayOf, type Day } from "@marktiderman/genesis-core/dates";
import { Button } from "../../ui/button";
import { cn } from "../../../utils";
import { useFollowedState } from "./use-followed-state";
import { fillMessage, useUiMessages } from "../../../messages";
import {
  calendarLanes,
  calendarWindow,
  eventDots,
  placeEvents,
  shiftAnchor,
  type CalendarEvent,
  type CalendarLane,
  type CalendarLayout,
  type CalendarWeeks,
  type PlacedEvent,
} from "./placement";

/** @stability Beta */
export interface EventCalendarProps<T = unknown> {
  events: readonly CalendarEvent<T>[];
  /** Default `month`. */
  layout?: CalendarLayout;
  /** A day in the window shown (default today). With `onAnchorChange`, the calendar is controlled. */
  anchor?: Day;
  onAnchorChange?: (anchor: Day) => void;
  /** Weeks a `weeks`, `agenda` or `lanes` layout shows, 1 to 4. Default 2. */
  weeks?: CalendarWeeks;
  /** 0 Sunday or 1 Monday (default). */
  weekStartsOn?: 0 | 1;
  /** The clock days are counted on. Default the device's. */
  timeZone?: string;
  /** For `lanes`, and the dots' colours and names. Lanes an event names that aren't here are added. */
  lanes?: readonly CalendarLane[];
  /** An event was clicked or chosen from the keyboard. Without it, events aren't buttons. */
  onSelect?: (event: CalendarEvent<T>) => void;
  /** The agenda shows days with nothing on them too. Default false. */
  showEmptyDays?: boolean;
  /** BCP 47 locale for dates and times. Default the runtime's. */
  locale?: string;
  /** Beside the arrows: a layout switch, a filter. Hidden when printing. */
  toolbar?: ReactNode;
  /** Above the calendar: a cap notice, an error. */
  notice?: ReactNode;
  /** The table's name for screen readers, e.g. "Family events". */
  label?: string;
  /** The events are still loading: the calendar is `aria-busy` and never says "Nothing scheduled". */
  loading?: boolean;
  /** Hide the arrows and Today (a printed sheet, an embedded week). */
  hideNavigation?: boolean;
  className?: string;
  /** Root test id; parts get `-item`, `-day`. Default `event-calendar`. */
  testID?: string;
}

const utc = (day: Day) => new Date(`${day}T12:00:00Z`);

function useFormats(locale: string | undefined, zone: string) {
  return useMemo(() => {
    const f = (o: Intl.DateTimeFormatOptions, z = "UTC") => new Intl.DateTimeFormat(locale, { ...o, timeZone: z });
    const weekday = f({ weekday: "short" });
    const longDay = f({ weekday: "long", month: "long", day: "numeric" });
    const month = f({ month: "long", year: "numeric" });
    const short = f({ month: "short", day: "numeric" });
    const shortYear = f({ month: "short", day: "numeric", year: "numeric" });
    const fullDay = f({ weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const time = f({ hour: "numeric", minute: "2-digit" }, zone);
    return {
      weekday: (d: Day) => weekday.format(utc(d)),
      longDay: (d: Day) => longDay.format(utc(d)),
      month: (d: Day) => month.format(utc(d)),
      short: (d: Day) => short.format(utc(d)),
      shortYear: (d: Day) => shortYear.format(utc(d)),
      fullDay: (d: Day) => fullDay.format(utc(d)),
      time: (at: Date) => time.format(at),
    };
  }, [locale, zone]);
}

/**
 * A calendar of events in one of four layouts:
 *
 * - `month`: the month's whole weeks;
 * - `weeks`: 1 to 4 weeks (`weeks`), the week `anchor` is in first;
 * - `agenda`: the same weeks as a day-by-day list, made to print (one page, no controls);
 * - `lanes`: one row per lane (person), a column per day.
 *
 * An event spanning days shows on each; all-day events sit above timed ones; an event's dots are
 * its `colors`, else its lanes' colours, and its lanes are named for screen readers. Days are a
 * grid with one tab stop: arrow keys move a day or a week, Home and End go to the week's ends,
 * PageUp and PageDown move the window back or on (keeping the focused day's place), and Tab
 * reaches the events. Each day is read with its date and how many events it has.
 *
 * ```tsx
 * <EventCalendar layout="weeks" weeks={2} weekStartsOn={0} events={events} lanes={people} onSelect={open} />
 * ```
 *
 * @stability Beta
 */
export function EventCalendar<T = unknown>({
  events,
  layout = "month",
  anchor: anchorProp,
  onAnchorChange,
  weeks = 2,
  weekStartsOn = 1,
  timeZone,
  lanes: laneDefs,
  onSelect,
  showEmptyDays = false,
  locale,
  toolbar,
  notice,
  label,
  hideNavigation = false,
  loading = false,
  className,
  testID = "event-calendar",
}: EventCalendarProps<T>) {
  const m = useUiMessages().calendar;
  const zone = timeZone ?? deviceTimeZone();
  const today = dayIn(zone);
  const [ownAnchor, setOwnAnchor] = useFollowedState<Day>(anchorProp, () => today);
  const anchor = onAnchorChange ? (anchorProp ?? today) : ownAnchor;
  const setAnchor = (d: Day) => (onAnchorChange ? onAnchorChange(d) : setOwnAnchor(d));
  const range = calendarWindow(layout, anchor, { weeks, weekStartsOn });
  const days = eachDay(range);
  const placed = useMemo(() => placeEvents(events, range, zone), [events, range.start, range.end, zone]); // eslint-disable-line react-hooks/exhaustive-deps
  const lanes = useMemo(() => calendarLanes(events, laneDefs), [events, laneDefs]);
  const fmt = useFormats(locale, zone);

  const last = addDays(range.end, -1);
  // A window across New Year names both years; otherwise the dates alone.
  const crossesYear = range.start.slice(0, 4) !== last.slice(0, 4);
  const title =
    layout === "month"
      ? fmt.month(anchor)
      : crossesYear
        ? `${fmt.shortYear(range.start)} – ${fmt.shortYear(last)}`
        : `${fmt.short(range.start)} – ${fmt.short(last)}`;
  const dayLabel = (day: Day, count: number) =>
    `${fmt.fullDay(day)}${count ? `, ${count === 1 ? m.eventsOne : fillMessage(m.eventsOther, { count })}` : ""}`;
  // PageUp/PageDown, or an arrow past the grid's edge: move the window, and return the day to focus.
  const page = (step: number, day: Day, by?: number) => {
    const next = shiftAnchor(layout, anchor, step, weeks);
    setAnchor(next);
    const nextDays = eachDay(calendarWindow(layout, next, { weeks, weekStartsOn }));
    const target = by !== undefined ? addDays(day, by) : shiftAnchor(layout, day, step, weeks);
    if (nextDays.includes(target)) return target;
    // A day the new window doesn't hold (PageDown from a dimmed day): the same cell there instead.
    const at = Math.max(0, days.indexOf(day));
    return nextDays[Math.min(at, nextDays.length - 1)]!;
  };
  const monthOf = anchor.slice(0, 7);

  const item = (p: PlacedEvent<T>, compact: boolean, className?: string) => (
    <EventItem
      key={`${p.event.key}@${p.day}`}
      className={className}
      placed={p}
      lanes={lanes}
      compact={compact}
      time={p.allDay || p.continued || typeof p.event.start === "string" ? undefined : fmt.time(p.event.start)}
      allDayLabel={m.allDay}
      continuedLabel={m.continued}
      withLabel={m.with}
      onSelect={onSelect}
      testID={`${testID}-item`}
    />
  );

  return (
    <div className={cn("space-y-2", className)} data-testid={testID} data-layout={layout} aria-busy={loading || undefined}>
      <div className="flex flex-wrap items-center gap-2">
        {!hideNavigation && (
          <div className="flex items-center gap-1 print:hidden">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label={layout === "month" ? m.previousMonth : m.previousWeeks}
              onClick={() => setAnchor(shiftAnchor(layout, anchor, -1, weeks))}
              testID={`${testID}-previous`}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label={layout === "month" ? m.nextMonth : m.nextWeeks}
              onClick={() => setAnchor(shiftAnchor(layout, anchor, 1, weeks))}
              testID={`${testID}-next`}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAnchor(today)} testID={`${testID}-today`}>
              {m.today}
            </Button>
          </div>
        )}
        <h3 className="text-sm font-semibold" aria-live="polite">
          {title}
        </h3>
        {toolbar && <div className="ml-auto flex items-center gap-2 print:hidden">{toolbar}</div>}
      </div>
      {notice}
      {layout === "agenda" ? (
        <Agenda
          days={days}
          placed={placed}
          showEmptyDays={showEmptyDays}
          today={today}
          longDay={fmt.longDay}
          nothing={loading ? "" : m.nothing}
          item={(p) => item(p, false)}
          testID={testID}
        />
      ) : layout === "lanes" ? (
        <Lanes
          days={days}
          placed={placed}
          lanes={lanes}
          today={today}
          label={`${label ?? ""}${label ? ", " : ""}${title}`}
          laneHeader={m.lane}
          unassigned={m.unassigned}
          nothing={loading ? "" : m.nothing}
          weekday={fmt.weekday}
          dayLabel={dayLabel}
          onPage={page}
          item={(p) => item(p, true)}
          testID={testID}
        />
      ) : (
        <DayGrid
          days={days}
          placed={placed}
          today={today}
          monthOf={layout === "month" ? monthOf : undefined}
          dayLabel={dayLabel}
          onPage={page}
          perDay={layout === "month" ? 3 : weeks <= 2 ? 6 : 4}
          moreLabel={m.more}
          label={`${label ?? ""}${label ? ", " : ""}${title}`}
          weekday={fmt.weekday}
          tall={layout === "weeks" && weeks <= 2}
          item={(p, className) => item(p, true, className)}
          testID={testID}
        />
      )}
    </div>
  );
}

interface EventItemProps<T> {
  className?: string | undefined;
  placed: PlacedEvent<T>;
  lanes: readonly CalendarLane[];
  compact: boolean;
  time: string | undefined;
  allDayLabel: string;
  continuedLabel: string;
  withLabel: string;
  onSelect: ((event: CalendarEvent<T>) => void) | undefined;
  testID: string;
}

function EventItem<T>({ className, placed, lanes, compact, time, allDayLabel, continuedLabel, withLabel, onSelect, testID }: EventItemProps<T>) {
  const { event } = placed;
  const dots = eventDots(event, lanes);
  const names = (event.lanes ?? []).map((k) => lanes.find((l) => l.key === k)?.label ?? k);
  const body = (
    <>
      {dots.length > 0 && (
        <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
          {dots.map((d, i) => (
            <span key={i} className="inline-block h-2 w-2 rounded-full print:border print:border-foreground" style={{ backgroundColor: d.color }} title={d.label} />
          ))}
        </span>
      )}
      {time ? (
        <span className="shrink-0 tabular-nums text-muted-foreground print:text-foreground">{time}</span>
      ) : (
        !compact && <span className="shrink-0 text-muted-foreground print:text-foreground">{allDayLabel}</span>
      )}
      <span className={cn("min-w-0", compact ? "truncate" : "break-words")}>
        {placed.continued && <span className="sr-only">({continuedLabel}) </span>}
        {event.title}
      </span>
      {names.length > 0 && <span className="sr-only">, {fillMessage(withLabel, { names: names.join(", ") })}</span>}
    </>
  );
  const look = cn(
    "flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs",
    placed.allDay ? "bg-primary/10" : "",
    placed.continued && "rounded-l-none",
    placed.continues && "rounded-r-none",
    compact ? "" : "text-sm",
  );
  return (
    <li data-event={event.key} className={className}>
      {onSelect ? (
        <button
          type="button"
          className={cn(look, "hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring print:bg-transparent")}
          onClick={() => onSelect(event)}
          data-testid={testID}
        >
          {body}
        </button>
      ) : (
        <div className={cn(look, "print:bg-transparent")} data-testid={testID}>
          {body}
        </div>
      )}
    </li>
  );
}

/**
 * Arrow keys between a grid's cells, `perRow` to a row, with one roving tab stop; the events
 * inside stay in tab order. PageUp and PageDown, and an arrow past the first or last cell, ask
 * `onPage` to move the window: it returns the cell to focus there (or nothing, to stay put).
 */
function useGridFocus(
  keys: readonly string[],
  initial: string | undefined,
  perRow: number,
  onPage?: (step: number, key: string, by?: number) => string | undefined,
  /** Left and Right run on into the next or previous row (a day grid); without it, a row's ends page (lanes, where a row is the window). */
  wrapRows = false,
) {
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const refs = useRef(new Map<string, HTMLElement>());
  const active = focusKey && keys.includes(focusKey) ? focusKey : initial && keys.includes(initial) ? initial : keys[0];
  // After a page, focus the cell once it exists.
  useEffect(() => {
    if (pending.current && refs.current.has(pending.current)) {
      refs.current.get(pending.current)!.focus();
      pending.current = null;
    }
  });
  const go = (next: string | undefined) => {
    if (!next) return;
    if (refs.current.has(next)) {
      setFocusKey(next);
      refs.current.get(next)!.focus();
    } else {
      pending.current = next;
      setFocusKey(next);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>, key: string) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "PageUp" || e.key === "PageDown") {
      if (!onPage) return;
      e.preventDefault();
      go(onPage(e.key === "PageUp" ? -1 : 1, key));
      return;
    }
    const i = keys.indexOf(key);
    const col = i % perRow;
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -perRow,
      ArrowDown: perRow,
      Home: -col,
      End: perRow - 1 - col,
    };
    const by = step[e.key];
    if (by === undefined) return;
    e.preventDefault();
    // Past the grid's first or last cell the window moves. Without `wrapRows`, so do Left and Right
    // past a row's ends.
    const sameRow = wrapRows || Math.abs(by) !== 1 || Math.floor((i + by) / perRow) === Math.floor(i / perRow);
    const next = sameRow ? keys[i + by] : undefined;
    if (next !== undefined) go(next);
    else if (onPage) go(onPage(by < 0 ? -1 : 1, key, by));
  };
  return (key: string) => ({
    ref: (el: HTMLElement | null) => {
      if (el) refs.current.set(key, el);
      else refs.current.delete(key);
    },
    tabIndex: key === active ? 0 : -1,
    onFocus: (e: { target: EventTarget; currentTarget: EventTarget }) => {
      if (e.target === e.currentTarget) setFocusKey(key);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKeyDown(e, key),
  });
}

/** A day's events, the first `perDay` shown and the rest behind "+N more" (all of them in print). */
function DayEvents<T>({ list, perDay, moreLabel, item, tall, testID }: { list: PlacedEvent<T>[]; perDay: number; moreLabel: string; item: (p: PlacedEvent<T>, className?: string) => ReactNode; tall?: boolean; testID: string }) {
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  const hidden = open ? 0 : Math.max(0, list.length - perDay);
  return (
    <>
      <ul className={cn("space-y-0.5", open && (tall ? "max-h-36 overflow-y-auto" : "max-h-24 overflow-y-auto"), "print:max-h-none print:overflow-visible")}>
        {list.map((p, i) => (i < list.length - hidden ? item(p) : item(p, "hidden print:list-item")))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="w-full rounded px-1.5 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden"
          onClick={() => setOpen(true)}
          data-testid={`${testID}-more`}
        >
          {fillMessage(moreLabel, { count: hidden })}
        </button>
      )}
    </>
  );
}

interface GridProps<T> {
  days: Day[];
  placed: Map<Day, PlacedEvent<T>[]>;
  today: Day;
  /** `YYYY-MM` for a month grid: days outside it are dimmed. */
  monthOf: string | undefined;
  label: string;
  weekday: (d: Day) => string;
  /** A day cell's name: its date and how many events it has. */
  dayLabel: (d: Day, count: number) => string;
  /** Move the window back (−1) or on (1) from `day`; `by` is the arrow's step past the edge. Returns the day to focus. */
  onPage?: (step: number, day: Day, by?: number) => Day;
  /** Events a cell shows before "+N more". */
  perDay: number;
  moreLabel: string;
  tall: boolean;
  item: (p: PlacedEvent<T>, className?: string) => ReactNode;
  testID: string;
}

function DayGrid<T>({ days, placed, today, monthOf, label, weekday, dayLabel, onPage, perDay, moreLabel, tall, item, testID }: GridProps<T>) {
  const cellProps = useGridFocus(days, today, 7, onPage, true);
  const weeks = Array.from({ length: days.length / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7));
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table role="grid" className="w-full min-w-[42rem] table-fixed border-collapse text-sm" aria-label={label}>
        <thead>
          <tr>
            {weeks[0]!.map((d) => (
              <th key={weekdayOf(d)} scope="col" className="py-1 text-left text-xs font-medium text-muted-foreground">
                {weekday(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const outside = monthOf !== undefined && !day.startsWith(monthOf);
                const list = placed.get(day) ?? [];
                return (
                  <td
                    key={day}
                    role="gridcell"
                    aria-label={dayLabel(day, list.length)}
                    aria-current={day === today ? "date" : undefined}
                    className={cn(
                      "border align-top focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      tall ? "h-40" : "h-28",
                      outside && "bg-muted/30",
                    )}
                    data-day={day}
                    data-testid={`${testID}-day`}
                    {...cellProps(day)}
                  >
                    <div className="flex h-full flex-col gap-0.5 p-1">
                      <span
                        className={cn("text-xs", day === today ? "font-bold text-primary" : outside ? "text-muted-foreground/60" : "text-muted-foreground")}
                        aria-hidden
                      >
                        {Number(day.slice(8))}
                      </span>
                      <DayEvents list={list} perDay={perDay} moreLabel={moreLabel} item={item} tall={tall} testID={testID} />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface LanesProps<T> {
  days: Day[];
  placed: Map<Day, PlacedEvent<T>[]>;
  lanes: readonly CalendarLane[];
  today: Day;
  label: string;
  laneHeader: string;
  /** The lane for events that name none. */
  unassigned: string;
  /** Said when there are no lanes and no events (empty while loading). */
  nothing: string;
  weekday: (d: Day) => string;
  dayLabel: (d: Day, count: number) => string;
  onPage?: (step: number, day: Day, by?: number) => Day;
  item: (p: PlacedEvent<T>) => ReactNode;
  testID: string;
}

const UNASSIGNED = "\u0000unassigned";
const cellKey = (lane: string, day: Day) => `${lane}\u0001${day}`;
const dayOfKey = (key: string) => key.slice(key.indexOf("\u0001") + 1);
const laneOfKey = (key: string) => key.slice(0, key.indexOf("\u0001"));

/** A row per lane, a column per day: a grid like the day grid, each cell a lane's day. */
function Lanes<T>({ days, placed, lanes: given, today, label, laneHeader, unassigned, nothing, weekday, dayLabel, onPage, item, testID }: LanesProps<T>) {
  const anyUnassigned = [...placed.values()].some((list) => list.some((p) => !p.event.lanes?.length));
  const lanes: CalendarLane[] = anyUnassigned ? [...given, { key: UNASSIGNED, label: unassigned }] : [...given];
  const keys = lanes.flatMap((l) => days.map((d) => cellKey(l.key, d)));
  const initial = days.includes(today) ? cellKey(lanes[0]?.key ?? "", today) : undefined;
  const cellProps = useGridFocus(keys, initial, days.length, (step, key, by) => {
    // Up and down past the first or last lane stay put; left, right and paging move the window.
    if (by !== undefined && Math.abs(by) !== 1) return undefined;
    return onPage ? cellKey(laneOfKey(key), onPage(step, dayOfKey(key), by)) : undefined;
  });
  if (!lanes.length) return nothing ? <p className="py-6 text-center text-sm text-muted-foreground">{nothing}</p> : null;
  const inLane = (lane: string, p: PlacedEvent<T>) => (lane === UNASSIGNED ? !p.event.lanes?.length : Boolean(p.event.lanes?.includes(lane)));
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table role="grid" className="w-full table-fixed border-collapse text-sm" style={{ minWidth: `${8 + days.length * 6}rem` }} aria-label={label}>
        <thead>
          <tr>
            <th scope="col" className="w-32 py-1 text-left text-xs font-medium text-muted-foreground">
              {laneHeader}
            </th>
            {days.map((d) => (
              <th
                key={d}
                scope="col"
                aria-current={d === today ? "date" : undefined}
                className={cn("py-1 text-left text-xs font-medium", d === today ? "text-primary" : "text-muted-foreground")}
              >
                {weekday(d)} {Number(d.slice(8))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lanes.map((lane) => (
            <tr key={lane.key} data-lane={lane.key === UNASSIGNED ? "" : lane.key} data-testid={`${testID}-lane`}>
              <th scope="row" className="border px-2 py-1 text-left align-top text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  {lane.color && <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: lane.color }} aria-hidden />}
                  {lane.label}
                </span>
              </th>
              {days.map((day) => {
                const list = (placed.get(day) ?? []).filter((p) => inLane(lane.key, p));
                return (
                  <td
                    key={day}
                    role="gridcell"
                    aria-label={`${lane.label}, ${dayLabel(day, list.length)}`}
                    className="h-16 border p-1 align-top focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    data-day={day}
                    {...cellProps(cellKey(lane.key, day))}
                  >
                    {list.length > 0 && <ul className="space-y-0.5">{list.map(item)}</ul>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface AgendaProps<T> {
  days: Day[];
  placed: Map<Day, PlacedEvent<T>[]>;
  showEmptyDays: boolean;
  today: Day;
  longDay: (d: Day) => string;
  nothing: string;
  item: (p: PlacedEvent<T>) => ReactNode;
  testID: string;
}

/**
 * Day by day, each day a heading over its events. Prints as a plain list: no controls, no
 * fills, a day never split across pages.
 */
function Agenda<T>({ days, placed, showEmptyDays, today, longDay, nothing, item, testID }: AgendaProps<T>) {
  const shown = days.filter((d) => showEmptyDays || (placed.get(d) ?? []).length > 0);
  if (!shown.length) {
    return nothing ? <p className="py-6 text-center text-sm text-muted-foreground">{nothing}</p> : null;
  }
  return (
    <ol className="divide-y rounded-md border print:divide-foreground/30 print:rounded-none print:border-0 print:text-foreground">
      {shown.map((day) => {
        const list = placed.get(day) ?? [];
        return (
          <li key={day} className="grid gap-1 px-3 py-2 sm:grid-cols-[10rem_1fr] print:break-inside-avoid print:px-0" data-day={day} data-testid={`${testID}-day`}>
            <h4 className={cn("text-sm font-medium", day === today && "text-primary print:text-foreground")} aria-current={day === today ? "date" : undefined}>
              {longDay(day)}
            </h4>
            {list.length ? <ul className="space-y-0.5">{list.map(item)}</ul> : nothing && <p className="text-sm text-muted-foreground">{nothing}</p>}
          </li>
        );
      })}
    </ol>
  );
}
