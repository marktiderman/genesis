/**
 * Combobox / Autocomplete — text input that filters a fixed option list
 * and lets the user pick one.
 *
 * Use when the user knows what they're looking for and the option list
 * is too long for a Select. Filtering is case-insensitive substring by
 * default; pass `filter` to override (e.g. fuzzy match).
 *
 * @stability Beta
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { cn } from "../utils";

export interface NativeComboboxOption<T = string> {
  /** Stable identifier passed to onChange. */
  value: T;
  /** Visible label. */
  label: string;
  /** Optional secondary line. */
  description?: string;
}

export interface NativeComboboxProps<T = string> {
  options: NativeComboboxOption<T>[];
  value?: T;
  onChange: (value: T) => void;
  /** Placeholder for the input. */
  placeholder?: string;
  /**
   * Color used for the placeholder text. Defaults to a token-aware muted
   * value that matches NativeWind's `text-muted-foreground` resolution.
   * Override per-call when an alternate brand demands a different shade.
   */
  placeholderTextColor?: string;
  /** Override the substring filter. Return true to keep the option visible. */
  filter?: (option: NativeComboboxOption<T>, query: string) => boolean;
  /** Empty-state node when nothing matches. */
  emptyContent?: React.ReactNode;
  /** Initial query (uncontrolled mode). */
  defaultQuery?: string;
  className?: string;
  testID?: string;
}

const defaultFilter = <T,>(o: NativeComboboxOption<T>, q: string) =>
  o.label.toLowerCase().includes(q.toLowerCase()) ||
  (o.description?.toLowerCase().includes(q.toLowerCase()) ?? false);

export function NativeCombobox<T = string>({
  options,
  value,
  onChange,
  placeholder,
  placeholderTextColor,
  filter = defaultFilter,
  emptyContent,
  defaultQuery = "",
  className,
  testID,
}: NativeComboboxProps<T>) {
  const [query, setQuery] = useState<string>(() => {
    if (defaultQuery) return defaultQuery;
    const selected = options.find((o) => o.value === value);
    return selected?.label ?? "";
  });
  const [open, setOpen] = useState(false);

  const filtered = useMemo(
    () => (query ? options.filter((o) => filter(o, query)) : options),
    [filter, options, query]
  );

  return (
    <View testID={testID} className={cn("relative", className)}>
      <TextInput
        testID={testID ? `${testID}-input` : "combobox-input"}
        value={query}
        onChangeText={(t) => {
          setQuery(t);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Delay close on blur so option-press can land first.
        onBlur={() => {
          setTimeout(() => setOpen(false), 120);
        }}
        placeholder={placeholder ?? "Search..."}
        placeholderTextColor={placeholderTextColor}
        accessibilityRole="search"
        accessibilityLabel={placeholder ?? "Search"}
        className={cn(
          "min-h-[44px] rounded-md border border-input bg-background px-3 text-base text-foreground"
        )}
      />
      {open ? (
        <View
          className={cn(
            "mt-1 max-h-[280px] rounded-md border border-border bg-background shadow-md"
          )}
        >
          {filtered.length === 0 ? (
            <View className="p-3" testID={testID ? `${testID}-empty` : undefined}>
              {emptyContent ?? (
                <Text className="text-sm text-muted-foreground">No results.</Text>
              )}
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {filtered.map((opt) => (
                <Pressable
                  key={String(opt.value)}
                  testID={testID ? `${testID}-option-${String(opt.value)}` : undefined}
                  accessibilityRole="button"
                  accessibilityState={{ selected: opt.value === value }}
                  onPress={() => {
                    onChange(opt.value);
                    setQuery(opt.label);
                    setOpen(false);
                  }}
                  className="min-h-[44px] flex-col justify-center px-3 py-2"
                >
                  <Text className="text-base text-foreground">{opt.label}</Text>
                  {opt.description ? (
                    <Text className="text-xs text-muted-foreground">
                      {opt.description}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}
