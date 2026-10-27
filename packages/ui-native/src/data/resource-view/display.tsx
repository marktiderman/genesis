// How a view's display hints draw on native. The same shape as genesis-ui's web renderers
// (`DisplayRenderers`, `DisplayRenderersProvider`, `useDisplayCell`): a view says
// `status: { display: "badge" }` and never imports a component, and an app replaces any hint with
// DisplayRenderersProvider. Links and images go through core's `isSafeUrl`; a calendar day is
// formatted from its parts, never `new Date(day)`. Rows show only `summary(row)`; these draw the
// peek and read-only form values.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Linking, Text } from "react-native";
import { titleCase } from "@marktiderman/genesis-core";
import { isTimeZone, personTimeZone, wallClock } from "@marktiderman/genesis-core/dates";
import { useViewer } from "@marktiderman/genesis-core/hooks";
import { isSafeUrl } from "@marktiderman/genesis-core/urls";
import { valueText, type DisplayHint, type ResolvedColumn, type ViewTone } from "@marktiderman/genesis-core/resource-view";
import { NativeBadge } from "../../components/badge";
import { NativeImage } from "../../components/image";
import { NativeText } from "../../components/text";
import { defaultNativeResourceViewMessages, type NativeResourceViewMessages } from "./messages";

/** The clocks a timestamp can be read on: the viewer's and the practice's (IANA names). */
export interface DisplayTimeZones {
  viewer: string;
  practice: string;
}

/** What a renderer gets besides the value (as on the web, with native's messages and clocks). */
export interface DisplayContext {
  row: Record<string, unknown>;
  column: ResolvedColumn<Record<string, unknown>>;
  messages: NativeResourceViewMessages;
  zones: DisplayTimeZones;
}

export type DisplayRenderer = (value: unknown, context: DisplayContext) => ReactNode;
export type DisplayRenderers = Readonly<Record<DisplayHint, DisplayRenderer>>;

export const isEmptyValue = (value: unknown) => value === null || value === undefined || value === "";

