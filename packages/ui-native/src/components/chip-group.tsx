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

/** What a group of `mode` holds: one value in `single`, a list in `multiple`. */
export type NativeChipGroupValue<M extends NativeChipGroupMode> = M extends "single" ? string : string[];

/**
 * The props, as the web's ChipGroup: with `mode="single"`, `onChange` gets one string; with
 * `mode="multiple"`, a list. With `mode` left out the group is `multiple` and `onChange` is typed
 * for either, as before. `value` is one string in `single` mode and a list in `multiple`; its type
 * still takes either, so a screen's existing `string | string[]` state keeps compiling.
 */
export interface NativeChipGroupProps<M extends NativeChipGroupMode = NativeChipGroupMode> {
  mode?: M;
  value: string | readonly string[];
  onChange: (value: NativeChipGroupValue<M>) => void;
  /**
   * In `single` mode, pressing the chosen chip clears it (`onChange("")`). Default false: pressing
   * it calls `onChange` with its own value again, as it always has (the web's ChipGroup sends
   * nothing then).
   */
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  testID?: string;
}

export function NativeChipGroup<M extends NativeChipGroupMode = NativeChipGroupMode>({
  mode = "multiple" as M,
  value,
  onChange,
  allowEmpty = false,
  disabled,
  className,
  children,
  testID,
}: NativeChipGroupProps<M>) {
  const single = mode === "single";
  const selected = new Set<string>(
    single
      ? typeof value === "string" && value
        ? [value]
        : []
      : Array.isArray(value)
      ? (value as readonly string[])
      : []
  );
  const emit = onChange as (value: string | string[]) => void;
  const toggle = (v: string) => {
    if (single) {
      // Pressing the chosen chip again: cleared with `allowEmpty`; otherwise reported as it always
      // was (`onChange` with the same value), so a screen's own handler can still decide.
      emit(selected.has(v) && allowEmpty ? "" : v);
      return;
    }
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    emit(Array.from(next));
  };
  return (
    <ChipContext.Provider value={{ mode, selected, toggle, disabled }}>
      <View
        testID={testID ?? "native-chip-group"}
        accessibilityRole={single ? "radiogroup" : undefined}
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
            isSelected ? "font-semibold text-primary-text" : "text-foreground"
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
