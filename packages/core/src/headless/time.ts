// A time of day as a picker holds it: the web's TimePicker and the phone's NativeTimePicker read
// and write it through these, so "2:30 pm", "14:30" and "1430" mean the same on both.

/** A time of day: hours 0-23, minutes 0-59. */
export interface TimeOfDay {
  hours: number;
  minutes: number;
}

/**
 * A time as typed: "14:30", "2:30 pm", "2pm", "1430", "9.05". `null` when it isn't one, so the
 * field keeps its last good value.
 */
export function parseTimeOfDay(text: string): TimeOfDay | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  const m = t.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.[0];
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hours > 23) return null;
  return { hours, minutes };
}

/** "14:30" (24-hour, the stored form and an `<input type="time">`'s value). */
export function timeToValue(time: TimeOfDay): string {
  return `${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}`;
}

/** A time shown to a person: "2:30 PM" with `hour12`, else "14:30". */
export function formatTimeOfDay(time: TimeOfDay, options: { hour12?: boolean | undefined } = {}): string {
  if (!options.hour12) return timeToValue(time);
  const suffix = time.hours < 12 ? "AM" : "PM";
  const h = time.hours % 12 === 0 ? 12 : time.hours % 12;
  return `${h}:${String(time.minutes).padStart(2, "0")} ${suffix}`;
}

/** The time of day a Date holds, on the device's clock. */
export function timeOfDate(date: Date): TimeOfDay {
  return { hours: date.getHours(), minutes: date.getMinutes() };
}

/** `date` with its time of day set (seconds cleared), on the device's clock. */
export function withTimeOfDay(date: Date, time: TimeOfDay): Date {
  const next = new Date(date);
  next.setHours(time.hours, time.minutes, 0, 0);
  return next;
}

/** Every time from 00:00 in steps of `minutes` (default 30), for a picker's list. */
export function timeSlots(minutes = 30): TimeOfDay[] {
  const out: TimeOfDay[] = [];
  const step = Math.max(1, Math.floor(minutes));
  for (let m = 0; m < 24 * 60; m += step) out.push({ hours: Math.floor(m / 60), minutes: m % 60 });
  return out;
}
