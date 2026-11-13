import type { ReactNode } from "react";
import type { DefinedWidget, WidgetDefinition } from "@marktiderman/genesis-core/resource-view";
import { cn } from "../../../utils";
import { Grid, type GridProps } from "../../layout/grid";
import { Widget, type WidgetProps } from "./Widget";

/** A widget on a grid, with how many columns it spans at the widest breakpoint. */
export interface WidgetGridItem {
  widget: DefinedWidget | WidgetDefinition;
  /** Columns it spans from `lg` up (a chart or a list wants 2). Default 1. */
  span?: 1 | 2 | 3 | 4;
}

const SPAN: Record<NonNullable<WidgetGridItem["span"]>, string> = {
  1: "",
  2: "sm:col-span-2",
  3: "sm:col-span-2 lg:col-span-3",
  4: "sm:col-span-2 lg:col-span-4",
};

export interface WidgetGridProps extends Pick<WidgetProps, "linkComponent" | "locale" | "rowHref" | "refused"> {
  /** The widgets, in order: each a widget, or `{ widget, span }`. */
  widgets?: readonly (DefinedWidget | WidgetDefinition | WidgetGridItem)[];
  /** Columns at the widest breakpoint (Grid's scale). Default 4. */
  columns?: NonNullable<GridProps["cols"]>;
  /** More tiles after the widgets: a `StatCard`, a `<Widget>` with its own props. */
  children?: ReactNode;
  className?: string | undefined;
  testID?: string | undefined;
}

const isItem = (entry: DefinedWidget | WidgetDefinition | WidgetGridItem): entry is WidgetGridItem =>
  !("kind" in entry) && "widget" in entry;

/**
 * A dashboard's widgets on a responsive grid: one column on a phone, `columns` at the widest,
 * with a chart or a list spanning more. For the stat row of a `DashboardPage`, pass `<Widget>`s
 * to its `stats` instead: that row is a grid already.
 *
 * @stability Beta
 */
export function WidgetGrid({ widgets = [], columns = 4, children, className, testID, ...widgetProps }: WidgetGridProps) {
  return (
    <Grid cols={columns} gap="lg" className={cn("grid-flow-row-dense", className)} data-slot="widget-grid" testID={testID}>
      {widgets.map((entry) => {
        const { widget, span = 1 } = isItem(entry) ? entry : { widget: entry, span: 1 as const };
        return <Widget key={widget.id} widget={widget} {...widgetProps} className={SPAN[span]} />;
      })}
      {children}
    </Grid>
  );
}
