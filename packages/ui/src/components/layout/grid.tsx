import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../../utils";
import { GAP_CLASSES } from "./spacing";

const gridVariants = cva("grid", {
  variants: {
    // `cols` is the column count at the WIDEST breakpoint, and each value
    // is a ramp down to a sane mobile layout — not a fixed track count.
    // This is the string every application hand-writes on every card grid
    // ("grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"), and hand-writing it is
    // how one page ends up ramping at `md` and the next at `lg`.
    //
    // Six is the one ramp that does not bottom out at a single column: a
    // six-up is a row of small tiles (stats, filters, icons), and stacking
    // those one-per-screen produces a page nobody scrolls to the end of.
    cols: {
      1: "grid-cols-1",
      2: "grid-cols-1 sm:grid-cols-2",
      3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
      5: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
      6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
    },
    gap: GAP_CLASSES,
    align: {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      stretch: "items-stretch",
    },
  },
  // No `align` default — see the note in `stack.tsx`.
  defaultVariants: {
    cols: 3,
    gap: "md",
  },
});

export interface GridProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof gridVariants> {
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * Grid — two-dimensional flow for card and tile collections.
 *
 * `cols` is the count at the widest breakpoint; the class it emits is a
 * responsive ramp, so a card grid reflows on its own without the consumer
 * writing a single breakpoint.
 *
 * ```tsx
 * <Grid cols={3} gap="lg">
 *   {people.map((p) => <PersonCard key={p.id} person={p} />)}
 * </Grid>
 *
 * <Grid cols={4} gap="sm" align="start">
 *   {stats.map((s) => <StatCard key={s.id} {...s} />)}
 * </Grid>
 * ```
 *
 * Deliberately NOT here: `grid-template-areas`, explicit row/column
 * placement, and per-child spans. A component that positions a *named*
 * child has stopped positioning things without knowing what they are, and
 * a grid whose children each carry placement props is a CSS file wearing a
 * React costume — reach for `className` at that point.
 *
 * @stability Beta
 */
export const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  ({ className, cols, gap, align, testID, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="grid"
      data-testid={testID}
      className={cn(gridVariants({ cols, gap, align }), className)}
      {...props}
    />
  )
);
Grid.displayName = "Grid";

export { gridVariants };
