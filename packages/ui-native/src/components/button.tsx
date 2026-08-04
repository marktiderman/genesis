/**
 * Button — primary touch target. Variants: default, secondary, outline, ghost, destructive.
 *
 * @stability Stable
 */
import { type VariantProps, cva } from "class-variance-authority";
import { ActivityIndicator, Pressable, Text } from "react-native";
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
  ...props
}: NativeButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      className={cn(
        buttonVariants({ variant, size }),
        isDisabled && "opacity-50",
        className
      )}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      {...props}
    >
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
    </Pressable>
  );
}

export { NativeButton, buttonVariants, buttonTextVariants };
