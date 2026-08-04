/**
 * NumberInput — numeric input with stepper buttons and numeric keypad.
 *
 * Use for quantities, scores, durations — any context where the user
 * picks a discrete number within a range. The − / + buttons are 44pt
 * touch targets; the input itself uses the platform numeric keypad.
 *
 * Pass `min`, `max`, `step` to constrain. Pass `precision` to fix the
 * decimal display (default 0). For free-form numeric entry without
 * stepper UI, use <NativeInput keyboardType="numeric" />.
 *
 * @stability Beta
 */
import { useCallback } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { cn } from "../utils";

export interface NativeNumberInputProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** Increment per stepper press. Default 1. */
  step?: number;
  /** Decimal places shown. Default 0 (integer). */
  precision?: number;
  /** Disable both stepper buttons and the input. */
  disabled?: boolean;
  /** Disable just the typed input; keep stepper. */
  readOnlyInput?: boolean;
  className?: string;
  inputClassName?: string;
  testID?: string;
}

function clamp(v: number, min?: number, max?: number) {
  if (min !== undefined && v < min) return min;
  if (max !== undefined && v > max) return max;
  return v;
}

export function NativeNumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision = 0,
  disabled,
  readOnlyInput,
  className,
  inputClassName,
  testID,
}: NativeNumberInputProps) {
  const setValue = useCallback(
    (next: number) => {
      if (Number.isNaN(next)) return;
      onChange(clamp(next, min, max));
    },
    [max, min, onChange]
  );

  const decBlocked = disabled || (min !== undefined && value <= min);
  const incBlocked = disabled || (max !== undefined && value >= max);

  return (
    <View
      testID={testID ?? "native-number-input"}
      accessibilityRole="adjustable"
      accessibilityValue={{ now: value, min, max }}
      className={cn(
        "flex-row items-stretch overflow-hidden rounded-md border border-input bg-background",
        className
      )}
    >
      <Pressable
        testID={testID ? `${testID}-decrement` : "number-input-decrement"}
        accessibilityRole="button"
        accessibilityLabel="Decrement"
        disabled={decBlocked}
        onPress={() => setValue(value - step)}
        className={cn(
          "min-h-[44px] min-w-[44px] items-center justify-center px-3",
          decBlocked && "opacity-40"
        )}
      >
        <Text className="text-xl font-semibold text-foreground">−</Text>
      </Pressable>
      <TextInput
        testID={testID ? `${testID}-field` : "number-input-field"}
        value={value.toFixed(precision)}
        editable={!disabled && !readOnlyInput}
        keyboardType="numeric"
        accessibilityLabel="Numeric value"
        onChangeText={(t) => {
          const parsed = Number(t.replace(/[^0-9.\-]/g, ""));
          setValue(parsed);
        }}
        className={cn(
          "min-w-[64px] flex-1 border-x border-input bg-background text-center text-base text-foreground",
          inputClassName
        )}
      />
      <Pressable
        testID={testID ? `${testID}-increment` : "number-input-increment"}
        accessibilityRole="button"
        accessibilityLabel="Increment"
        disabled={incBlocked}
        onPress={() => setValue(value + step)}
        className={cn(
          "min-h-[44px] min-w-[44px] items-center justify-center px-3",
          incBlocked && "opacity-40"
        )}
      >
        <Text className="text-xl font-semibold text-foreground">+</Text>
      </Pressable>
    </View>
  );
}
