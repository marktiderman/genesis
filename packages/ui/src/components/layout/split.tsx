import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../../utils";
import { GAP_CLASSES } from "./spacing";

/**
 * Breakpoint at which a `Split` stops stacking and becomes side-by-side.
 * These are Tailwind's own breakpoint names, so `at="lg"` means exactly
 * what `lg:` means everywhere else in the app.
 */
export type SplitBreakpoint = "sm" | "md" | "lg" | "xl";

/** How the horizontal space divides once the split is side-by-side. */
export type SplitRatio = "1/3" | "1/2" | "2/3";

const splitVariants = cva(
  // Below `at`, this is a plain vertical stack: master first, detail after,
  // which is the correct reading order on a phone. At `at` and up it becomes
  // a twelve-column grid. `flex-col` is simply inert once `display: grid`
  // takes over, so the two never fight.
  "flex flex-col",
  {
    variants: {
      at: {
        sm: "sm:grid sm:grid-cols-12",
        md: "md:grid md:grid-cols-12",
        lg: "lg:grid lg:grid-cols-12",
        xl: "xl:grid xl:grid-cols-12",
      },
      gap: GAP_CLASSES,
    },
    defaultVariants: {
      at: "md",
      gap: "md",
    },
  }
);

/**
 * Column spans, written out literally per breakpoint because Tailwind
 * scans source text — a class name assembled at runtime (`${at}:col-span-${n}`)
 * is a class name Tailwind never generates.
 *
 * Only 4 / 6 / 8 appear: the twelve-column track makes every ratio and its
 * complement land inside that set (12-4=8, 12-6=6, 12-8=4), so one table
 * serves both panes.
 */
const COL_SPAN: Record<SplitBreakpoint, Record<4 | 6 | 8, string>> = {
  sm: { 4: "sm:col-span-4", 6: "sm:col-span-6", 8: "sm:col-span-8" },
  md: { 4: "md:col-span-4", 6: "md:col-span-6", 8: "md:col-span-8" },
  lg: { 4: "lg:col-span-4", 6: "lg:col-span-6", 8: "lg:col-span-8" },
  xl: { 4: "xl:col-span-4", 6: "xl:col-span-6", 8: "xl:col-span-8" },
};

/** Track count the `start` pane occupies, out of twelve. */
const START_SPAN: Record<SplitRatio, 4 | 6 | 8> = {
  "1/3": 4,
  "1/2": 6,
  "2/3": 8,
};

/** The `end` pane always takes what `start` left behind. */
const END_SPAN: Record<SplitRatio, 4 | 6 | 8> = {
  "1/3": 8,
  "1/2": 6,
  "2/3": 4,
};

export interface SplitProps
  extends React.HTMLAttributes<HTMLDivElement>,
    Omit<VariantProps<typeof splitVariants>, "at"> {
  /** Leading pane — the "master" half. Renders first when stacked. */
  start: React.ReactNode;
  /** Trailing pane — the "detail" half. Renders second when stacked. */
  end: React.ReactNode;
  /** Share of the width the `start` pane takes. Default `"1/3"`. */
  ratio?: SplitRatio;
  /** Breakpoint at and above which the panes sit side by side. Default `"md"`. */
  at?: SplitBreakpoint;
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * Split — the master-detail layout: two panes side by side above a
 * breakpoint, stacked below it.
 *
 * ```tsx
 * <Split
 *   ratio="1/3"
 *   at="lg"
 *   gap="lg"
 *   start={<ConversationList />}
 *   end={<ConversationDetail />}
 * />
 * ```
 *
 * The stacking behaviour is the whole reason this is a component rather
 * than two divs: a hand-rolled split usually forgets the small screen, and
 * a hand-rolled split that remembers usually picks a different breakpoint
 * from the one next door.
 *
 * Two panes only, and both are required — a "split" with an optional half
 * is a `Stack`, and a three-pane shell (nav + list + detail) is an
 * application shell, not a layout primitive. Nest a `Split` inside a
 * `Split` if you genuinely need three.
 *
 * @stability Beta
 */
export const Split = React.forwardRef<HTMLDivElement, SplitProps>(
  (
    { className, start, end, ratio = "1/3", at = "md", gap, testID, ...props },
    ref
  ) => (
    <div
      ref={ref}
      data-slot="split"
      data-testid={testID}
      className={cn(splitVariants({ at, gap }), className)}
      {...props}
    >
      <div data-slot="split-start" className={cn("min-w-0", COL_SPAN[at][START_SPAN[ratio]])}>
        {start}
      </div>
      <div data-slot="split-end" className={cn("min-w-0", COL_SPAN[at][END_SPAN[ratio]])}>
        {end}
      </div>
    </div>
  )
);
Split.displayName = "Split";

export { splitVariants };
