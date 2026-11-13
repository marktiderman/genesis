// defineWidget: a small tile on a dashboard or a record page's sidebar, fed by a view (ADR 0023).
//
// A widget is data, with no React: which view it reads (and so which resource, scope, preset
// and permissions), what it needs from it (a total, or a few rows), its label and how its value
// reads. genesis-ui's `<Widget>` draws it; a phone draws the same definition. The pure helpers
// here (`resolveWidgetRequest`, `resolveStreak`, `resolveChartSeries`, `toWidgetText`) are what
// both platforms compute, so they can't drift.

import { addDays, dayIn, deviceTimeZone, isDay, startOfWeek, type Day } from "../dates";
import type { ResourceScope } from "../hooks/viewer-scope";
import type { AggregateMetric, AggregateParams, FilterParam, SortParam } from "../provider/types";
import type { DataRow, ResourceContract } from "../schema/types";
import { ViewDefinitionError } from "./errors";
import { filterParams } from "./link";
import { scopeFilter } from "./scope";
import type { Allowed, ResourceView, Viewer } from "./types";

/** The built-in kinds of widget. */
export type WidgetKind = "number" | "progress" | "streak" | "list" | "chart";

/** How a widget's number reads: plain, short (`1.2k`), a percent of 1, a currency, or your own words. */
export type WidgetFormat =
  | "number"
  | "compact"
  | "percent"
  | { currency: string; maximumFractionDigits?: number }
  | ((value: number) => string);

type Scalar = string | number | boolean | null;
/** Values a widget narrows its view by, as a screen's `filter`: `{ status: "open" }`, `{ owner_id: [a, b] }`. */
export type WidgetFilter = Readonly<Record<string, Scalar | readonly (string | number)[]>>;

/** What every kind of widget says. */
export interface WidgetBase<C extends ResourceContract = ResourceContract, Row extends DataRow = DataRow> {
  /** Stable, unique on its dashboard: a key, a test id, a saved layout's entry. */
  id: string;
  /** What the tile is called ("Open deals"). */
  label: string;
  /** The view it reads: its resource, scope keys, presets, fields and who may read them. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract's view
  view: ResourceView<C, Row & any>;
  /** One of the view's presets: its filter narrows the rows, as a tab would. */
  preset?: string;
  /** More values to narrow by, over the scope and the preset. */
  filter?: WidgetFilter;
  /** A short line under the value ("this quarter"). */
  description?: string;
  /** Where the tile goes when pressed: the full view, usually. */
  href?: string;
  /**
   * Whether this viewer sees the tile: `true`, or the reason not. Only narrows; the view's own
   * field permissions (a field the viewer can't read) hide it too, and row security decides
   * which rows any total covers.
   */
  can?: (viewer: Viewer | undefined) => Allowed;
  /** Keep the tile current with changes made elsewhere (`DataProvider.subscribe`). Default true. */
  live?: boolean;
}

/** A number: a count, or the sum, average, lowest or highest of a field. */
export interface NumberWidget<C extends ResourceContract = ResourceContract, Row extends DataRow = DataRow> extends WidgetBase<C, Row> {
  kind: "number";
  /** What to total. Default `{ fn: "count" }`. */
  metric?: AggregateMetric;
  format?: WidgetFormat;
}

/** Progress toward a goal: a total over a fixed number, or over another total (done of all). */
export interface ProgressWidget<C extends ResourceContract = ResourceContract, Row extends DataRow = DataRow> extends WidgetBase<C, Row> {
  kind: "progress";
  /** What counts as done. Default `{ fn: "count" }` over the widget's rows. */
  metric?: AggregateMetric;
  /**
   * The goal: a number, or a total over the view's scope and `goalFilter` (not the preset or
   * `filter`): `{ fn: "count" }` with the preset "done" makes "done of all".
   */
  goal: number | AggregateMetric;
  /** Narrows the goal's rows when it is a total. */
  goalFilter?: WidgetFilter;
  format?: WidgetFormat;
}

/** A streak: how many days (or weeks) in a row, up to today, have at least one row. */
export interface StreakWidget<C extends ResourceContract = ResourceContract, Row extends DataRow = DataRow> extends WidgetBase<C, Row> {
  kind: "streak";
  /** The date (or timestamp) field a row counts on. */
  dateField: string;
  /** Default `day`. Weeks start on Monday. */
  unit?: "day" | "week";
  /** The zone days are counted in. Default the device's. */
  timeZone?: string;
  /** The most recent rows read to count it. Default 400. */
  limit?: number;
}

/** A short list: the first few rows, as the view names them. */
export interface ListWidget<C extends ResourceContract = ResourceContract, Row extends DataRow = DataRow> extends WidgetBase<C, Row> {
  kind: "list";
  /** Rows shown. Default 5, at most 50. */
  limit?: number;
  /** Their order. Default the view's `orderBy`. */
  sort?: SortParam;
}

