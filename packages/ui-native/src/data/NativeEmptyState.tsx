import * as React from "react";
import { View } from "react-native";
import { NativeButton } from "../components/button";
import { NativeText } from "../components/text";

export interface NativeEmptyStateProps {
  message?: string;
  action?: React.ReactNode;
  hasFilters?: boolean;
  onClearFilters?: () => void;
}

function NativeEmptyState({
  message = "No items found",
  action,
  hasFilters = false,
  onClearFilters,
}: NativeEmptyStateProps) {
  if (hasFilters) {
    return (
      <View className="flex-1 items-center justify-center px-4 py-12">
        <NativeText preset="body" className="text-muted-foreground text-center">
          No results match your filters
        </NativeText>
        {onClearFilters ? (
          <View className="mt-4">
            <NativeButton variant="outline" size="sm" onPress={onClearFilters}>
              Clear Filters
            </NativeButton>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center px-4 py-12">
      <NativeText preset="body" className="text-muted-foreground text-center">
        {message}
      </NativeText>
      {action ? <View className="mt-4">{action}</View> : null}
    </View>
  );
}

export { NativeEmptyState };
