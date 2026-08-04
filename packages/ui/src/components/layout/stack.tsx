import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../../utils";
import { GAP_CLASSES } from "./spacing";

const stackVariants = cva("flex", {
  variants: {
    direction: {
      row: "flex-row",
      column: "flex-col",
    },
    gap: GAP_CLASSES,
    // Exactly `@marktiderman/genesis-ui-native`'s `FlexAlign` / `FlexJustify`
    // — see `./spacing` for why the two surfaces share one vocabulary.
    // Web flexbox also supports `baseline` and `space-evenly`, and an
    // earlier draft offered both; they are deliberately NOT here, because
    // native's Yoga vocabulary has neither, so a spec written against them
    // could not be applied to the native surface. Since `align`/`justify`
    // emit nothing when unset, `className="items-baseline"` reaches them
    // with no class to fight. Widening is additive and can happen later on
    // BOTH surfaces at once; shipping them here first and withdrawing them
    // to restore parity would be a breaking change.
    align: {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      stretch: "items-stretch",
    },
    justify: {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
      between: "justify-between",
      around: "justify-around",
    },
    wrap: {
      true: "flex-wrap",
      // Empty, not `flex-nowrap`: nowrap is already flexbox's initial value,
      // so emitting it would only add noise. Same reasoning as the
      // undefaulted `align`/`justify` below.
      false: "",
    },
  },
  // `align` and `justify` have NO default on purpose. Defaulting them would
  // emit `items-stretch`/`justify-start` on every Stack ever rendered — the
  // browser's own initial values — which is noise in the DOM and, worse,
  // beats a consumer's `className` at equal specificity for anyone not
  // going through `cn()`. Unset means "whatever flexbox already does".
  defaultVariants: {
    direction: "column",
    gap: "md",
    wrap: false,
  },
});

export interface StackProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof stackVariants> {
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * Stack — one-dimensional flow. The single most-repeated shape in any
 * application: a run of things in a line, evenly spaced.
 *
 * It replaces the `flex flex-col gap-4` / `flex items-center gap-2` strings
 * that otherwise get retyped in every file, and it is the reason `gap`
 * stays on the shared `SpaceToken` scale (see `./spacing`) instead of
 * drifting per page.
 *
 * ```tsx
 * <Stack gap="lg">
 *   <Card />
 *   <Card />
 * </Stack>
 *
 * <Stack direction="row" align="center" justify="between" gap="sm">
 *   <h2>Members</h2>
 *   <Button>Invite</Button>
 * </Stack>
 * ```
 *
 * Deliberately NOT here: responsive per-breakpoint directions. A layout
 * that changes axis at a breakpoint is a `Split`, which owns that idea and
 * names the breakpoint explicitly.
 *
 * Note for consumers of both surfaces: `@marktiderman/genesis-ui-native`
 * splits this shape into two components, `Stack` (column) and `Inline`
 * (row). On web they are one component with a `direction` prop, which is
 * the established web idiom. The `gap` / `align` / `justify` vocabulary is
 * identical either way — deliberately, and enforced by a test that reads
 * the native definitions directly — so a spec written once still reads the
 * same on both. That means the web unions are the SHARED vocabulary, not
 * everything web flexbox can do; see the note on `align` below.
 *
 * @stability Beta
 */
export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  (
    { className, direction, gap, align, justify, wrap, testID, ...props },
    ref
  ) => (
    <div
      ref={ref}
      data-slot="stack"
      data-testid={testID}
      className={cn(
        stackVariants({ direction, gap, align, justify, wrap }),
        className
      )}
      {...props}
    />
  )
);
Stack.displayName = "Stack";

export { stackVariants };
