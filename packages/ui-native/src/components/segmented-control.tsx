/**
 * SegmentedControl — iOS-style horizontal segmented picker.
 *
 * Use for 2-5 mutually exclusive options that fit on one line. For more
 * than 5, prefer <NativeTabs> or <NativeSelect>. Renders an Android-
 * acceptable filled-pill variant; the visual remains compact on both
 * platforms.
 *
 * @stability Beta
 */
import { Pressable, Text, View } from "react-native";
import { cn } from "../utils";

export interface NativeSegmentedControlOption<T = string> {
  value: T;
  label: string;
}

export interface NativeSegmentedControlProps<T = string> {
  options: NativeSegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Disable the entire control. */
  disabled?: boolean;
  className?: string;
  testID?: string;
}

const SELECTED_LIFT = { shadowColor: "black", shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 } as const;
const UNSELECTED_LIFT = { shadowColor: "black", shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 } as const;

export function NativeSegmentedControl<T = string>({
  options,
  value,
  onChange,
  disabled,
  className,
  testID,
}: NativeSegmentedControlProps<T>) {
  return (
    <View
      testID={testID ?? "native-segmented"}
      accessibilityRole="radiogroup"
      className={cn(
        "flex-row rounded-md border border-border bg-muted p-0.5",
        disabled && "opacity-50",
        className
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            testID={
              testID
                ? `${testID}-option-${String(opt.value)}`
                : `segmented-option-${String(opt.value)}`
            }
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            onPress={() => onChange(opt.value)}
            className={cn(
              "min-h-[36px] flex-1 items-center justify-center rounded px-3 py-1",
              selected && "bg-background"
            )}
            // The lift as a style, not a `shadow-sm` class toggled on select: NativeWind treats a
            // shadow class that appears later as an upgrade and, in development, crashes printing it.
            style={selected ? SELECTED_LIFT : UNSELECTED_LIFT}
          >
            <Text
              className={cn(
                "text-sm",
                selected ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
