// A month grid picker's days, on genesis-core's calendar days (`Day`, "2026-06-03"): the phone's
// NativeCalendar draws these weeks, and they are the same weeks a view's calendar mode lays out.

import { addDays, eachDay, monthGridRange, startOfMonth, type Day } from "../dates";

/** A Date's calendar day on the device's clock (a picker's dates are the person's own days). */
export function dayOfDate(date: Date): Day {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** A calendar day as a Date at local midnight. */
export function dateOfDay(day: Day): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** The weeks a month's grid shows (whole weeks, from `weekStartsOn`, 0 Sunday to 6 Saturday). */
export function monthWeeks(month: Day, weekStartsOn = 0): Day[][] {
  const days = eachDay(monthGridRange(startOfMonth(month), weekStartsOn));
  const weeks: Day[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** Whether `day` is inside a range, both ends included (an open end takes nothing past the other). */
export function dayInRange(day: Day, range: { from?: Day | undefined; to?: Day | undefined }): boolean {
  if (!range.from) return false;
  const to = range.to ?? range.from;
  return day >= range.from && day <= to;
}

/** A range after picking `day`: a new start, or the end once the start is set (swapped if earlier). */
export function pickRangeDay(range: { from?: Day | undefined; to?: Day | undefined } | undefined, day: Day): { from: Day; to?: Day } {
  if (!range?.from || range.to) return { from: day };
  return day < range.from ? { from: day, to: range.from } : { from: range.from, to: day };
}

/** The seven weekday dates of a week starting `weekStartsOn`, for the grid's header. */
export function weekdayDays(weekStartsOn = 0): Day[] {
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => addDays("2023-01-01", (weekStartsOn + i) % 7));
}
