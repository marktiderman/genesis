/**
 * Toggle — pressable on/off button (used inside ToggleGroup-style patterns).
 *
 * @stability Stable
 */
import { type VariantProps, cva } from "class-variance-authority";
import { useState } from "react";
import { Pressable } from "react-native";
import { cn } from "../utils";

const toggleVariants = cva(
  "items-center justify-center rounded-md",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent",
      },
      size: {
        default: "h-10 px-3",
        sm: "h-9 px-2.5",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface NativeToggleProps
  extends VariantProps<typeof toggleVariants> {
  className?: string;
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
  testID?: string;
}

function NativeToggle({
  className,
  variant,
  size,
  pressed: controlledPressed,
  defaultPressed = false,
  onPressedChange,
  disabled,
  children,
  ...props
}: NativeToggleProps) {
  const [uncontrolledPressed, setUncontrolledPressed] =
    useState(defaultPressed);
  const isPressed = controlledPressed ?? uncontrolledPressed;

  function handlePress() {
    const next = !isPressed;
    if (controlledPressed === undefined) {
      setUncontrolledPressed(next);
    }
    onPressedChange?.(next);
  }

  return (
    <Pressable
      className={cn(
        toggleVariants({ variant, size }),
        isPressed && "bg-accent",
        disabled && "opacity-50",
        className
      )}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="togglebutton"
      accessibilityState={{ checked: isPressed, disabled }}
      {...props}
    >
      {children}
    </Pressable>
  );
}

export { NativeToggle, toggleVariants };
