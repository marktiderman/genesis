// How a view's display hints draw on native. The same shape as genesis-ui's web renderers
// (`DisplayRenderers`, `DisplayRenderersProvider`, `useDisplayCell`): a view says
// `status: { display: "badge" }` and never imports a component, and an app replaces any hint with
// DisplayRenderersProvider. Links and images go through core's `isSafeUrl`; a calendar day is
// formatted from its parts, never `new Date(day)`.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Linking, Text } from "react-native";
import { titleCase } from "@marktiderman/genesis-core";
import { isSafeUrl } from "@marktiderman/genesis-core/urls";
import type { DisplayHint, ResolvedColumn, ViewTone } from "@marktiderman/genesis-core/resource-view";
import { NativeBadge } from "../../components/badge";
import { NativeImage } from "../../components/image";
import { NativeText } from "../../components/text";
import { defaultNativeResourceViewMessages, type NativeResourceViewMessages } from "./messages";

/** What a renderer gets besides the value (as on the web, with native's messages). */
export interface DisplayContext {
  row: Record<string, unknown>;
  column: ResolvedColumn<Record<string, unknown>>;
  messages: NativeResourceViewMessages;
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

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

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
export function formatDay(value: unknown): string {
  const date = dayToDate(value);
  return date ? DAY.format(date) : String(value);
}

export function formatInstant(value: unknown, timeZone?: string): string {
  const at = new Date(String(value));
  if (Number.isNaN(at.getTime())) return String(value);
  const zone = timeZone && timeZone !== "viewer" && timeZone !== "practice" ? timeZone : undefined;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(at);
  } catch {
    // An unknown zone name: the viewer's clock, rather than a broken cell.
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(at);
  }
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
  timeZone?: string,
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
      return formatDay(value);
    case "datetime":
      return formatInstant(value, timeZone);
    case "url": {
      const url = openableUrl(value);
      return url ? url.replace(/^https?:\/\//i, "") : String(value);
    }
    case "json":
      return typeof value === "string" ? value : JSON.stringify(value);
    default:
      return String(value);
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

const text = (hint: DisplayHint): DisplayRenderer => (value, { messages, column }) => (
  <NativeText preset="body">{displayText(hint, value, messages, column.timeZone)}</NativeText>
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
    <NativeBadge variant={badgeVariant(column.tones?.[String(value)])}>{titleCase(String(value))}</NativeBadge>
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
    const url = /^[^\s@]+@[^\s@]+$/.test(address) ? openableUrl(`mailto:${address}`) : null;
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

/** Draw one value: the empty mark for no value or a value the row hides (`when`), else its hint's renderer. */
export function useDisplayCell(): (column: ResolvedColumn<Record<string, unknown>>, row: Record<string, unknown>) => ReactNode {
  const renderers = useContext(DisplayRenderersContext);
  const messages = useNativeResourceViewMessages();
  return useMemo(
    () => (column, row) => {
      if (column.when && !column.when(row)) return <NativeText preset="body">{messages.common.empty}</NativeText>;
      const value = column.value(row);
      if (isEmptyValue(value)) return <NativeText preset="body">{messages.common.empty}</NativeText>;
      return renderers[column.display](value, { row, column, messages });
    },
    [renderers, messages],
  );
}
