// <Widget>: draws a widget from defineWidget (genesis-core/resource-view), fed by its view, so it
// is live and permission-aware (ADR 0023). Number and progress ask the provider for totals
// (`useAggregate`); streak, list and chart read a few rows. Loading, error and empty states are
// the widget's, never the app's.

import { useMemo, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis } from "recharts";
import { useResource, useAggregate } from "@marktiderman/genesis-core/hooks";
import { readFailureMessage, isDataReadError, useViewer } from "@marktiderman/genesis-core";
import {
  resolveChartSeries,
  resolveProgress,
  resolveStreak,
  resolveWidgetAccess,
  resolveWidgetRequest,
  toWidgetText,
  type DefinedWidget,
  type WidgetDefinition,
} from "@marktiderman/genesis-core/resource-view";
import { fillMessage, useUiMessages } from "../../../messages";
import { DefaultLink, type LinkComponent } from "../../../navigation";
import { Button } from "../../ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../../ui/chart";
import { Progress } from "../../ui/progress";
import { Skeleton } from "../../ui/skeleton";
import { WidgetTile, type WidgetTileState } from "./WidgetTile";

type Row = Record<string, unknown> & { id: string | number };

export interface WidgetProps {
  /** From `defineWidget`. */
  widget: DefinedWidget | WidgetDefinition;
  /** A list widget's link for one row (its record page). */
  rowHref?: ((row: Record<string, unknown>) => string) | undefined;
  /** Router link for `href` and `rowHref`. Default a plain `<a>`. */
  linkComponent?: LinkComponent | undefined;
  /** An icon beside the label. */
  icon?: ReactNode | undefined;
  /** Number locale (`Intl`). Default the runtime's. */
  locale?: string | undefined;
  /** Shown in place of the tile when the viewer may not see it. Default nothing. */
  refused?: (reason: string) => ReactNode;
  className?: string | undefined;
}

function errorText(error: unknown, noun: string, plural: string, fallback: string): string {
  return isDataReadError(error) ? error.message || readFailureMessage(error.outcome, noun, false, plural) : fallback;
}

/**
 * One widget, drawn on the one widget tile (`WidgetTile`). Reads through the data provider in
 * the viewer's scope (ViewerScope), under row security, and keeps itself current (`live`,
 * default on). Hidden when the viewer can't read a field it totals or the widget's `can` says no.
 *
 * ```tsx
 * <DashboardPage title="Sales" stats={<><Widget widget={openDeals} /><Widget widget={pipeline} /></>} />
 * ```
 *
 * @stability Beta
 */
export function Widget({ widget, rowHref, linkComponent = DefaultLink, icon, locale, refused, className }: WidgetProps) {
  const viewer = useViewer();
  const allowed = resolveWidgetAccess(widget, viewer);
  if (allowed !== true) return refused ? <>{refused(allowed)}</> : null;
  return <WidgetBody widget={widget} rowHref={rowHref} linkComponent={linkComponent} icon={icon} locale={locale} className={className} />;
}

