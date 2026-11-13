"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { formatTimeOfDay, parseTimeOfDay, timeOfDate, timeSlots, timeToValue, withTimeOfDay } from "@marktiderman/genesis-core/headless";
import { cn } from "../../utils";
import { Button } from "./button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface TimePickerProps {
  /** The date whose time of day is picked; the day itself is kept. */
  value: Date;
  onChange: (next: Date) => void;
  /** Minutes between the listed times. Default 15. */
  minuteStep?: number;
  /** 12-hour times ("2:30 PM"). Default: the locale's preference. */
  hour12?: boolean;
  /** The trigger's words. Default the time, in 12 or 24 hours. */
  formatLabel?: (date: Date) => string;
  disabled?: boolean;
  /** The trigger's accessible name when no visible label points at it. Default "Pick a time". */
  "aria-label"?: string;
  id?: string;
  className?: string;
  testID?: string;
}

function prefers12Hour(): boolean {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 ?? false;
  } catch {
    return false;
  }
}

/**
 * TimePicker — a time of day, picked from a list or typed: the twin of genesis-ui-native's
 * NativeTimePicker, with the same `value: Date` and `onChange(Date)`. The list steps by
 * `minuteStep`; typing "2:30 pm", "14:30" or "1430" and pressing Enter picks that time. Reading and
 * writing times is genesis-core's (`parseTimeOfDay`, `formatTimeOfDay`, `timeSlots`), as on the phone.
 *
 * Built from Command in a Popover, like Combobox: the search box is the combobox, arrow keys move
 * through the times.
 *
 * @stability Beta
 */
export function TimePicker({
  value,
  onChange,
  minuteStep = 15,
  hour12: hour12Prop,
  formatLabel,
  disabled,
  id,
  className,
  testID = "time-picker",
  ...aria
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const hour12 = hour12Prop ?? prefers12Hour();
  const current = timeOfDate(value);
  const label = formatLabel ? formatLabel(value) : formatTimeOfDay(current, { hour12 });
  const typed = parseTimeOfDay(query);
  const slots = React.useMemo(() => timeSlots(minuteStep), [minuteStep]);
  const shown = query && !typed ? slots.filter((t) => formatTimeOfDay(t, { hour12 }).toLowerCase().includes(query.toLowerCase())) : slots;
  const pick = (t: { hours: number; minutes: number }) => {
    onChange(withTimeOfDay(value, t));
    setOpen(false);
    setQuery("");
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={aria["aria-label"] ? `${aria["aria-label"]}, ${label}` : `Pick a time, ${label}`}
          disabled={disabled}
          testID={`${testID}-trigger`}
          className={cn("justify-start gap-2 font-normal tabular-nums", className)}
        >
          <Clock className="size-4 opacity-60" aria-hidden />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <Command shouldFilter={false} value={typed ? timeToValue(typed) : timeToValue(current)}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={hour12 ? "2:30 PM" : "14:30"}
            aria-label="Type a time"
            data-testid={`${testID}-search`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typed) {
                e.preventDefault();
                pick(typed);
              }
            }}
          />
          <CommandList>
            <CommandEmpty>{typed ? formatTimeOfDay(typed, { hour12 }) : "Not a time"}</CommandEmpty>
            <CommandGroup>
              {typed && !shown.some((t) => t.hours === typed.hours && t.minutes === typed.minutes) ? (
                <CommandItem value={timeToValue(typed)} onSelect={() => pick(typed)} data-testid={`${testID}-typed`}>
                  {formatTimeOfDay(typed, { hour12 })}
                </CommandItem>
              ) : null}
              {shown.map((t) => (
                <CommandItem key={timeToValue(t)} value={timeToValue(t)} onSelect={() => pick(t)} data-testid={`${testID}-option-${timeToValue(t)}`}>
                  {formatTimeOfDay(t, { hour12 })}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
