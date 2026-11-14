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
  /** The trigger's accessible name when no visible label points at it. Default "Pick a time". */
  "aria-label"?: string;
  id?: string;
  className?: string;
  testID?: string;
}

/** A time on a day: the day is kept, and its time of day is picked. */
export interface TimePickerDateProps extends TimePickerBaseProps {
  value: Date;
  onChange: (next: Date) => void;
  /** The trigger's words. Default the time, in 12 or 24 hours. */
  formatLabel?: (date: Date) => string;
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

  const current: TimeOfDay | null = typeof props.value === "string" ? parseTimeOfDay(props.value) : timeOfDate(props.value);
  const custom = isStringProps(props)
    ? props.formatLabel?.(props.value)
    : props.formatLabel?.(props.value);
  const label = custom ?? (current ? formatTimeOfDay(current, { hour12 }) : placeholder);

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
          id={id}
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={props["aria-label"] ? `${props["aria-label"]}, ${label}` : `Pick a time, ${label}`}
          disabled={disabled}
          testID={`${testID}-trigger`}
          className={cn("justify-start gap-2 font-normal tabular-nums", !current && "text-muted-foreground", className)}
        >
          <Clock className="size-4 opacity-60" aria-hidden />
          {label}
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