const NUMBER = new Intl.NumberFormat();
const DECIMAL = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PERCENT = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
const DAY = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function numeric(value: unknown, format: Intl.NumberFormat): string {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? format.format(n) : String(value);
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A `YYYY-MM-DD` day as a local Date at midnight, from its parts (the picker's value). Null when it isn't a day. */
export function dayToDate(value: unknown): Date | null {
  const day = typeof value === "string" ? DAY_PATTERN.exec(value) : null;
  if (!day) return null;
  return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
}

/** A picked Date back to the `YYYY-MM-DD` day it shows, from its local parts (never `toISOString`). */
export function dateToDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A calendar day, the same day on every clock. */
/**
 * A day. A calendar day (`YYYY-MM-DD`) from its parts; a timestamp as the day it is on `zone`'s
 * clock (core's `wallClock`), so an 8pm edit in New York isn't tomorrow's (its UTC day).
 */
export function formatDay(value: unknown, zone: string = personTimeZone()): string {
  const date = dayToDate(value);
  if (date) return DAY.format(date);
  const text = String(value);
  const at = /^\d{4}-\d{2}-\d{2}[T ]/.test(text) ? new Date(text) : null;
  if (!at || Number.isNaN(at.getTime()) || !isTimeZone(zone)) return text;
  const wall = wallClock(zone, at);
  return DAY.format(new Date(wall.year, wall.month - 1, wall.day));
}

/** A column's clock: "viewer" (the default) and "practice" from `zones`, else a valid IANA name. */
export function resolveZone(zone: string | undefined, zones: DisplayTimeZones): string {
  if (!zone || zone === "viewer") return zones.viewer;
  if (zone === "practice") return zones.practice;
  return isTimeZone(zone) ? zone : zones.viewer;
}

// The wall clock's parts are drawn as UTC, so one formatter serves every zone.
const WALL = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** A timestamp as the clock on the wall in `zone` shows it (core's `wallClock`), not the device's. */
export function formatInstant(value: unknown, zone: string): string {
  const at = new Date(String(value));
  if (Number.isNaN(at.getTime()) || !isTimeZone(zone)) return String(value);
  const wall = wallClock(zone, at);
  return WALL.format(new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)));
}

/** A link a row may open: http(s), mailto or tel that passes `isSafeUrl`. Root-relative paths mean nothing on a phone. */
export function openableUrl(value: unknown): string | null {
  if (!isSafeUrl(value)) return null;
  const url = value.trim();
  return /^(https?:|mailto:|tel:)/i.test(url) ? url : null;
}

/**
 * One value as plain text, for the places that take a string (a row's subtitle, a section title,
 * a read-only form row). Renderers use the same words.
 */
export function displayText(
  hint: DisplayHint,
  value: unknown,
  messages: NativeResourceViewMessages,
  /** The resolved IANA zone a timestamp is read on (`resolveZone`). Default: the device's. */
  timeZone: string = personTimeZone(),
): string {
  if (isEmptyValue(value)) return messages.common.empty;
  switch (hint) {
    case "number":
      return numeric(value, NUMBER);
    case "currency":
      return numeric(value, DECIMAL);
    case "percent":
      return numeric(value, PERCENT);
    case "boolean":
      return value === true || value === "true" ? messages.common.yes : messages.common.no;
    case "badge":
      return titleCase(String(value));
    case "date":
      return formatDay(value, timeZone);
    case "datetime":
      return formatInstant(value, timeZone);
    case "url": {
      const url = openableUrl(value);
      return url ? url.replace(/^https?:\/\//i, "") : String(value);
    }
    case "json":
      return typeof value === "string" ? value : JSON.stringify(value);
    default:
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

const BADGE_VARIANT: Record<ViewTone, "success" | "warning" | "destructive" | "info" | "muted"> = {
  success: "success",
  warning: "warning",
  danger: "destructive",
  info: "info",
  muted: "muted",
};

/** A chip's tone as a NativeBadge variant. */
export function badgeVariant(tone: ViewTone | undefined) {
  return BADGE_VARIANT[tone ?? "muted"];
}

function LinkText({ url, label }: { url: string; label: string }) {
  return (
    <Text
      accessibilityRole="link"
      className="text-base text-primary underline"
      onPress={() => void Linking.openURL(url)}
    >
      {label}
    </Text>
  );
}

const text = (hint: DisplayHint): DisplayRenderer => (value, { messages, column, zones }) => (
  <NativeText preset="body">{displayText(hint, value, messages, resolveZone(column.timeZone, zones))}</NativeText>
);

/** Genesis's native renderers. Every one shows text it can't draw, never a broken row. */
export const nativeDisplayRenderers: DisplayRenderers = {
  text: text("text"),
  longText: (value) => (
    <NativeText preset="body" numberOfLines={3}>
      {String(value)}
    </NativeText>
  ),
  number: text("number"),
  currency: text("currency"),
  percent: text("percent"),
  boolean: text("boolean"),
  badge: (value, { column }) => (
    <NativeBadge variant={badgeVariant(column.tones?.[String(value)])}>{valueText(column.labels, value)}</NativeBadge>
  ),
  date: text("date"),
  datetime: text("datetime"),
  // The linked row's id until relation labels arrive (batched per page, never per row).
  relation: text("relation"),
  url: (value, { messages }) => {
    const url = openableUrl(value);
    return url && /^https?:/i.test(url) ? (
      <LinkText url={url} label={displayText("url", value, messages)} />
    ) : (
      <NativeText preset="body">{String(value)}</NativeText>
    );
  },
  email: (value) => {
    const address = String(value).trim();
    // A plain address only: no `?subject=` or `&body=` riding along in the mailto link.
    const url = /^[^\s@?&#/]+@[^\s@?&#/]+$/.test(address) ? openableUrl(`mailto:${address}`) : null;
    return url ? <LinkText url={url} label={address} /> : <NativeText preset="body">{address}</NativeText>;
  },
  image: (value) => {
    const url = openableUrl(value);
    return url && /^https?:/i.test(url) ? (
      <NativeImage src={url} width={64} height={64} className="rounded-md" />
    ) : (
      <NativeText preset="body">{String(value)}</NativeText>
    );
  },
  json: (value) => (
    <NativeText preset="caption" numberOfLines={2}>
      {typeof value === "string" ? value : JSON.stringify(value)}
    </NativeText>
  ),
};

const DisplayRenderersContext = createContext<DisplayRenderers>(nativeDisplayRenderers);
const MessagesContext = createContext<NativeResourceViewMessages>(defaultNativeResourceViewMessages);
const TimeZonesContext = createContext<DisplayTimeZones | null>(null);

/** The clocks timestamps are read on below. NativeResourceView sets it from ViewerScope. */
export const DisplayTimeZonesProvider = TimeZonesContext.Provider;

/** The clocks for timestamps: the nearest provider's, else the device's for both. */
export function useDisplayTimeZones(): DisplayTimeZones {
  const zones = useContext(TimeZonesContext);
  return useMemo(() => zones ?? { viewer: personTimeZone(), practice: personTimeZone() }, [zones]);
}

/** Replace some of the renderers for everything below (nested providers build on each other). */
export function DisplayRenderersProvider({
  renderers,
  children,
}: {
  renderers: Partial<Record<DisplayHint, DisplayRenderer>>;
  children: ReactNode;
}) {
  const parent = useContext(DisplayRenderersContext);
  const value = useMemo(() => ({ ...parent, ...renderers }), [parent, renderers]);
  return <DisplayRenderersContext.Provider value={value}>{children}</DisplayRenderersContext.Provider>;
}

/** The words NativeResourceView shows, for everything below. Pass a stable object. */
export const NativeResourceViewMessagesProvider = MessagesContext.Provider;

export function useNativeResourceViewMessages(): NativeResourceViewMessages {
  return useContext(MessagesContext);
}

/** Draw one value: the empty mark for no value or a value the row (or viewer) hides (`when`), else its hint's renderer. */
export function useDisplayCell(): (column: ResolvedColumn<Record<string, unknown>>, row: Record<string, unknown>) => ReactNode {
  const renderers = useContext(DisplayRenderersContext);
  const messages = useNativeResourceViewMessages();
  const zones = useDisplayTimeZones();
  // `when` reads the viewer too: a new viewer or new roles redraws the cells.
  const viewer = useViewer();
  return useMemo(
    () => (column, row) => {
      if (column.when && !column.when(row, viewer)) return <NativeText preset="body">{messages.common.empty}</NativeText>;
      const value = column.value(row);
      if (isEmptyValue(value)) return <NativeText preset="body">{messages.common.empty}</NativeText>;
      return renderers[column.display](value, { row, column, messages, zones });
    },
    [renderers, messages, zones, viewer],
  );
}
