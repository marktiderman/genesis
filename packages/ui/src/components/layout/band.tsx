import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../../utils";
import { containerVariants } from "./container";

/**
 * The surfaces a band can sit on. Each pairs a background with the
 * foreground made for it, so text on a band always uses the colour designed
 * against that background:
 *
 * - `base`: the page (`background` / `foreground`).
 * - `muted`: a quiet alternate band (`muted` / `foreground`), for rhythm.
 * - `accent`: the brand's primary (`primary` / `primary-foreground`), for a call to action.
 * - `inverse`: the page's colours swapped (`foreground` / `background`), for a footer or a dark band.
 */
const bandVariants = cva("relative w-full", {
  variants: {
    surface: {
      base: "bg-background text-foreground",
      muted: "bg-muted text-foreground",
      accent: "bg-primary text-primary-foreground",
      inverse: "bg-foreground text-background",
    },
    // Vertical rhythm, mobile first: a band breathes more on a wide screen.
    spacing: {
      none: "py-0",
      sm: "py-8 sm:py-10",
      md: "py-12 sm:py-16 lg:py-20",
      lg: "py-16 sm:py-24 lg:py-32",
    },
  },
  defaultVariants: {
    surface: "base",
    spacing: "md",
  },
});

export interface BandProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof bandVariants> {
  /**
   * The element to render. `section` (default) for a region of the page,
   * `header` / `footer` for the site's banner and footer, `div` for a band
   * that is not a region of its own.
   */
  as?: "section" | "header" | "footer" | "div" | "aside";
  /** The inner column's width (Container's named widths). Default `lg`. */
  width?: "sm" | "md" | "lg" | "full" | "prose";
  /** Classes for the inner column, after the width and gutter. */
  innerClassName?: string;
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * Band: a full-bleed, full-width marketing section. The background runs
 * edge to edge; the content sits in a centered column with the page gutter.
 * It is what a landing page is made of: a hero, a features band, a call to
 * action, a footer.
 *
 * ```tsx
 * <Band surface="accent" spacing="lg" aria-labelledby="cta-title">
 *   <Display as="h2" id="cta-title" size="lg">Start today</Display>
 * </Band>
 * ```
 *
 * Unlike `Section` (a titled region inside an app page), a band carries no
 * heading of its own: a marketing page decides its heading levels per page
 * (one `h1`, then `h2`s), so the caller places a `Display` and names the
 * region with `aria-labelledby`. Server-safe: no state, no effects.
 *
 * @stability Beta
 */
export const Band = React.forwardRef<HTMLElement, BandProps>(
  ({ as: Tag = "section", surface, spacing, width = "lg", className, innerClassName, testID, children, ...props }, ref) => (
    <Tag
      ref={ref as React.Ref<HTMLElement & HTMLDivElement>}
      data-slot="band"
      data-surface={surface ?? "base"}
      data-testid={testID}
      className={cn(bandVariants({ surface, spacing }), className)}
      {...props}
    >
      <div data-slot="band-inner" className={cn(containerVariants({ size: width, gutter: true }), innerClassName)}>
        {children}
      </div>
    </Tag>
  )
);
Band.displayName = "Band";

/**
 * The marketing (display) type scale: larger than the app scale and
 * responsive, mobile first, so a headline fits a phone and fills a desktop.
 * Size is independent of the heading level: a page has one `h1` whatever
 * size it is drawn at.
 */
const displayVariants = cva("font-display font-bold tracking-tight text-balance", {
  variants: {
    size: {
      /** A hero headline. */
      xl: "text-4xl leading-[1.1] sm:text-5xl lg:text-6xl",
      /** A section headline. */
      lg: "text-3xl leading-tight sm:text-4xl",
      /** A card or column title in a band. */
      md: "text-2xl leading-snug sm:text-3xl",
      /** A small title, such as a pricing tier's name. */
      sm: "text-xl leading-snug",
    },
  },
  defaultVariants: {
    size: "lg",
  },
});

export interface DisplayProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof displayVariants> {
  /** The heading level: document structure, not a size. Default `h2`. */
  as?: "h1" | "h2" | "h3" | "h4" | "p";
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * Display: a heading in the marketing type scale (`displayVariants`).
 *
 * ```tsx
 * <Display as="h1" size="xl">Train with people who know your name</Display>
 * ```
 *
 * @stability Beta
 */
export const Display = React.forwardRef<HTMLHeadingElement, DisplayProps>(
  ({ as: Tag = "h2", size, className, testID, ...props }, ref) => (
    <Tag
      ref={ref}
      data-slot="display"
      data-testid={testID}
      className={cn(displayVariants({ size }), className)}
      {...props}
    />
  )
);
Display.displayName = "Display";

/**
 * Lead copy under a display heading: one size up from body text, in the
 * muted foreground on the page (`tone="muted"`), or the band's own
 * foreground on an accent or inverse band (`tone="inherit"`).
 */
const leadVariants = cva("text-lg leading-relaxed sm:text-xl text-pretty", {
  variants: {
    tone: {
      muted: "text-muted-foreground",
      inherit: "text-current",
    },
  },
  defaultVariants: { tone: "muted" },
});

export interface BandLeadProps
  extends React.HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof leadVariants> {
  testID?: string;
}

/** @stability Beta */
export const BandLead = React.forwardRef<HTMLParagraphElement, BandLeadProps>(
  ({ tone, className, testID, ...props }, ref) => (
    <p ref={ref} data-slot="band-lead" data-testid={testID} className={cn(leadVariants({ tone }), className)} {...props} />
  )
);
BandLead.displayName = "BandLead";

export { bandVariants, displayVariants, leadVariants };
