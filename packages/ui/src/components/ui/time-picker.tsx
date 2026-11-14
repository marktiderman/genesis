"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { formatTimeOfDay, parseTimeOfDay, timeOfDate, timeSlots, timeToValue, withTimeOfDay, type TimeOfDay } from "@marktiderman/genesis-core/headless";
import { cn } from "../../utils";
import { useHydrated } from "../../hooks/use-mobile";
import { Button } from "./button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface TimePickerBaseProps {
  /** Minutes between the listed times. Default 15. */
  minuteStep?: number;
  /**
   * 12-hour times ("2:30 PM"). Default: the viewer's locale's preference, read after the page
   * has hydrated (24-hour until then), so a server's locale never decides it. Pass it to render
   * the viewer's form from the first paint.
   */
  hour12?: boolean;
  /** The trigger's words with no time chosen (an empty string value). Default "Pick a time". */
  placeholder?: string;
  disabled?: boolean;
  /**
   * The trigger's name, followed by the time ("Starts, 2:30 PM"). Leave it out when a visible
   * `<label htmlFor={id}>` names the trigger: the label's words and the time are its name then
   * (through `aria-labelledby`). With neither, the name is "Pick a time" and the time.
   */
  "aria-label"?: string;
  /** The id of an element that names the trigger; the time is added after it. */
  "aria-labelledby"?: string;
  id?: string;
  className?: string;
  testID?: string;
}

/** A time on a day: the day is kept, and its time of day is picked. */
export interface TimePickerDateProps extends TimePickerBaseProps {
  value: Date;
  onChange: (next: Date) => void;
  /**
   * The trigger's words. Default the time, in 12 or 24 hours. With `timeZone` it also runs on the
   * server, so format on that same zone (`Intl.DateTimeFormat(…, { timeZone })`), or the server's
   * words and the browser's differ.
   */
  formatLabel?: (date: Date) => string;
  /**
   * The zone whose clock the time is read and picked on (an IANA name, "Europe/Paris"). Default
   * the browser's. Without it the trigger shows no time until the page has hydrated, so a
   * server's zone never decides it; pass it to render the time from the server too. A pick keeps
   * the value's calendar day on this clock, daylight-saving days included (see the README).
   */
  timeZone?: string;
}

/**
 * A time of day alone, as `<input type="time">` holds it: "HH:MM" (24-hour, "09:30"), or "" for
 * none chosen. It has no day, so no date or daylight saving comes into it.
 */
export interface TimePickerStringProps extends TimePickerBaseProps {
  value: string;
  onChange: (next: string) => void;
  /** The trigger's words. Default the time, in 12 or 24 hours. */
  formatLabel?: (time: string) => string;
}

export type TimePickerProps = TimePickerDateProps | TimePickerStringProps;

function prefers12Hour(): boolean {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 ?? false;
  } catch {
    return false;
  }
}

function isStringProps(props: TimePickerProps): props is TimePickerStringProps {
  return typeof props.value === "string";
}

/** `date`'s time of day on `timeZone`'s clock. */
function zonedTimeOf(date: Date, timeZone: string): TimeOfDay {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const read = (type: "hour" | "minute") => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hours: read("hour") % 24, minutes: read("minute") };
}

const MINUTE = 60_000;

/** How far `timeZone`'s clock is ahead of UTC at `at` (ms since the epoch), in minutes. */
function zoneOffsetMinutes(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour") % 24, read("minute"), read("second"));
  return Math.round((wall - Math.floor(at / 1000) * 1000) / MINUTE);
}

/** `date`'s calendar day on `timeZone`'s clock. */
function zonedDayOf(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day") };
}

/**
 * `date` moved to `time` on its own calendar day on `timeZone`'s clock (seconds cleared). The
 * instant is worked out from the zone's real UTC offset at that wall time, so a pick on a
 * daylight-saving day stays on that day. Where the wall time happens twice (the hour repeated
 * when clocks go back) it is the first, earlier one; where it doesn't happen at all (the hour
 * skipped when clocks go forward) it moves forward by the gap, so 02:30 on a day New York skips
 * 02:00 to 03:00 is 03:30. Both are what Temporal's `"compatible"` disambiguation and most date
 * libraries do.
 */
function withZonedTime(date: Date, timeZone: string, time: TimeOfDay): Date {
  const { year, month, day } = zonedDayOf(date, timeZone);
  // The wall time as if it were UTC; each candidate subtracts an offset the zone has near it.
  const wall = Date.UTC(year, month - 1, day, time.hours, time.minutes);
  const before = zoneOffsetMinutes(wall - 24 * 60 * MINUTE, timeZone);
  const after = zoneOffsetMinutes(wall + 24 * 60 * MINUTE, timeZone);
  const fits = (at: number) => zoneOffsetMinutes(at, timeZone) === Math.round((wall - at) / MINUTE);
  const valid = [wall - before * MINUTE, wall - after * MINUTE].filter(fits);
  // Repeated: the earlier. Skipped: neither fits, and the offset from before the change moves it forward.
  const at = valid.length > 0 ? Math.min(...valid) : wall - before * MINUTE;
  return new Date(at);
}

const same = (a: TimeOfDay, b: TimeOfDay | null) => b !== null && a.hours === b.hours && a.minutes === b.minutes;

