"use client";

// A calendar of events: a month grid, 1 to 4 weeks, a day-by-day agenda, or one lane per person.
// Presentational: it places the events it is given. ResourceCalendar (resource-view) loads them
// for a view's visible window; Studio's calendar draws its month with it too.

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, dayIn, deviceTimeZone, eachDay, weekdayOf, type Day } from "@marktiderman/genesis-core/dates";
import { Button } from "../../ui/button";
import { cn } from "../../../utils";
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
    const time = f({ hour: "numeric", minute: "2-digit" }, zone);
    return {
      weekday: (d: Day) => weekday.format(utc(d)),
      longDay: (d: Day) => longDay.format(utc(d)),
      month: (d: Day) => month.format(utc(d)),
      short: (d: Day) => short.format(utc(d)),
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
 * grid: arrow keys move between them, Home and End go to the week's ends, and Tab reaches the
 * events.
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
  className,
  testID = "event-calendar",
}: EventCalendarProps<T>) {
  const m = useUiMessages().calendar;
  const zone = timeZone ?? deviceTimeZone();
  const today = dayIn(zone);
  const [ownAnchor, setOwnAnchor] = useState<Day>(anchorProp ?? today);
  const anchor = onAnchorChange ? (anchorProp ?? today) : ownAnchor;
  const setAnchor = (d: Day) => (onAnchorChange ? onAnchorChange(d) : setOwnAnchor(d));
  const range = calendarWindow(layout, anchor, { weeks, weekStartsOn });
  const days = eachDay(range);
  const placed = useMemo(() => placeEvents(events, range, zone), [events, range.start, range.end, zone]); // eslint-disable-line react-hooks/exhaustive-deps
  const lanes = useMemo(() => calendarLanes(events, laneDefs), [events, laneDefs]);
  const fmt = useFormats(locale, zone);

  const title =
    layout === "month" ? fmt.month(anchor) : `${fmt.short(range.start)} – ${fmt.short(addDays(range.end, -1))}`;
  const monthOf = anchor.slice(0, 7);

  const item = (p: PlacedEvent<T>, compact: boolean) => (
    <EventItem
      key={`${p.event.key}@${p.day}`}
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
    <div className={cn("space-y-2", className)} data-testid={testID} data-layout={layout}>
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
          nothing={m.nothing}
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
          weekday={fmt.weekday}
          item={(p) => item(p, true)}
          testID={testID}
        />
      ) : (
        <DayGrid
          days={days}
          placed={placed}
          today={today}
          monthOf={layout === "month" ? monthOf : undefined}
          label={`${label ?? ""}${label ? ", " : ""}${title}`}
          weekday={fmt.weekday}
          longDay={fmt.longDay}
          tall={layout === "weeks" && weeks <= 2}
          item={(p) => item(p, true)}
          testID={testID}
        />
      )}
    </div>
  );
}

interface EventItemProps<T> {
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

function EventItem<T>({ placed, lanes, compact, time, allDayLabel, continuedLabel, withLabel, onSelect, testID }: EventItemProps<T>) {
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
    <li data-event={event.key}>
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

/** Arrow keys between day cells: one roving tab stop for the grid, the events still in tab order. */
function useDayFocus(days: readonly Day[], today: Day, perRow: number) {
  const [focusDay, setFocusDay] = useState<Day | null>(null);
  const refs = useRef(new Map<Day, HTMLElement>());
  const active = focusDay && days.includes(focusDay) ? focusDay : days.includes(today) ? today : days[0];
  const onKeyDown = (e: KeyboardEvent<HTMLElement>, day: Day) => {
    if (e.target !== e.currentTarget) return;
    const i = days.indexOf(day);
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
    const next = days[i + by];
    if (!next) return;
    e.preventDefault();
    setFocusDay(next);
    refs.current.get(next)?.focus();
  };
  const cellProps = (day: Day) => ({
    ref: (el: HTMLElement | null) => {
      if (el) refs.current.set(day, el);
      else refs.current.delete(day);
    },
    tabIndex: day === active ? 0 : -1,
    onFocus: (e: { target: EventTarget; currentTarget: EventTarget }) => {
      if (e.target === e.currentTarget) setFocusDay(day);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKeyDown(e, day),
  });
  return cellProps;
}

interface GridProps<T> {
  days: Day[];
  placed: Map<Day, PlacedEvent<T>[]>;
  today: Day;
  /** `YYYY-MM` for a month grid: days outside it are dimmed. */
  monthOf: string | undefined;
  label: string;
  weekday: (d: Day) => string;
  longDay: (d: Day) => string;
  tall: boolean;
  item: (p: PlacedEvent<T>) => ReactNode;
  testID: string;
}

function DayGrid<T>({ days, placed, today, monthOf, label, weekday, longDay, tall, item, testID }: GridProps<T>) {
  const cellProps = useDayFocus(days, today, 7);
  const weeks = Array.from({ length: days.length / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7));
  return (
    <div className="overflow-x-auto">
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
                    aria-label={longDay(day)}
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
                      {list.length > 0 && <ul className={cn("space-y-0.5 overflow-y-auto", tall ? "max-h-36" : "max-h-24")}>{list.map(item)}</ul>}
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
  weekday: (d: Day) => string;
  item: (p: PlacedEvent<T>) => ReactNode;
  testID: string;
}

function Lanes<T>({ days, placed, lanes, today, label, laneHeader, weekday, item, testID }: LanesProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: `${8 + days.length * 6}rem` }} aria-label={label}>
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
            <tr key={lane.key} data-lane={lane.key} data-testid={`${testID}-lane`}>
              <th scope="row" className="border px-2 py-1 text-left align-top text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  {lane.color && <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: lane.color }} aria-hidden />}
                  {lane.label}
                </span>
              </th>
              {days.map((day) => {
                const list = (placed.get(day) ?? []).filter((p) => p.event.lanes?.includes(lane.key));
                return (
                  <td key={day} className="h-16 border p-1 align-top" data-day={day}>
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
    return <p className="py-6 text-center text-sm text-muted-foreground">{nothing}</p>;
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
            {list.length ? <ul className="space-y-0.5">{list.map(item)}</ul> : <p className="text-sm text-muted-foreground">{nothing}</p>}
          </li>
        );
      })}
    </ol>
  );
}
