import * as React from "react";
import { type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeButton } from "../components/button";
import { NativeSkeleton } from "../components/skeleton";
import { NativeText } from "../components/text";
import { NativeEmptyState } from "./NativeEmptyState";

export interface NativeDataPageShellProps {
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  emptyMessage?: string;
  emptyState?: ReactNode;
  children: ReactNode;
}

function NativeDataPageShell({
  title,
  subtitle,
  headerRight,
  isLoading,
  isEmpty,
  hasError,
  errorMessage = "Something went wrong.",
  onRetry,
  emptyMessage,
  emptyState,
  children,
}: NativeDataPageShellProps) {
  const renderContent = () => {
    if (isLoading) {
      return (
        <View className="px-4 pt-4 gap-3">
          {/* Search bar skeleton */}
          <NativeSkeleton className="w-full h-10 rounded-lg" />
          {/* Card skeletons */}
          <NativeSkeleton className="w-full h-20 rounded-lg" />
          <NativeSkeleton className="w-full h-20 rounded-lg" />
          <NativeSkeleton className="w-full h-20 rounded-lg" />
        </View>
      );
    }

    if (hasError) {
      return (
        <View className="flex-1 items-center justify-center px-4 py-12 gap-4">
          <NativeText preset="body" className="text-destructive text-center">
            {errorMessage}
          </NativeText>
          {onRetry ? (
            <NativeButton variant="outline" size="sm" onPress={onRetry}>
              Try Again
            </NativeButton>
          ) : null}
        </View>
      );
    }

    if (isEmpty) {
      if (emptyState) {
        return <>{emptyState}</>;
      }
      return <NativeEmptyState message={emptyMessage} />;
    }

    return <>{children}</>;
  };

  return (
    <SafeAreaView edges={["left", "right"]} className="flex-1 bg-background">
      {/* Header */}
      <View className="px-4 pt-4 pb-2">
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View className="flex-1">
            <NativeText preset="h2">{title}</NativeText>
            {subtitle ? (
              <NativeText preset="body-sm" className="text-muted-foreground mt-0.5">
                {subtitle}
              </NativeText>
            ) : null}
          </View>
          {headerRight ? <View className="ml-3">{headerRight}</View> : null}
        </View>
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {renderContent()}
      </ScrollView>
    </SafeAreaView>
  );
}

export { NativeDataPageShell };