/**
 * TimePicker — a time of day, picked from a list or typed: the twin of genesis-ui-native's
 * NativeTimePicker. Its `value` is a `Date` (the day is kept, as NativeTimePicker's) or an
 * "HH:MM" string (a time of day alone, as `<input type="time">` holds it), and `onChange` gives
 * back the same kind. The list steps by `minuteStep`; typing "2:30 pm", "14:30" or "1430" puts
 * that time first in the list, highlighted, so Enter picks the time that is highlighted. Reading
 * and writing times is genesis-core's (`parseTimeOfDay`, `formatTimeOfDay`, `timeSlots`), as on
 * the phone.
 *
 * A `Date` is read on the browser's clock once the page has hydrated, or on `timeZone`'s from the
 * first render. The trigger's name is its visible label (`<label htmlFor={id}>`), or `aria-label`,
 * followed by the time.
 *
 * Built from Command in a Popover, like Combobox: the search box is the combobox, arrow keys move
 * through the times, and Enter picks the highlighted one.
 *
 * @stability Beta
 */
export function TimePicker(props: TimePickerProps) {
  const { minuteStep = 15, hour12: hour12Prop, placeholder = "Pick a time", disabled, id, className, testID = "time-picker" } = props;
  const hydrated = useHydrated();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState("");
  const hour12 = hour12Prop ?? (hydrated ? prefers12Hour() : false);
  const timeZone = isStringProps(props) ? undefined : props.timeZone;
  // A Date's time of day depends on the clock it is read on: the browser's, known once hydrated,
  // or the zone given. Until then the trigger shows no time, so the server's HTML and the first
  // render agree.
  const pending = !isStringProps(props) && !timeZone && !hydrated;

  const current: TimeOfDay | null = isStringProps(props)
    ? parseTimeOfDay(props.value)
    : pending
      ? null
      : timeZone
        ? zonedTimeOf(props.value, timeZone)
        : timeOfDate(props.value);
  const custom = pending ? undefined : isStringProps(props) ? props.formatLabel?.(props.value) : props.formatLabel?.(props.value);
  const label = pending ? "" : (custom ?? (current ? formatTimeOfDay(current, { hour12 }) : placeholder));

  // The trigger's name: the visible label that points at it (or the one named) and then the time.
  const timeId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  // The ids of the visible labels that name the trigger: a `<label htmlFor>`, or a `<label>` around
  // it. A wrapping label's own copy of the time is skipped when its words are read (it is the
  // control being named), so the time is said once, from the time's span.
  const [labelling, setLabelling] = React.useState<string | null>(null);
  const ariaLabel = props["aria-label"];
  const ariaLabelledBy = props["aria-labelledby"];
  // Every render, so a label that mounts after the picker is found; the state only changes when it does.
  React.useEffect(() => {
    const trigger = triggerRef.current;
    let next: string | null = null;
    if (!ariaLabel && !ariaLabelledBy && trigger?.labels && trigger.labels.length > 0) {
      next = Array.from(trigger.labels)
        .map((el, i) => {
          if (!el.id) el.id = `${timeId}-label-${i}`;
          return el.id;
        })
        .join(" ");
    }
    setLabelling((prev) => (prev === next ? prev : next));
  });
  const named = ariaLabelledBy ?? labelling;
  // The time as it is said: none while pending or with no time chosen (the placeholder isn't one).
  const spoken = current || custom !== undefined ? label : "";
  const nameProps = ariaLabel
    ? { "aria-label": spoken ? `${ariaLabel}, ${spoken}` : ariaLabel }
    : named
      ? { "aria-labelledby": `${named} ${timeId}` }
      : { "aria-label": spoken ? `Pick a time, ${spoken}` : "Pick a time" };

  const typed = parseTimeOfDay(query);
  const slots = React.useMemo(() => timeSlots(minuteStep), [minuteStep]);
  // A typed time comes first, then the listed times without it; words that aren't a time narrow
  // the list instead. cmdk highlights the first item when the search changes, so what is
  // highlighted is what Enter picks.
  const shown = typed
    ? [typed, ...slots.filter((t) => !same(t, typed))]
    : query
      ? slots.filter((t) => formatTimeOfDay(t, { hour12 }).toLowerCase().includes(query.toLowerCase()))
      : slots;

  const pick = (t: TimeOfDay) => {
    if (isStringProps(props)) props.onChange(timeToValue(t));
    else if (props.timeZone) props.onChange(withZonedTime(props.value, props.timeZone, t));
    else props.onChange(withTimeOfDay(props.value, t));
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
        // The list opens on the chosen time.
        if (next) setActive(current ? timeToValue(current) : "");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          id={id}
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-haspopup="listbox"
          {...nameProps}
          disabled={disabled}
          testID={`${testID}-trigger`}
          className={cn("justify-start gap-2 font-normal tabular-nums", !current && "text-muted-foreground", className)}
        >
          <Clock className="size-4 opacity-60" aria-hidden />
          <span id={timeId}>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <Command shouldFilter={false} value={active} onValueChange={setActive}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={hour12 ? "2:30 PM" : "14:30"} aria-label="Type a time" data-testid={`${testID}-search`} />
          <CommandList>
            <CommandEmpty>Not a time</CommandEmpty>
            <CommandGroup>
              {shown.map((t) => {
                const v = timeToValue(t);
                return (
                  <CommandItem key={v} value={v} onSelect={() => pick(t)} data-testid={same(t, typed) && !slots.some((s) => same(s, typed)) ? `${testID}-typed` : `${testID}-option-${v}`}>
                    {formatTimeOfDay(t, { hour12 })}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