/** A chart: one bar (or point) per value of a field, with a count or a total each. */
export interface ChartWidget<C extends ResourceContract = ResourceContract, Row extends DataRow = DataRow> extends WidgetBase<C, Row> {
  kind: "chart";
  /** The field whose values are the bars. */
  groupBy: string;
  /** Each bar's height. Default `{ fn: "count" }`. */
  metric?: AggregateMetric;
  /** Default `bar`. */
  chart?: "bar" | "line";
  /** The most rows read to draw it. Default 1000. */
  limit?: number;
  format?: WidgetFormat;
}

/** What `defineWidget` accepts. */
export type WidgetDefinition<C extends ResourceContract = ResourceContract, Row extends DataRow = DataRow> =
  | NumberWidget<C, Row>
  | ProgressWidget<C, Row>
  | StreakWidget<C, Row>
  | ListWidget<C, Row>
  | ChartWidget<C, Row>;

/** A checked, frozen widget. */
export type DefinedWidget<C extends ResourceContract = ResourceContract, Row extends DataRow = DataRow> = Readonly<WidgetDefinition<C, Row>> & {
  readonly __widget: true;
};

const ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

function metricProblems(where: string, metric: AggregateMetric | undefined, view: WidgetBase["view"]): string[] {
  if (!metric || metric.fn === "count") return [];
  if (!["sum", "avg", "min", "max"].includes(metric.fn)) return [`${where}.fn: one of count, sum, avg, min, max`];
  if (!view.field(metric.field)) return [`${where}.field: "${metric.field}" isn't a field of ${view.resource}`];
  return [];
}

/** Every problem with a widget; empty when it is sound. */
export function widgetProblems(input: WidgetDefinition): string[] {
  const w = input as Partial<WidgetDefinition> & Record<string, unknown>;
  if (!w || typeof w !== "object") return ["expected a widget"];
  const problems: string[] = [];
  if (typeof w.id !== "string" || !ID.test(w.id)) problems.push("id: a letter, then letters, digits, - or _");
  if (typeof w.label !== "string" || !w.label.trim()) problems.push("label: expected a non-empty string");
  const view = w.view;
  if (!view || typeof view !== "object" || typeof view.field !== "function") return [...problems, "view: a view from defineView"];
  if (w.preset !== undefined && !view.definition.presets?.[w.preset]) problems.push(`preset: ${view.resource} has no preset "${w.preset}"`);
  for (const field of Object.keys(w.filter ?? {})) if (!view.field(field)) problems.push(`filter.${field}: not a field of ${view.resource}`);
  switch (w.kind) {
    case "number":
      problems.push(...metricProblems("metric", w.metric, view));
      break;
    case "progress":
      problems.push(...metricProblems("metric", w.metric, view));
      if (typeof w.goal === "number") {
        if (!(w.goal > 0)) problems.push("goal: a number above 0, or a total");
      } else if (!w.goal || typeof w.goal !== "object") problems.push("goal: a number above 0, or a total");
      else problems.push(...metricProblems("goal", w.goal, view));
      for (const field of Object.keys(w.goalFilter ?? {})) if (!view.field(field)) problems.push(`goalFilter.${field}: not a field of ${view.resource}`);
      break;
    case "streak":
      if (typeof w.dateField !== "string" || !view.field(w.dateField)) problems.push(`dateField: not a field of ${view.resource}`);
      if (w.unit !== undefined && w.unit !== "day" && w.unit !== "week") problems.push("unit: day or week");
      break;
    case "list":
      if (w.limit !== undefined && !(Number.isInteger(w.limit) && w.limit > 0 && w.limit <= 50)) problems.push("limit: a whole number from 1 to 50");
      if (w.sort && !view.field(w.sort.field)) problems.push(`sort.field: not a field of ${view.resource}`);
      break;
    case "chart":
      if (typeof w.groupBy !== "string" || !view.field(w.groupBy)) problems.push(`groupBy: not a field of ${view.resource}`);
      problems.push(...metricProblems("metric", w.metric, view));
      if (w.chart !== undefined && w.chart !== "bar" && w.chart !== "line") problems.push("chart: bar or line");
      break;
    default:
      problems.push("kind: one of number, progress, streak, list, chart");
  }
  return problems;
}

/**
 * Define a widget: a tile fed by a view. Checks it against the view (its fields, presets) and
 * returns it frozen. Throws {@link ViewDefinitionError} with every problem.
 *
 * ```ts
 * const openDeals = defineWidget({ id: "open-deals", kind: "number", label: "Open deals", view: dealsView, preset: "open" });
 * const pipeline = defineWidget({
 *   id: "pipeline", kind: "number", label: "Pipeline", view: dealsView, preset: "open",
 *   metric: { fn: "sum", field: "amount" }, format: { currency: "USD" },
 * });
 * ```
 *
 * @stability Beta
 */
