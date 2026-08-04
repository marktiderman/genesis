/**
 * Badge — compact status / count / category tag.
 *
 * @stability Stable
 */
import { type VariantProps, cva } from "class-variance-authority";
import { Text, View } from "react-native";
import { cn } from "../utils";

const badgeVariants = cva(
  "flex-row items-center self-start rounded-full border px-2.5 py-0.5",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary",
        secondary: "border-transparent bg-secondary",
        destructive: "border-transparent bg-destructive",
        outline: "border-border bg-transparent",
        success: "border-transparent bg-success/15",
        warning: "border-transparent bg-warning/15",
        info: "border-transparent bg-info/15",
        muted: "border-transparent bg-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const badgeTextVariants = cva("text-xs font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-foreground",
      // AA-safe status text on the /15 tint. The bare status token
      // (text-success ~2.2:1) fails WCAG AA. The `-dark` stop is optional in
      // the brand schema (only `status.*.DEFAULT` is required) AND regresses
      // dark mode — a dark shade on the dark-surface tint drops to ~1.7–2.6:1.
      // Instead use the semantic Tailwind ramp (always present, brand-
      // independent, same hues as the Genesis status tokens) with a `dark:`
      // stop. Measured: light /15 tint emerald-700 4.76 / amber-800 6.32 /
      // blue-700 5.64; dark-surface tint emerald-300 ≥8.2 / amber-200 ≥10.8 /
      // blue-300 ≥8.2 — AA in both modes across the static preset and the
      // themeFromBrand() runtime dark map.
      success: "text-emerald-700 dark:text-emerald-300",
      warning: "text-amber-800 dark:text-amber-200",
      info: "text-blue-700 dark:text-blue-300",
      muted: "text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface NativeBadgeProps
  extends VariantProps<typeof badgeVariants> {
  className?: string;
  textClassName?: string;
  children: React.ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}

function NativeBadge({
  className,
  textClassName,
  variant,
  children,
  ...props
}: NativeBadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant }), className)} accessibilityRole="text" {...props}>
      {typeof children === "string" ? (
        <Text
          className={cn(badgeTextVariants({ variant }), textClassName)}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

export { NativeBadge, badgeVariants, badgeTextVariants };
