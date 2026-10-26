// How a view's display hints draw on the web. One renderer per hint, registered once: a view says
// `status: { display: "badge" }` and never imports a component, so native and the extension can
// draw the same view their own way. An app replaces any of them with DisplayRenderersProvider.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { isSafeUrl, titleCase } from "@marktiderman/genesis-core";
import type { DisplayHint, ResolvedColumn } from "@marktiderman/genesis-core/resource-view";
import { useUiMessages, type UiMessages } from "../../../messages";
import { Chip } from "../../resource/chip";

/** What a renderer gets besides the value. */
export interface DisplayContext {
  row: Record<string, unknown>;
  column: ResolvedColumn<Record<string, unknown>>;
  messages: UiMessages;
}

export type DisplayRenderer = (value: unknown, context: DisplayContext) => ReactNode;
export type DisplayRenderers = Readonly<Record<DisplayHint, DisplayRenderer>>;

const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

const NUMBER = new Intl.NumberFormat();
const DECIMAL = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PERCENT = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
const DAY = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function numeric(value: unknown, format: Intl.NumberFormat): string {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? format.format(n) : String(value);
}

/** A calendar day from its parts, so it is the same day on every clock (never `new Date(day)`). */
function formatDay(value: unknown): string {
  const text = String(value);
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!day) return text;
  return DAY.format(new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
}

function formatInstant(value: unknown, timeZone: string | undefined): string {
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

/** Genesis's web renderers. Every one shows text it can't draw, never a broken cell. */
export const webDisplayRenderers: DisplayRenderers = {
  text: (value) => String(value),
  longText: (value) => <span className="line-clamp-2">{String(value)}</span>,
  number: (value) => numeric(value, NUMBER),
  currency: (value) => numeric(value, DECIMAL),
  // A fraction: 0.42 shows as 42%.
  percent: (value) => numeric(value, PERCENT),
  boolean: (value, { messages }) => (value === true || value === "true" ? messages.common.yes : messages.common.no),
  badge: (value, { column }) => (
    <Chip tone={column.tones?.[String(value)] ?? "muted"}>{titleCase(String(value))}</Chip>
  ),
  date: (value) => formatDay(value),
  datetime: (value, { column }) => formatInstant(value, column.timeZone),
  // The linked row's id until relation labels arrive (batched per page, never per cell).
  relation: (value) => String(value),
  url: (value) =>
    isSafeUrl(value) && /^https?:/i.test(value.trim()) ? (
      <a href={value.trim()} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        {value.trim().replace(/^https?:\/\//i, "")}
      </a>
    ) : (
      String(value)
    ),
  email: (value) => {
    const href = `mailto:${String(value).trim()}`;
    return /^[^\s@]+@[^\s@]+$/.test(String(value).trim()) && isSafeUrl(href) ? (
      <a href={href} className="underline underline-offset-2">
        {String(value).trim()}
      </a>
    ) : (
      String(value)
    );
  },
  image: (value) =>
    isSafeUrl(value) && /^https?:|^\//i.test(value.trim()) ? (
      <img src={value.trim()} alt="" loading="lazy" className="size-8 rounded object-cover" />
    ) : (
      String(value)
    ),
  json: (value) => <code className="line-clamp-1 text-xs">{typeof value === "string" ? value : JSON.stringify(value)}</code>,
};

const DisplayRenderersContext = createContext<DisplayRenderers>(webDisplayRenderers);

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

/** Draw one cell: the empty mark for no value or a cell the row hides (`when`), else its hint's renderer. */
export function useDisplayCell(): (column: ResolvedColumn<Record<string, unknown>>, row: Record<string, unknown>) => ReactNode {
  const renderers = useContext(DisplayRenderersContext);
  const messages = useUiMessages();
  return useMemo(
    () => (column, row) => {
      if (column.when && !column.when(row)) return messages.common.empty;
      const value = column.value(row);
      if (isEmpty(value)) return messages.common.empty;
      return renderers[column.display](value, { row, column, messages });
    },
    [renderers, messages],
  );
}
