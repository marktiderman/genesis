import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../../utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        // AA-safe status text on the tinted chip. Same-hue status text
        // (text-success ~2.2:1) fails WCAG AA, so text uses the semantic
        // Tailwind ramp (same hues as the Genesis status tokens). Measured
        // over the light /15 tint: emerald-700 4.76:1, amber-800 6.33:1,
        // blue-700 5.64:1 (amber-700 was 4.48:1 — under the 4.5:1 floor).
        // Dark mode uses the 200/300 stops over the /20 tint: 8.8–11.5:1.
        success:
          "border-transparent bg-success/15 text-emerald-700 dark:bg-success/20 dark:text-emerald-300",
        warning:
          "border-transparent bg-warning/15 text-amber-800 dark:bg-warning/20 dark:text-amber-200",
        info: "border-transparent bg-info/15 text-blue-700 dark:bg-info/20 dark:text-blue-300",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