function WidgetBody({ widget, rowHref, linkComponent, icon, locale, className }: Omit<WidgetProps, "refused"> & { linkComponent: LinkComponent }) {
  const viewer = useViewer();
  const messages = useUiMessages();
  const m = messages.widget;
  const request = useMemo(() => resolveWidgetRequest(widget, viewer.scope), [widget, viewer.scope]);
  const live = widget.live ?? true;
  const { view } = widget;

  const totals = useAggregate(request.resource, request.aggregate ?? { metrics: { value: { fn: "count" } } }, {
    enabled: !!request.aggregate,
    live,
  });
  const goal = useAggregate(request.resource, request.goal ?? { metrics: { goal: { fn: "count" } } }, {
    enabled: !!request.goal,
    live,
  });
  const rows = useResource<Row>(request.resource, {
    defaultFilters: request.filters,
    defaultPerPage: request.rows?.perPage ?? 1,
    ...(request.rows?.sort ? { defaultSort: request.rows.sort } : {}),
    enabled: !!request.rows,
    live,
  });

  const reads = [request.aggregate ? totals : null, request.goal ? goal : null, request.rows ? rows.list : null].filter((q) => q !== null);
  const failed = reads.find((q) => q.isError);
  const loading = reads.some((q) => q.isPending);
  const retry = () => reads.forEach((q) => void q.refetch());

  const tile = (state: WidgetTileState, value: ReactNode, detail?: ReactNode, body?: ReactNode) => (
    <WidgetTile
      variant="widget"
      kind={widget.kind}
      state={state}
      label={widget.label}
      value={value}
      detail={detail ?? widget.description}
      icon={icon}
      href={widget.kind === "list" ? undefined : widget.href}
      linkComponent={linkComponent}
      className={className}
      testID={`widget-${widget.id}`}
    >
      {body}
    </WidgetTile>
  );

  if (failed) {
    return tile(
      "error",
      undefined,
      <span role="alert">{errorText(failed.error, view.noun, view.nounPlural, m.error)}</span>,
      <Button variant="outline" size="sm" onClick={retry}>
        {m.retry}
      </Button>,
    );
  }
  if (loading) return tile("loading", <Skeleton className="h-8 w-20" />);

  switch (widget.kind) {
    case "number": {
      const value = totals.data?.values["value"] ?? null;
      const text = toWidgetText(value, widget.format, locale);
      return tile(value === null ? "empty" : "ready", value === null ? m.empty : totals.data?.isEstimate ? `~${text}` : text);
    }
    case "progress": {
      const value = totals.data?.values["value"] ?? null;
      const target = typeof widget.goal === "number" ? widget.goal : (goal.data?.values["goal"] ?? null);
      const fraction = resolveProgress(value, target);
      const of = fillMessage(m.progressOf, { value: toWidgetText(value ?? 0, "number", locale), goal: toWidgetText(target, "number", locale) });
      return tile(
        fraction === null ? "empty" : "ready",
        fraction === null ? m.empty : toWidgetText(fraction, widget.format ?? "percent", locale),
        of,
        <Progress value={(fraction ?? 0) * 100} aria-label={widget.label} aria-valuetext={of} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, fraction ?? 0) * 100)} />,
      );
    }
    case "streak": {
      const values = (rows.list.data?.data ?? []).map((r) => r[widget.dateField]);
      const streak = resolveStreak(values, { unit: widget.unit ?? "day", ...(widget.timeZone ? { timeZone: widget.timeZone } : {}) });
      const unit = streak.unit === "day" ? (streak.current === 1 ? m.day : m.days) : streak.current === 1 ? m.week : m.weeks;
      return tile(
        streak.current === 0 ? "empty" : "ready",
        `${toWidgetText(streak.current, "number", locale)} ${unit}`,
        streak.current > 0 ? (streak.today ? m.streakToday : m.streakOpen) : undefined,
      );
    }
    case "list": {
      const items = rows.list.data?.data ?? [];
      const labelField = view.labelField;
      const Link = linkComponent;
      const body =
        items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{fillMessage(m.emptyList, { items: view.nounPlural })}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {items.map((row) => {
              const name = labelField && row[labelField] != null && row[labelField] !== "" ? String(row[labelField]) : messages.common.untitled;
              return (
                <li key={String(row.id)} className="truncate py-1.5">
                  {rowHref ? (
                    <Link href={rowHref(row)} className="hover:underline">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </li>
              );
            })}
          </ul>
        );
      const more = widget.href ? (
        <Link href={widget.href} className="mt-1 inline-block text-xs font-medium text-primary-text hover:underline">
          {m.seeAll}
        </Link>
      ) : null;
      return tile(
        items.length === 0 ? "empty" : "ready",
        undefined,
        undefined,
        <>
          {body}
          {more}
        </>,
      );
    }
    case "chart": {
      const series = resolveChartSeries(widget, rows.list.data?.data ?? []);
      if (series.length === 0) return tile("empty", undefined, m.empty);
      const config: ChartConfig = { value: { label: widget.label, color: "hsl(var(--primary))" } };
      const format = (v: number) => toWidgetText(v, widget.format, locale);
      return tile(
        "ready",
        undefined,
        undefined,
        <ChartContainer config={config} className="aspect-auto h-40 w-full">
          {widget.chart === "line" ? (
            <LineChart data={series} margin={{ left: 4, right: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v) => format(Number(v))} />} />
              <Line dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
            </LineChart>
          ) : (
            <BarChart data={series}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v) => format(Number(v))} />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={4} />
            </BarChart>
          )}
        </ChartContainer>,
      );
    }
  }
}
