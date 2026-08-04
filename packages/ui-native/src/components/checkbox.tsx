/**
 * Checkbox — binary on/off control with optional label.
 *
 * @stability Stable
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { cn } from "../utils";

export interface NativeCheckboxProps {
  className?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

function NativeCheckbox({
  className,
  checked: controlledChecked,
  defaultChecked = false,
  onCheckedChange,
  disabled,
  ...props
}: NativeCheckboxProps) {
  const [uncontrolledChecked, setUncontrolledChecked] =
    useState(defaultChecked);
  const isChecked = controlledChecked ?? uncontrolledChecked;

  function handlePress() {
    const next = !isChecked;
    if (controlledChecked === undefined) {
      setUncontrolledChecked(next);
    }
    onCheckedChange?.(next);
  }

  return (
    <Pressable
      className={cn(
        "h-5 w-5 items-center justify-center rounded border border-border",
        isChecked && "border-primary bg-primary",
        disabled && "opacity-50",
        className
      )}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isChecked }}
      {...props}
    >
      {isChecked ? (
        <View className="h-2.5 w-2.5 rounded-sm bg-primary-foreground" />
      ) : null}
    </Pressable>
  );
}

export { NativeCheckbox };
