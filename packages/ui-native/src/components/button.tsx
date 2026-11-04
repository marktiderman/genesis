/**
 * Button — primary touch target. Variants: default, secondary, outline, ghost, destructive.
 * It answers a touch with `usePressFeedback`: what's inside shrinks a little while held (or dims
 * under Reduce Motion), the same as every Genesis pressable.
 *
 * @stability Stable
 */
import { type VariantProps, cva } from "class-variance-authority";
import { ActivityIndicator, Animated, Pressable, Text, type AccessibilityState } from "react-native";
import type { HapticKind } from "../hooks/use-haptics";
import { usePressFeedback } from "../hooks/use-press-feedback";
import { cn } from "../utils";

const buttonVariants = cva(
  "flex-row items-center justify-center rounded-md",
  {
    variants: {
      variant: {
        default: "bg-primary",
        secondary: "bg-secondary",
        outline: "border border-input bg-transparent",
        ghost: "bg-transparent",
        destructive: "bg-destructive",
      },
      size: {
        sm: "h-9 px-3 gap-1.5",
        md: "h-10 px-4 gap-2",
        lg: "h-11 px-8 gap-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

const buttonTextVariants = cva("font-medium text-center", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      outline: "text-foreground",
      ghost: "text-foreground",
      destructive: "text-destructive-foreground",
    },
    size: {
      sm: "text-sm",
      md: "text-sm",
      lg: "text-base",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
  },
});

export interface NativeButtonProps
  extends VariantProps<typeof buttonVariants> {
  className?: string;
  textClassName?: string;
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  /** What a screen reader says, when the text alone isn't enough ("Vote for Dark mode"). Default: the text. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Merged with the button's own `disabled` and `busy`: `{ selected: true }` for a vote cast, a filter on. */
  accessibilityState?: AccessibilityState;
  /**
   * A haptic through `GenesisModules.haptics` (`light` for a vote, `success` for a save): it plays
   * when the press counts, except `select`, which ticks on press-in as `usePressFeedback` does. Default none.
   */
  haptic?: HapticKind | undefined;
}

function NativeButton({
  className,
  textClassName,
  variant,
  size,
  children,
  onPress,
  disabled,
  loading,
  accessibilityState,
  haptic,
  ...props
}: NativeButtonProps) {
  const isDisabled = disabled || loading;
  const feedback = usePressFeedback({ haptic: onPress ? (haptic ?? false) : false, disabled: Boolean(isDisabled) });
  const press = onPress
    ? () => {
        feedback.confirm();
        onPress();
      }
    : undefined;

  return (
    <Pressable
      className={cn(
        buttonVariants({ variant, size }),
        isDisabled && "opacity-50",
        className
      )}
      onPress={press}
      onPressIn={feedback.onPressIn}
      onPressOut={feedback.onPressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: isDisabled, busy: loading }}
      {...props}
    >
      {/* Inside the Pressable, which keeps the button's size and classes: a wrapper would lose a `flex-1`. */}
      <Animated.View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, feedback.style]}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={
              variant === "outline" || variant === "ghost"
                ? undefined
                : "white"
            }
          />
        ) : null}
        {typeof children === "string" ? (
          <Text
            className={cn(
              buttonTextVariants({ variant, size }),
              textClassName
            )}
          >
            {children}
          </Text>
        ) : (
          children
        )}
      </Animated.View>
    </Pressable>
  );
}

export { NativeButton, buttonVariants, buttonTextVariants };
