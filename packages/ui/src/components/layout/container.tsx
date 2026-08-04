import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../../utils";

const containerVariants = cva("mx-auto w-full", {
  variants: {
    // A deliberately short list. Named widths are a shared decision — five
    // of them means two pages can't be 4px apart for no reason, which is
    // exactly what happens once `max-w-[1180px]` is on the table.
    size: {
      /** Forms, settings, single-column detail. */
      sm: "max-w-3xl",
      /** Standard content pages. */
      md: "max-w-5xl",
      /** Application pages — the default. */
      lg: "max-w-7xl",
      /** Dashboards and wide tables: gutters, no ceiling. */
      full: "max-w-none",
      /** Long-form reading, capped by character count rather than width. */
      prose: "max-w-prose",
    },
    // The three steps are the design system's own page spacing token
    // (`spacing.page` = 1rem / 1.5rem / 2rem) expressed as utilities.
    gutter: {
      true: "px-4 sm:px-6 lg:px-8",
      false: "px-0",
    },
  },
  defaultVariants: {
    size: "lg",
    gutter: true,
  },
});

export interface ContainerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof containerVariants> {
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * Container — the page gutter: a centered column with a named maximum
 * width and responsive side padding.
 *
 * ```tsx
 * <Container>
 *   <Section title="Overview">{…}</Section>
 * </Container>
 *
 * <Container size="sm">
 *   <SettingsForm />
 * </Container>
 *
 * <Container size="full" gutter={false}>
 *   <FullBleedMap />
 * </Container>
 * ```
 *
 * `gutter` is a real prop rather than a `className` override because the
 * padding is responsive: passing `px-0` would only cancel the base step
 * and leave `sm:px-6` and `lg:px-8` intact, so the escape hatch that looks
 * like it should work silently doesn't.
 *
 * @stability Beta
 */
export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size, gutter, testID, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="container"
      data-testid={testID}
      className={cn(containerVariants({ size, gutter }), className)}
      {...props}
    />
  )
);
Container.displayName = "Container";

export { containerVariants };
