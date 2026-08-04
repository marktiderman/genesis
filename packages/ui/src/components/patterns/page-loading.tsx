import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { Spinner } from "../ui/spinner";
import { cn } from "../../utils";

const pageLoadingVariants = cva(
  "flex flex-col items-center justify-center gap-3 px-4 text-center",
  {
    variants: {
      variant: {
        page: "min-h-[50vh]",
        section: "min-h-48 py-12",
      },
    },
    defaultVariants: {
      variant: "page",
    },
  },
);

export interface PageLoadingProps extends VariantProps<typeof pageLoadingVariants> {
  /** Optional message shown under the spinner (e.g. "Loading dashboard…"). */
  label?: string;
  className?: string;
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * PageLoading — full-page or in-section loading state: a centered `Spinner`
 * with an optional message. The loading-state counterpart to `EmptyState`.
 * Reach for `Skeleton` instead when the placeholder should mimic the shape
 * of the content that's arriving rather than a generic wait state.
 *
 * @stability Beta
 */
export function PageLoading({ label, variant, className, testID }: PageLoadingProps) {
  return (
    <div
      data-slot="page-loading"
      data-testid={testID}
      role="status"
      className={cn(pageLoadingVariants({ variant }), className)}
    >
      <Spinner size={variant === "section" ? "default" : "lg"} aria-hidden="true" />
      {label ? (
        <p className="text-sm text-muted-foreground">{label}</p>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}

export { pageLoadingVariants };
