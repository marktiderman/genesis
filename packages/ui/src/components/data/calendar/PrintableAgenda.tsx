"use client";

// One printed sheet per lane (a person, a room): the lane's week day by day, then the sections the
// app adds below it (a note, a checklist, anything it renders for that lane). Each sheet starts a
// new page when printed. Presentational, like EventCalendar: it places the events it is given.

import { useMemo, type ReactNode } from "react";
import { Printer } from "lucide-react";
import { addDays, dayIn, deviceTimeZone, eachDay, wallTimeIn, type Day } from "@marktiderman/genesis-core/dates";
import { Button } from "../../ui/button";
import { cn } from "../../../utils";
import { fillMessage, useUiMessages } from "../../../messages";
import { calendarWindow, placeEvents, type CalendarEvent, type CalendarLane, type PlacedEvent } from "./placement";

/** A block printed under a lane's week. @stability Beta */
export interface PrintableSection {
  key: string;
  title: string;
  /** What the lane's sheet shows here. Return null to leave the section off that sheet. */
  render: (lane: CalendarLane) => ReactNode;
}

/** @stability Beta */
export interface PrintableAgendaProps<T = unknown> {
  events: readonly CalendarEvent<T>[];
  /** A day in the week printed (default today). */
  anchor?: Day;
  /** 0 Sunday or 1 Monday (default). */
  weekStartsOn?: 0 | 1;
  /** The clock days are counted on. Default the device's. */
  timeZone?: string;
  /**
   * The sheets, in order: exactly these lanes, each titled by its `label`. Required: a lane's key
   * is an id, never a title for a printed page.
   */
  lanes: readonly CalendarLane[];
  /** The level of each sheet's heading (the lane's name); its days are one below. Default 3. */
  headingLevel?: 2 | 3 | 4 | 5;
  /** Under each lane's week. */
  sections?: readonly PrintableSection[];
  /** The sheets show days with nothing on them too. Default true: a printed week has every day. */
  showEmptyDays?: boolean;
  /** Over each sheet, before the lane's name. */
  title?: ReactNode;
  /** BCP 47 locale for dates and times. Default the runtime's. */
  locale?: string;
  className?: string;
  testID?: string;
}

const utc = (day: Day) => new Date(`${day}T12:00:00Z`);

/**
 * One sheet per lane for the week holding `anchor`, each on its own printed page. On screen the
 * sheets stack, so a page can show them before printing. Events that name no lane are left out:
 * a sheet is someone's.
 *
 * @stability Beta
 */
