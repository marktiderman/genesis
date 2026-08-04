import { useCallback } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { NativeBadge } from "../components/badge";
import { NativeInput } from "../components/input";

export interface NativeDataFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  statusChips?: {
    options: string[];
    selected: string[];
    onChange: (values: string[]) => void;
  };
  sort?: {
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (sort: string) => void;
  };
}

function NativeDataFilters({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  statusChips,
  sort,
}: NativeDataFiltersProps) {
  const handleStatusToggle = useCallback(
    (option: string) => {
      if (!statusChips) return;
      const isSelected = statusChips.selected.includes(option);
      const next = isSelected
        ? statusChips.selected.filter((s) => s !== option)
        : [...statusChips.selected, option];
      statusChips.onChange(next);
    },
    [statusChips]
  );

  const handleSortToggle = useCallback(
    (value: string) => {
      sort?.onChange(value);
    },
    [sort]
  );

  return (
    <View style={{ gap: 12 }}>
      <NativeInput
        placeholder={searchPlaceholder}
        value={search}
        onChangeText={onSearchChange}
      />

      {statusChips && statusChips.options.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {statusChips.options.map((option) => {
            const isSelected = statusChips.selected.includes(option);
            return (
              <Pressable key={option} onPress={() => handleStatusToggle(option)}>
                <NativeBadge variant={isSelected ? "default" : "outline"}>
                  {option}
                </NativeBadge>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {sort && sort.options.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {sort.options.map((option) => {
            const isSelected = sort.value === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => handleSortToggle(option.value)}
              >
                <NativeBadge variant={isSelected ? "secondary" : "outline"}>
                  {option.label}
                </NativeBadge>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

export { NativeDataFilters };
