import { useLocalSearchParams, Stack } from "expo-router";
import { NativeDetailPanel } from "@marktiderman/genesis-ui-native/data";
import { NativeBadge, NativeText, NativeButton } from "@marktiderman/genesis-ui-native";
import { useOne } from "@marktiderman/genesis-core/hooks";
import { View } from "react-native";
import type { Item } from "../lib/data";

const statusVariant = {
  Active: "success" as const,
  Draft: "warning" as const,
  Archived: "muted" as const,
};

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useOne<Item>("items", id);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <NativeText preset="body" className="text-muted-foreground">Loading...</NativeText>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-background" style={{ gap: 12 }}>
        <NativeText preset="body" className="text-destructive text-center">
          {error?.message ?? "Item not found."}
        </NativeText>
        <NativeButton variant="outline" size="sm" onPress={() => refetch()}>
          Try Again
        </NativeButton>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: data.name, headerShown: true }} />
      <NativeDetailPanel<Item>
        item={data}
        titleField="name"
        fields={[
          {
            key: "status",
            label: "Status",
            render: (value) => (
              <NativeBadge variant={statusVariant[value as Item["status"]]}>
                {String(value)}
              </NativeBadge>
            ),
          },
          { key: "category", label: "Category" },
          { key: "price", label: "Price" },
          { key: "created", label: "Created" },
        ]}
      />
    </>
  );
}