export function defineWidget<C extends ResourceContract, Row extends DataRow>(input: WidgetDefinition<C, Row>): DefinedWidget<C, Row> {
  const problems = widgetProblems(input as unknown as WidgetDefinition);
  if (problems.length) throw new ViewDefinitionError(`widget ${String((input as { id?: unknown })?.id)}`, problems);
  // Shallow: the view inside is already frozen, and functions (format, can) stay as given.
  return Object.freeze({ ...input, __widget: true as const }) as DefinedWidget<C, Row>;
}

/** Whether a value is a widget from `defineWidget`. */
export function isWidget(value: unknown): value is DefinedWidget {
  return !!value && typeof value === "object" && (value as { __widget?: unknown }).__widget === true;
}

/** The fields a widget reads: hidden from a viewer who can't read any of them. */
function fieldsRead(w: WidgetDefinition): string[] {
  switch (w.kind) {
    case "number":
      return w.metric && w.metric.fn !== "count" ? [w.metric.field] : [];
    case "progress":
      return [
        ...(w.metric && w.metric.fn !== "count" ? [w.metric.field] : []),
        ...(typeof w.goal === "object" && w.goal.fn !== "count" ? [w.goal.field] : []),
      ];
    case "streak":
      return [w.dateField];
    case "chart":
      return [w.groupBy, ...(w.metric && w.metric.fn !== "count" ? [w.metric.field] : [])];
    case "list":
      return [];
  }
}

/**
 * Whether this viewer sees the widget: `true`, or the reason not. A field it totals that the
 * viewer can't read (`permissions.read: false` in the contract) hides it, then the widget's own
 * `can`. Only narrows: row security still decides the rows behind any total.
 *
 * @stability Beta
 */
export function resolveWidgetAccess(widget: WidgetDefinition, viewer?: Viewer): Allowed {
  for (const field of fieldsRead(widget)) {
    if (widget.view.field(field)?.permissions?.read === false) return `You can't see ${widget.view.label(field).toLowerCase()}.`;
  }
  return widget.can ? widget.can(viewer) : true;
}

/** What a widget asks its provider for, from its view, scope, preset and filter. */
export interface WidgetRequest {
  resource: string;
  /** The preset's filter, the scope, then the widget's own filter. */
  filters: FilterParam[];
  /** Totals to ask `aggregate` for (number, progress). */
  aggregate?: AggregateParams;
  /** The goal's totals, over the scope and `goalFilter` only (progress with a total goal). */
  goal?: AggregateParams;
  /** Rows to read (streak, list, chart): how many and in what order. */
  rows?: { perPage: number; sort?: SortParam };
}

/**
 * What a widget needs from its provider, for a viewer working in `scope` (ViewerScope's): the
 * filters its view would list with, and either the totals or the rows. `<Widget>` and a phone
 * build their reads from this.
 *
 * @stability Beta
 */
export function resolveWidgetRequest(widget: WidgetDefinition, scope?: ResourceScope | null): WidgetRequest {
  const { view } = widget;
  const preset = widget.preset ? view.definition.presets?.[widget.preset] : undefined;
  if (widget.preset && !preset) throw new ViewDefinitionError(view.resource, [`no preset "${widget.preset}"`]);
  const scoped = filterParams(scopeFilter(view, scope) as WidgetFilter);
  const filters = [...filterParams(preset?.filter as WidgetFilter | undefined), ...scoped, ...filterParams(widget.filter)];
  const orderBy = view.definition.orderBy;
  const viewSort: SortParam | undefined = orderBy
    ? { field: orderBy.field as string, order: orderBy.direction ?? "asc", ...(orderBy.nulls ? { nulls: orderBy.nulls } : {}) }
    : undefined;
  switch (widget.kind) {
    case "number":
      return { resource: view.resource, filters, aggregate: { metrics: { value: widget.metric ?? { fn: "count" } }, filters } };
    case "progress": {
      const request: WidgetRequest = { resource: view.resource, filters, aggregate: { metrics: { value: widget.metric ?? { fn: "count" } }, filters } };
      if (typeof widget.goal === "object") {
        const goalFilters = [...scoped, ...filterParams(widget.goalFilter)];
        request.goal = { metrics: { goal: widget.goal }, filters: goalFilters };
      }
      return request;
    }
    case "streak":
      return { resource: view.resource, filters, rows: { perPage: widget.limit ?? 400, sort: { field: widget.dateField, order: "desc", nulls: "last" } } };
    case "list": {
      const sort = widget.sort ?? viewSort;
      return { resource: view.resource, filters, rows: { perPage: widget.limit ?? 5, ...(sort ? { sort } : {}) } };
    }
    case "chart":
      return { resource: view.resource, filters, rows: { perPage: widget.limit ?? 1000 } };
  }
}

