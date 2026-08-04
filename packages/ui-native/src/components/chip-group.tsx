/**
 * Chip + ChipGroup — wrapping row of selectable filter pills.
 *
 * Use for filters and multi-select tag pickers. Two modes:
 *   - "single": exactly one chip selected at a time.
 *   - "multiple": any subset selected.
 *
 * Compose: <NativeChipGroup value=... onChange=...>
 *   <NativeChip value="x">Label</NativeChip>
 * </NativeChipGroup>.
 *
 * @stability Beta
 */
import { createContext, useContext } from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "../utils";

export type NativeChipGroupMode = "single" | "multiple";

interface ChipContextValue {
  mode: NativeChipGroupMode;
  selected: Set<string>;
  toggle: (value: string) => void;
  disabled?: boolean;
}

const ChipContext = createContext<ChipContextValue | null>(null);

export interface NativeChipGroupProps {
  mode?: NativeChipGroupMode;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  testID?: string;
}

export function NativeChipGroup({
  mode = "multiple",
  value,
  onChange,
  disabled,
  className,
  children,
  testID,
}: NativeChipGroupProps) {
  const selected = new Set<string>(
    mode === "single"
      ? typeof value === "string"
        ? [value]
        : []
      : Array.isArray(value)
      ? value
      : []
  );
  const toggle = (v: string) => {
    if (mode === "single") {
      onChange(v);
      return;
    }
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(Array.from(next));
  };
  return (
    <ChipContext.Provider value={{ mode, selected, toggle, disabled }}>
      <View
        testID={testID ?? "native-chip-group"}
        accessibilityRole={mode === "single" ? "radiogroup" : undefined}
        className={cn("flex-row flex-wrap gap-2", className)}
      >
        {children}
      </View>
    </ChipContext.Provider>
  );
}

export interface NativeChipProps {
  value: string;
  className?: string;
  children: React.ReactNode;
  testID?: string;
}

export function NativeChip({
  value,
  className,
  children,
  testID,
}: NativeChipProps) {
  const ctx = useContext(ChipContext);
  if (!ctx)
    throw new Error("NativeChip must be used inside <NativeChipGroup>.");
  const isSelected = ctx.selected.has(value);
  return (
    <Pressable
      testID={testID ?? `chip-${value}`}
      accessibilityRole={ctx.mode === "single" ? "radio" : "checkbox"}
      accessibilityState={{ selected: isSelected, disabled: ctx.disabled }}
      disabled={ctx.disabled}
      onPress={() => ctx.toggle(value)}
      className={cn(
        "min-h-[44px] flex-row items-center rounded-full border px-3.5 py-1.5",
        isSelected
          ? "border-primary bg-primary/10"
          : "border-border bg-background",
        ctx.disabled && "opacity-50",
        className
      )}
    >
      {typeof children === "string" ? (
        <Text
          className={cn(
            "text-sm",
            isSelected ? "font-semibold text-primary" : "text-foreground"
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
