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
import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { canStepNumber, clampNumber, readNumberDraft, stepNumber } from "@marktiderman/genesis-core/headless";
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
  /**
   * The locale whose marks typed numbers use ("de-DE" reads "1.234,5"). Default: worked out from
   * the text ("1,234" is 1234, "1,5" is 1.5), genesis-core's `parseNumberInput`, as on the web.
   */
  locale?: string;
  /** Disable both stepper buttons and the input. */
  disabled?: boolean;
  /** Disable just the typed input; keep stepper. */
  readOnlyInput?: boolean;
  className?: string;
  inputClassName?: string;
  testID?: string;
}

export function NativeNumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision = 0,
  locale,
  disabled,
  readOnlyInput,
  className,
  inputClassName,
  testID,
}: NativeNumberInputProps) {
  const setValue = useCallback(
    (next: number) => {
      if (Number.isNaN(next)) return;
      onChange(clampNumber(next, min, max));
    },
    [max, min, onChange]
  );

  // What's typed: the field shows it, and a number inside the range is passed on as it is typed.
  // Leaving the field clamps what's typed and shows the value again, so typing "1" on the way to
  // "15" with min 10 never sends 10, and "", "-" or "1." never replace the value (as on the web).
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const { value: typed } = readNumberDraft(draft, { min, max, locale });
    setDraft(null);
    if (typed !== null && clampNumber(typed, min, max) !== value) setValue(typed);
  };

  const decBlocked = disabled || !canStepNumber(value, -1, { min, max });
  const incBlocked = disabled || !canStepNumber(value, 1, { min, max });

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
        onPress={() => {
          setDraft(null);
          setValue(stepNumber(value, -1, { step, min, max }));
        }}
        className={cn(
          "min-h-[44px] min-w-[44px] items-center justify-center px-3",
          decBlocked && "opacity-40"
        )}
      >
        <Text className="text-xl font-semibold text-foreground">−</Text>
      </Pressable>
      <TextInput
        testID={testID ? `${testID}-field` : "number-input-field"}
        value={draft ?? value.toFixed(precision)}
        editable={!disabled && !readOnlyInput}
        keyboardType="numeric"
        accessibilityLabel="Numeric value"
        onChangeText={(t) => {
          setDraft(t);
          const typed = readNumberDraft(t, { min, max, locale });
          if (typed.inRange && typed.value !== null && typed.value !== value) onChange(typed.value);
        }}
        onBlur={commit}
        onSubmitEditing={commit}
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
        onPress={() => {
          setDraft(null);
          setValue(stepNumber(value, 1, { step, min, max }));
        }}
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
