/**
 * Calendar — a month grid to pick a day, several days or a range: the twin of genesis-ui's
 * Calendar (react-day-picker on the web), with the same `mode`, `selected` and `onSelect`.
 *
 * Its weeks come from genesis-core (`monthWeeks`, on calendar days), the same weeks a view's
 * calendar mode lays out. For one date in a form field, NativeDatePicker (the system picker) is
 * usually the better fit; use the grid when the month itself is the point (booking, a streak).
 *
 * Every day is a button a screen reader names in full ("Wednesday, 3 June 2026"), with its
 * selected and disabled state; the previous and next month buttons are named too.
 *
 * @stability Beta
 */
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { addMonths, startOfMonth, type Day } from "@marktiderman/genesis-core/dates";
import { dateOfDay, dayInRange, dayOfDate, monthWeeks, pickRangeDay, weekdayDays } from "@marktiderman/genesis-core/headless";
import { cn } from "../utils";

/** A picked range, as react-day-picker's `DateRange`. */
export interface NativeCalendarRange {
  from: Date | undefined;
  to?: Date | undefined;
}

interface BaseProps {
  /** The month shown, to control it. */
  month?: Date;
  /** The month shown first, uncontrolled. Default the selection's, else today's. */
  defaultMonth?: Date;
  onMonthChange?: (month: Date) => void;
  /** Days that can't be picked. */
  disabled?: (date: Date) => boolean;
  /** 0 Sunday to 6 Saturday. Default 0. */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Draw the days of the months before and after. Default true. */
  showOutsideDays?: boolean;
  /** BCP 47 locale for the month and weekday names. Default the device's. */
  locale?: string;
  /** Labels for the month buttons. */
  labels?: { previousMonth?: string; nextMonth?: string };
  /** Today, for its mark. Default now. */
  today?: Date;
  className?: string;
  testID?: string;
}

export type NativeCalendarProps =
  | (BaseProps & { mode?: "single"; selected?: Date | undefined; onSelect?: (date: Date | undefined) => void })
  | (BaseProps & { mode: "multiple"; selected?: Date[] | undefined; onSelect?: (dates: Date[]) => void })
  | (BaseProps & { mode: "range"; selected?: NativeCalendarRange | undefined; onSelect?: (range: NativeCalendarRange | undefined) => void });

function firstSelected(props: NativeCalendarProps): Date | undefined {
  if (props.mode === "multiple") return props.selected?.[0];
  if (props.mode === "range") return props.selected?.from;
  return props.selected;
}

export function NativeCalendar(props: NativeCalendarProps) {
  const { month: monthProp, defaultMonth, onMonthChange, disabled, weekStartsOn = 0, showOutsideDays = true, locale, labels = {}, today = new Date(), className, testID = "native-calendar" } = props;
  const [monthState, setMonthState] = useState<Day>(() => startOfMonth(dayOfDate(defaultMonth ?? firstSelected(props) ?? today)));
  const month = monthProp ? startOfMonth(dayOfDate(monthProp)) : monthState;
  const weeks = useMemo(() => monthWeeks(month, weekStartsOn), [month, weekStartsOn]);
  const todayDay = dayOfDate(today);
  const monthKey = month.slice(0, 7);

  const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, options);
  const title = fmt({ month: "long", year: "numeric" }).format(dateOfDay(month));
  const weekdayShort = fmt({ weekday: "short" });
  const weekdayLong = fmt({ weekday: "long" });
  const fullDate = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const go = (delta: number) => {
    const next = addMonths(month, delta);
    if (!monthProp) setMonthState(next);
    onMonthChange?.(dateOfDay(next));
  };

  const isSelected = (day: Day): boolean => {
    if (props.mode === "multiple") return (props.selected ?? []).some((d) => dayOfDate(d) === day);
    if (props.mode === "range") {
      const r = props.selected;
      return dayInRange(day, { from: r?.from ? dayOfDate(r.from) : undefined, to: r?.to ? dayOfDate(r.to) : undefined });
    }
    return props.selected ? dayOfDate(props.selected) === day : false;
  };

  const pick = (day: Day) => {
    const date = dateOfDay(day);
    if (props.mode === "multiple") {
      const current = props.selected ?? [];
      const has = current.some((d) => dayOfDate(d) === day);
      props.onSelect?.(has ? current.filter((d) => dayOfDate(d) !== day) : [...current, date]);
    } else if (props.mode === "range") {
      const r = props.selected;
      const next = pickRangeDay(r?.from ? { from: dayOfDate(r.from), to: r.to ? dayOfDate(r.to) : undefined } : undefined, day);
      props.onSelect?.({ from: dateOfDay(next.from), to: next.to ? dateOfDay(next.to) : undefined });
    } else {
      const same = props.selected && dayOfDate(props.selected) === day;
      props.onSelect?.(same ? undefined : date);
    }
    if (day.slice(0, 7) !== monthKey) go(day < month ? -1 : 1);
  };

  return (
    <View testID={testID} className={cn("w-full gap-2 bg-background p-3", className)}>
      <View className="flex-row items-center justify-between">
        <MonthButton testID={`${testID}-previous`} label={labels.previousMonth ?? "Previous month"} glyph="‹" onPress={() => go(-1)} />
        <Text testID={`${testID}-title`} accessibilityRole="header" accessibilityLiveRegion="polite" className="text-sm font-medium text-foreground">
          {title}
        </Text>
        <MonthButton testID={`${testID}-next`} label={labels.nextMonth ?? "Next month"} glyph="›" onPress={() => go(1)} />
      </View>
      <View className="flex-row">
        {weekdayDays(weekStartsOn).map((d) => (
          <Text
            key={d}
            accessibilityLabel={weekdayLong.format(dateOfDay(d))}
            className="flex-1 text-center text-xs text-muted-foreground"
          >
            {weekdayShort.format(dateOfDay(d))}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} className="flex-row">
          {week.map((day) => {
            const outside = day.slice(0, 7) !== monthKey;
            if (outside && !showOutsideDays) return <View key={day} className="h-10 flex-1" />;
            const off = disabled?.(dateOfDay(day)) ?? false;
            const selected = isSelected(day);
            const isToday = day === todayDay;
            return (
              <Pressable
                key={day}
                testID={`${testID}-day-${day}`}
                accessibilityRole="button"
                accessibilityLabel={fullDate.format(dateOfDay(day))}
                accessibilityState={{ selected, disabled: off }}
                disabled={off}
                onPress={() => pick(day)}
                className={cn(
                  "m-0.5 h-10 flex-1 items-center justify-center rounded-md",
                  selected && "bg-primary",
                  !selected && isToday && "bg-accent",
                  off && "opacity-40"
                )}
              >
                <Text
                  className={cn(
                    "text-sm",
                    selected ? "text-primary-foreground" : outside ? "text-muted-foreground" : "text-foreground",
                    isToday && "font-semibold"
                  )}
                >
                  {Number(day.slice(8))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function MonthButton({ label, glyph, onPress, testID }: { label: string; glyph: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      className="h-11 w-11 items-center justify-center rounded-md"
    >
      <Text className="text-xl text-foreground">{glyph}</Text>
    </Pressable>
  );
}
