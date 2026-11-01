// A calendar's layout and anchor often come from the URL, where anyone can type anything. A bad
// one falls back (month, today) with a warning in development, rather than crashing the screen.

import { isDay, type Day } from "@marktiderman/genesis-core/dates";
import type { CalendarLayout } from "./placement";

// The bundler's NODE_ENV, typed here so the package needs no Node types.
declare const process: { env?: { NODE_ENV?: string } } | undefined;

function isDevelopment(): boolean {
  return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
}

const LAYOUTS: readonly string[] = ["month", "weeks", "agenda", "lanes"];

/** `value` when it's a layout; else `month`, saying so in development. */
export function layoutOr(value: unknown, where: string): CalendarLayout {
  if (value === undefined || LAYOUTS.includes(value as string)) return (value as CalendarLayout | undefined) ?? "month";
  // genesis-allow-console: a development-only hint about a bad URL value; nothing failed.
  if (isDevelopment()) console.warn(`${where}: layout "${String(value)}" isn't month, weeks, agenda or lanes; showing month`);
  return "month";
}

/** `value` when it's a real `YYYY-MM-DD` day; else `today`, saying so in development. */
export function anchorOr(value: unknown, today: Day, where: string): Day {
  if (value === undefined) return today;
  if (isDay(value)) return value;
  // genesis-allow-console: a development-only hint about a bad URL value; nothing failed.
  if (isDevelopment()) console.warn(`${where}: anchor "${String(value)}" isn't a YYYY-MM-DD day; showing today`);
  return today;
}
