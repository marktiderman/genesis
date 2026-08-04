import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../utils";

const sectionHeadingVariants = cva("font-semibold tracking-tight", {
  variants: {
    // Visual weight follows the semantic level, so the document outline and
    // the type scale cannot drift apart by accident. Override with
    // `headingClassName` in the rare case where they genuinely should.
    level: {
      2: "text-xl",
      3: "text-lg",
      4: "text-base",
    },
  },
  defaultVariants: {
    level: 2,
  },
});

export interface SectionProps
  // `HTMLAttributes` already declares `title?: string` (the native tooltip
  // attribute). Omit it before redeclaring the heading as a ReactNode,
  // otherwise the two are incompatible and the element sprouts a browser
  // tooltip repeating its own heading.
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** Section heading. Required — an untitled region is just a `Stack`. */
  title: React.ReactNode;
  /** Optional supporting copy under the heading. */
  description?: React.ReactNode;
  /** Optional trailing controls for this region (a button, a menu, a filter). */
  actions?: React.ReactNode;
  /**
   * Heading level. Default `2`, i.e. a top-level region of a page whose
   * `<h1>` is the page title. Drop to `3`/`4` when nesting so the outline
   * stays legal — heading level is document structure, not a font size.
   */
  level?: 2 | 3 | 4;
  /** Escape hatch for the heading's own classes (type scale, color). */
  headingClassName?: string;
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * Section — a titled region of a page: heading, optional description,
 * optional trailing actions, and the content itself.
 *
 * ```tsx
 * <Section
 *   title="Team members"
 *   description="Everyone with access to this workspace."
 *   actions={<Button>Invite</Button>}
 * >
 *   <Grid cols={3}>{…}</Grid>
 * </Section>
 * ```
 *
 * Renders a real `<section>` named by its own heading through
 * `aria-labelledby`, which is what turns it into a navigable landmark —
 * an unnamed `<section>` is announced as nothing at all, so the markup
 * that *looks* the most semantic is the markup that most often isn't.
 *
 * The header collapses to a column below `sm`, so a long title and an
 * action button never fight over the same line on a phone.
 *
 * @stability Beta
 */
export const Section = React.forwardRef<HTMLElement, SectionProps>(
  (
    {
      className,
      headingClassName,
      title,
      description,
      actions,
      level = 2,
      testID,
      children,
      ...props
    },
    ref
  ) => {
    const headingId = React.useId();
    const Heading = `h${level}` as "h2" | "h3" | "h4";

    return (
      <section
        ref={ref}
        data-slot="section"
        data-testid={testID}
        aria-labelledby={headingId}
        className={cn("flex flex-col gap-4", className)}
        {...props}
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <Heading
              id={headingId}
              data-slot="section-title"
              className={cn(sectionHeadingVariants({ level }), headingClassName)}
            >
              {title}
            </Heading>
            {description ? (
              // A <div>, not a <p>. `description` is a ReactNode, so it can
              // legitimately carry a list, a <div>, or a composed component
              // with a block root — none of which may appear inside a
              // paragraph. The browser silently reparents them out of the
              // <p>, which changes the DOM shape and hydration-mismatches
              // for SSR consumers. Same call, same reason, as widening
              // Tooltip's bubble from <span> to <div>.
              <div
                data-slot="section-description"
                className="text-sm text-muted-foreground"
              >
                {description}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div
              data-slot="section-actions"
              className="flex shrink-0 items-center gap-2"
            >
              {actions}
            </div>
          ) : null}
        </div>
        {children}
      </section>
    );
  }
);
Section.displayName = "Section";

export { sectionHeadingVariants };