export function PrintableAgenda<T>({
  events,
  anchor,
  weekStartsOn = 1,
  timeZone,
  lanes,
  headingLevel = 3,
  sections = [],
  showEmptyDays = true,
  title,
  locale,
  className,
  testID = "printable-agenda",
}: PrintableAgendaProps<T>) {
  const m = useUiMessages().calendar;
  const zone = timeZone ?? deviceTimeZone();
  const range = calendarWindow("agenda", anchor ?? dayIn(zone), { weeks: 1, weekStartsOn });
  const days = eachDay(range);
  const sheets = lanes;
  const Heading = `h${headingLevel}` as "h3";
  const DayHeading = `h${headingLevel + 1}` as "h4";
  const fmt = useMemo(() => {
    const day = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
    const short = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: "UTC" });
    const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: zone });
    const zoned = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: zone, timeZoneName: "short" });
    return {
      day: (d: Day) => day.format(utc(d)),
      // The locale's own range form ("November 2 – 8"), not a hard-coded dash.
      range: (a: Day, b: Day) => short.formatRange(utc(a), utc(b)),
      // A time the clock shows twice (the hour repeated when daylight saving ends) carries its
      // zone, so the two 1:30 AMs read differently.
      time: (at: Date) => (repeated(zone, at) ? zoned.format(at) : time.format(at)),
      // A start and end in the locale's own range form ("9:00 – 10:30 AM").
      timeRange: (a: Date, b: Date) => (repeated(zone, a) || repeated(zone, b) ? zoned : time).formatRange(a, b),
    };
  }, [locale, zone]);
  const week = fillMessage(m.weekOf, { date: fmt.range(range.start, addDays(range.end, -1)) });

  return (
    <div className={cn("space-y-8 print:space-y-0", className)} data-testid={testID}>
      {sheets.map((lane) => {
        const placed = placeEvents(
          events.filter((e) => e.lanes?.includes(lane.key)),
          range,
          zone,
        );
        const shown = days.filter((d) => showEmptyDays || (placed.get(d) ?? []).length > 0);
        return (
          <section
            key={lane.key}
            className="rounded-md border p-4 print:break-after-page print:last:break-after-auto print:rounded-none print:border-0 print:p-0 print:text-foreground"
            data-testid={`${testID}-sheet`}
            data-lane={lane.key}
          >
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 print:border-foreground/40">
              <Heading className="text-lg font-semibold">
                {title ? <span className="text-muted-foreground print:text-foreground">{title} · </span> : null}
                {lane.label}
              </Heading>
              <span className="text-sm text-muted-foreground print:text-foreground">{week}</span>
            </header>
            <ol className="divide-y print:divide-foreground/30">
              {shown.map((day) => (
                <li key={day} className="grid gap-1 py-1.5 sm:grid-cols-[10rem_1fr] print:break-inside-avoid" data-day={day}>
                  <DayHeading className="text-sm font-medium">{fmt.day(day)}</DayHeading>
                  <ul className="space-y-0.5 text-sm">
                    {(placed.get(day) ?? []).map((p) => (
                      <SheetItem key={`${p.event.key}-${day}`} placed={p} time={fmt.time} timeRange={fmt.timeRange} allDay={m.allDay} until={m.until} />
                    ))}
                    {!(placed.get(day) ?? []).length && <li className="text-muted-foreground print:text-foreground/60">{m.nothing}</li>}
                  </ul>
                </li>
              ))}
            </ol>
            {sections.map((s) => {
              const body = s.render(lane);
              if (body === null || body === undefined || body === false) return null;
              return (
                <div key={s.key} className="mt-4 break-inside-avoid" data-section={s.key}>
                  <DayHeading className="mb-1 text-sm font-semibold">{s.title}</DayHeading>
                  <div className="text-sm">{body}</div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/** Whether `zone`'s clock shows `at`'s wall time twice (the repeated hour when daylight saving ends). */
function repeated(zone: string, at: Date): boolean {
  const { day, time } = wallTimeIn(zone, at);
  const hour = 3_600_000;
  return [-hour, hour].some((shift) => {
    const other = new Date(at.getTime() + shift);
    const w = wallTimeIn(zone, other);
    return w.day === day && w.time === time;
  });
}

/**
 * One event on a sheet: its start and end ("9:00 – 10:30 AM"), "until 2:00 AM" on the last day
 * of one that began earlier, "All day" when it fills the day.
 */
function SheetItem<T>({
  placed,
  time,
  timeRange,
  allDay,
  until,
}: {
  placed: PlacedEvent<T>;
  time: (at: Date) => string;
  timeRange: (a: Date, b: Date) => string;
  allDay: string;
  until: string;
}) {
  const { event } = placed;
  const start = event.start instanceof Date ? event.start : undefined;
  const end = event.end instanceof Date ? event.end : undefined;
  const when = placed.allDay || !start
    ? allDay
    : placed.continued
      ? end
        ? fillMessage(until, { time: time(end) })
        : allDay
      : end && !placed.continues && end.getTime() > start.getTime()
        ? timeRange(start, end)
        : time(start);
  return (
    <li className="flex gap-2">
      <span className="w-32 shrink-0 tabular-nums text-muted-foreground print:text-foreground">{when}</span>
      <span className="min-w-0">{event.title}</span>
    </li>
  );
}

/** @stability Beta */
export interface PrintButtonProps {
  /** The button's words. Default the catalogue's `calendar.print`. */
  label?: string;
  className?: string;
}

/** Prints the page (the browser's print dialog). Hidden on the printed page itself. @stability Beta */
export function PrintButton({ label, className }: PrintButtonProps) {
  const m = useUiMessages().calendar;
  return (
    <Button type="button" variant="outline" size="sm" className={cn("print:hidden", className)} onClick={() => window.print()} data-testid="print-button">
      <Printer className="mr-1.5 h-4 w-4" aria-hidden />
      {label ?? m.print}
    </Button>
  );
}