/** The day a row's date or timestamp falls on, in `zone`. */
function dayOfValue(value: unknown, zone: string): Day | undefined {
  if (typeof value === "string" && isDay(value)) return value;
  if (typeof value !== "string" && !(value instanceof Date) && typeof value !== "number") return undefined;
  const at = value instanceof Date ? value : new Date(value);
  return Number.isNaN(at.getTime()) ? undefined : dayIn(zone, at);
}

/** A streak's length and whether today (this week) is already in it. */
export interface Streak {
  /** Days (or weeks) in a row, ending today or, while today is still open, yesterday. */
  current: number;
  /** Whether today (this week) has a row. */
  today: boolean;
  unit: "day" | "week";
}

/**
 * How many days (or weeks) in a row have at least one of `values` (dates or timestamps), ending
 * today, or yesterday while today has none yet, so a streak isn't broken before the day is over.
 *
 * @stability Beta
 */
export function resolveStreak(
  values: readonly unknown[],
  options: { unit?: "day" | "week"; timeZone?: string; today?: Day } = {},
): Streak {
  const unit = options.unit ?? "day";
  const zone = options.timeZone ?? deviceTimeZone();
  const step = unit === "day" ? 1 : 7;
  const bucket = (day: Day) => (unit === "day" ? day : startOfWeek(day, 1));
  const seen = new Set<Day>();
  for (const value of values) {
    const day = dayOfValue(value, zone);
    if (day) seen.add(bucket(day));
  }
  const now = bucket(options.today ?? dayIn(zone));
  const today = seen.has(now);
  let at = today ? now : addDays(now, -step);
  let current = 0;
  while (seen.has(at)) {
    current++;
    at = addDays(at, -step);
  }
  return { current, today, unit };
}

/** One bar (or point) of a chart widget. */
export interface ChartPoint {
  /** The field's value, as text (`"(none)"` for an empty one). */
  key: string;
  /** The value in words (`ResourceView.valueLabel`). */
  label: string;
  value: number;
}

/**
 * A chart widget's bars from its rows: one per value of `groupBy`, in the field's choice order
 * when it has choices (else by value), each the metric over the rows with that value.
 *
 * @stability Beta
 */
export function resolveChartSeries(widget: ChartWidget, rows: readonly Record<string, unknown>[]): ChartPoint[] {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const raw = row[widget.groupBy];
    const key = raw === null || raw === undefined || raw === "" ? "(none)" : String(raw);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const choices = (widget.view.field(widget.groupBy)?.enumValues ?? []) as readonly string[];
  const keys = [
    ...choices.filter((c) => groups.has(c)),
    ...[...groups.keys()].filter((k) => !choices.includes(k)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  ];
  const metric = widget.metric ?? { fn: "count" as const };
  return keys.map((key) => {
    const list = groups.get(key)!;
    let value: number;
    if (metric.fn === "count") value = list.length;
    else {
      const nums = list.map((r) => Number(r[metric.field])).filter((n) => Number.isFinite(n));
      value =
        nums.length === 0
          ? 0
          : metric.fn === "sum"
            ? nums.reduce((a, b) => a + b, 0)
            : metric.fn === "avg"
              ? nums.reduce((a, b) => a + b, 0) / nums.length
              : metric.fn === "min"
                ? Math.min(...nums)
                : Math.max(...nums);
    }
    return { key, label: key === "(none)" ? "None" : widget.view.valueLabel(widget.groupBy, key), value };
  });
}

/**
 * A widget's number in words: `null` reads "—", a percent is of 1 (0.42 is 42%).
 *
 * @stability Beta
 */
export function toWidgetText(value: number | null | undefined, format: WidgetFormat = "number", locale?: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (typeof format === "function") return format(value);
  if (typeof format === "object") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: format.currency,
      ...(format.maximumFractionDigits !== undefined ? { maximumFractionDigits: format.maximumFractionDigits } : {}),
    }).format(value);
  }
  switch (format) {
    case "compact":
      return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
    case "percent":
      return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(value);
    default:
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  }
}

/**
 * Progress as a fraction from 0 to 1 (more than 1 when the goal is passed), or null without a
 * goal to measure against.
 *
 * @stability Beta
 */
export function resolveProgress(value: number | null | undefined, goal: number | null | undefined): number | null {
  if (value === null || value === undefined || goal === null || goal === undefined || !(goal > 0)) return null;
  return Math.max(0, value / goal);
}
