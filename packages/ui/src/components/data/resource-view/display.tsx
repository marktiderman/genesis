// How a view's display hints draw on the web. One renderer per hint, registered once: a view says
// `status: { display: "badge" }` and never imports a component, so native and the extension can
// draw the same view their own way. An app replaces any of them with DisplayRenderersProvider.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { isSafeUrl, useRelationLabel, useViewer } from "@marktiderman/genesis-core";
import { isTimeZone } from "@marktiderman/genesis-core/dates";
import { useOptionalViewerScope } from "@marktiderman/genesis-core/hooks";
import { valueText, type DisplayHint, type ResolvedColumn } from "@marktiderman/genesis-core/resource-view";
import { useUiMessages, type UiMessages } from "../../../messages";
import { Chip } from "../../resource/chip";

/** What a renderer gets besides the value. */
export interface DisplayContext {
  row: Record<string, unknown>;
  column: ResolvedColumn<Record<string, unknown>>;
  messages: UiMessages;
  /**
   * The clock a timestamp is read on: the column's own zone, else the viewer's (ViewerScope's
   * `timeZone`). Undefined outside a ViewerScope, which means the browser's.
   */
  timeZone?: string;
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

// One day formatter per zone, as for instants below.
const DAYS = new Map<string, Intl.DateTimeFormat>();
function dayFormat(zone: string | undefined): Intl.DateTimeFormat {
  const key = zone ?? "";
  let format = DAYS.get(key);
  if (!format) {
    try {
      format = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: zone });
    } catch {
      format = DAY;
    }
    DAYS.set(key, format);
  }
  return format;
}

/**
 * A day. A calendar day (`YYYY-MM-DD`) from its parts, so it is the same day on every clock (never
 * `new Date(day)`); a timestamp as the day it is on the column's clock, so an 8pm edit in New York
 * isn't tomorrow's (its UTC day).
 */
function formatDay(value: unknown, timeZone?: string): string {
  const text = String(value);
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (day) return DAY.format(new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
  const at = /^\d{4}-\d{2}-\d{2}[T ]/.test(text) ? new Date(text) : null;
  if (!at || Number.isNaN(at.getTime())) return text;
  return dayFormat(timeZone).format(at);
}

// One formatter per zone: building an Intl.DateTimeFormat costs ~40x a format call.
const INSTANTS = new Map<string, Intl.DateTimeFormat>();
function instantFormat(zone: string | undefined): Intl.DateTimeFormat {
  const key = zone ?? "";
  let format = INSTANTS.get(key);
  if (!format) {
    try {
      format = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: zone });
    } catch {
      // An unknown zone name: the viewer's clock, rather than a broken cell.
      format = instantFormat(undefined);
    }
    INSTANTS.set(key, format);
  }
  return format;
}

function formatInstant(value: unknown, timeZone: string | undefined): string {
  const at = new Date(String(value));
  if (Number.isNaN(at.getTime())) return String(value);
  return instantFormat(timeZone).format(at);
}

/**
 * A link as the linked row's words (batched per page). A plain relation field with no `references`
 * shows its value; a linked row that's hidden or gone shows words, never its raw id.
 */
function RelationText({ value, context }: { value: unknown; context: DisplayContext }) {
  const { column, messages } = context;
  const reference = column.field?.references;
  const label = useRelationLabel(reference, value, column.labelField ? { labelField: column.labelField } : {});
  if (!reference) return <>{String(value)}</>;
  if (label === undefined) return <span aria-busy="true">{messages.common.empty}</span>;
  return <>{label ?? column.missingLabel ?? messages.common.hiddenLink}</>;
}

/** Genesis's web renderers. Every one shows text it can't draw, never a broken cell. */
export const webDisplayRenderers: DisplayRenderers = {
  text: (value) => (typeof value === "object" ? JSON.stringify(value) : String(value)),
  longText: (value) => <span className="line-clamp-2">{String(value)}</span>,
  number: (value) => numeric(value, NUMBER),
  // Two decimals with no symbol: the currency is the app's, so an app registers its own renderer.
  currency: (value) => numeric(value, DECIMAL),
  // A fraction: 0.42 shows as 42%. A column storing 42 for 42% uses `number` or its own renderer.
  percent: (value) => numeric(value, PERCENT),
  boolean: (value, { messages }) => (value === true || value === "true" ? messages.common.yes : messages.common.no),
  badge: (value, { column }) => (
    <Chip tone={column.tones?.[String(value)] ?? "muted"}>{valueText(column.labels, value)}</Chip>
  ),
  date: (value, { timeZone }) => formatDay(value, timeZone),
  datetime: (value, { timeZone }) => formatInstant(value, timeZone),
  // The linked row's words, batched across the page (one query per linked resource), else its id.
  relation: (value, context) => <RelationText value={value} context={context} />,
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
    // A plain address only: no `?subject=` or `&body=` riding along in the mailto link.
    return /^[^\s@?&#/]+@[^\s@?&#/]+$/.test(String(value).trim()) && isSafeUrl(href) ? (
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

/**
 * Replace some of the renderers for everything below (nested providers build on each other).
 * Pass a stable object (a module constant or a `useMemo`): a new one each render redraws every
 * column.
 */
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

/** Draw one cell: the empty mark for no value or a cell the row (or viewer) hides (`when`), else its hint's renderer. */
export function useDisplayCell(): (column: ResolvedColumn<Record<string, unknown>>, row: Record<string, unknown>) => ReactNode {
  const renderers = useContext(DisplayRenderersContext);
  const messages = useUiMessages();
  // `when` reads the viewer too: a new viewer or new roles redraws the cells.
  const viewer = useViewer();
  // The viewer's clock, for timestamps on columns without a zone of their own.
  const viewerScope = useOptionalViewerScope();
  const viewerZone = viewerScope?.timeZone;
  // The scope's clock (a location's, a league's), for columns with `timeZone: "scope"`.
  const scopeZone = viewerScope?.scopeTimeZone ?? viewerZone;
  return useMemo(
    () => (column, row) => {
      if (column.when && !column.when(row, viewer)) return messages.common.empty;
      const value = column.value(row);
      if (isEmpty(value)) return messages.common.empty;
      const own = column.timeZone && column.timeZone !== "viewer" && column.timeZone !== "scope" ? column.timeZone : undefined;
      const timeZone = own && isTimeZone(own) ? own : column.timeZone === "scope" ? scopeZone : viewerZone;
      return renderers[column.display](value, { row, column, messages, ...(timeZone ? { timeZone } : {}) });
    },
    [renderers, messages, viewer, viewerZone, scopeZone],
  );
}
