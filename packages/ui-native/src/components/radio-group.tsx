/**
 * RadioGroup — single-selection list of radio items.
 *
 * @stability Stable
 */
import { createContext, useContext, useState } from "react";
import { Pressable, View } from "react-native";
import { cn } from "../utils";

interface RadioGroupContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

function useRadioGroup() {
  const context = useContext(RadioGroupContext);
  if (!context)
    throw new Error("RadioGroup components must be used within <NativeRadioGroup>");
  return context;
}

export interface NativeRadioGroupProps {
  className?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  testID?: string;
}

function NativeRadioGroup({
  className,
  value: controlledValue,
  defaultValue = "",
  onValueChange: controlledOnValueChange,
  children,
  ...props
}: NativeRadioGroupProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value = controlledValue ?? uncontrolledValue;
  const onValueChange = controlledValue !== undefined
    ? (controlledOnValueChange ?? (() => {}))
    : (v: string) => { setUncontrolledValue(v); controlledOnValueChange?.(v); };

  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      <View className={cn("gap-2", className)} {...props}>
        {children}
      </View>
    </RadioGroupContext.Provider>
  );
}

export interface NativeRadioGroupItemProps {
  className?: string;
  value: string;
  disabled?: boolean;
  testID?: string;
}

function NativeRadioGroupItem({
  className,
  value,
  disabled,
  ...props
}: NativeRadioGroupItemProps) {
  const { value: selectedValue, onValueChange } = useRadioGroup();
  const isSelected = selectedValue === value;

  return (
    <Pressable
      className={cn(
        "h-5 w-5 items-center justify-center rounded-full border border-primary",
        disabled && "opacity-50",
        className
      )}
      onPress={() => onValueChange(value)}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected, disabled }}
      {...props}
    >
      {isSelected ? (
        <View className="h-2.5 w-2.5 rounded-full bg-primary" />
      ) : null}
    </Pressable>
  );
}

export { NativeRadioGroup, NativeRadioGroupItem };
