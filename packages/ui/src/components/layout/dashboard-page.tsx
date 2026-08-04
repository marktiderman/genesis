import * as React from "react";
import { cn } from "../../utils";
import { Grid, type GridProps } from "./grid";

export interface DashboardPageProps
  // `HTMLAttributes` already declares `title?: string` (the native tooltip
  // attribute); omit it before redeclaring the page title as a ReactNode.
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Page title. Rendered as the page's single `<h1>`. */
  title: React.ReactNode;
  /** Supporting line under the title — a date range, a scope, a filter. */
  subtitle?: React.ReactNode;
  /** Trailing controls — a period picker, an export, a refresh. */
  actions?: React.ReactNode;
  /**
   * The stat row: `StatCard`s, or anything tile-shaped. Laid out in a `Grid`
   * that ramps down to one column on a phone. Omit it and no grid renders.
   */
  stats?: React.ReactNode;
  /**
   * Tiles across the stat row at the widest breakpoint. Default `4`.
   * Reuses `Grid`'s `cols` scale, so the responsive ramp is the same one
   * every other card grid in the app gets.
   */
  statColumns?: NonNullable<GridProps["cols"]>;
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * DashboardPage — a stat row over a flexible region of charts, tables and
 * sections.
 *
 * ```tsx
 * <DashboardPage
 *   title="This quarter"
 *   subtitle="1 Apr – 30 Jun"
 *   actions={<DatePicker … />}
 *   stats={
 *     <>
 *       <StatCard label="Active clients" value={42} />
 *       <StatCard label="Sessions" value={318} trend={{ value: 12, label: "vs Q1" }} />
 *     </>
 *   }
 * >
 *   <Section title="Revenue"><ChartContainer …/></Section>
 *   <Section title="At risk"><DataTable …/></Section>
 * </DashboardPage>
 * ```
 *
 * The two regions are separated on purpose. Stats are a fixed-shape row that
 * must reflow as a unit; everything below is free-form and stacks. Folding
 * both into one `children` is how the stat row ends up hand-gridded per page,
 * with a different breakpoint each time — the exact drift `Grid` exists to
 * stop.
 *
 * Children stack at `gap-8`, wider than the page's own `gap-6`, so a chart
 * and the table under it don't read as one block.
 *
 * The header row is markup, not a component, and deliberately not
 * `PageHeader` — see `./detail-page` for the measured reasons composing it
 * was rejected across all four templates. Width is left to `Container` —
 * wrap, don't duplicate.
 *
 * This is a **layout**: it positions tiles and regions and never fetches a
 * metric. There is deliberately no data-bound twin — binding a dashboard
 * needs an aggregate/metric contract, and `genesis-core` ships none. Adding
 * a template ahead of its contract is what `docs/FRAMEWORK.md` warns against
 * in "Why templates need the contract first".
 *
 * @stability Beta
 */
export const DashboardPage = React.forwardRef<
  HTMLDivElement,
  DashboardPageProps
>(
  (
    {
      className,
      title,
      subtitle,
      actions,
      stats,
      statColumns = 4,
      testID,
      children,
      ...props
    },
    ref
  ) => (
    <div
      ref={ref}
      data-slot="dashboard-page"
      data-testid={testID}
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <header
        data-slot="dashboard-page-header"
        className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h1
            data-slot="dashboard-page-title"
            className="truncate text-xl font-bold tracking-tight sm:text-2xl"
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              data-slot="dashboard-page-subtitle"
              className="text-sm text-muted-foreground"
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div
            data-slot="dashboard-page-actions"
            className="flex shrink-0 items-center gap-2"
          >
            {actions}
          </div>
        ) : null}
      </header>

      {stats ? (
        // `align` is left unset on purpose: grid items already stretch, and
        // `Grid` deliberately emits nothing for the defaults CSS supplies.
        <Grid cols={statColumns} gap="lg">
          {stats}
        </Grid>
      ) : null}

      <div data-slot="dashboard-page-body" className="flex min-w-0 flex-col gap-8">
        {children}
      </div>
    </div>
  )
);
DashboardPage.displayName = "DashboardPage";
