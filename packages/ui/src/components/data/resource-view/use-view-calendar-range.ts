"use client";

// A calendar's data lives in core (useViewCalendarRange), shared by the web's calendar, a custom
// view and the phone's calendar.
export {
  CALENDAR_LIMIT,
  useViewCalendarRange,
  type UseViewCalendarRangeOptions,
  type ViewCalendarRange,
  type ViewCalendarRangeState,
} from "@marktiderman/genesis-core/hooks";
export { displayZone } from "@marktiderman/genesis-core/resource-view";
