import { useRouter } from "expo-router";
import { NativeResourcePage } from "@marktiderman/genesis-ui-native/data";
import { NativeBadge } from "@marktiderman/genesis-ui-native";
import type { Item } from "../lib/data";

const statusVariant = {
  Active: "success" as const,
  Draft: "warning" as const,
  Archived: "muted" as const,
};

export default function ItemsScreen() {
  const router = useRouter();

  return (
    <NativeResourcePage<Item>
      resource="items"
      title="Items"
      subtitle="Manage your inventory and product listings."
      cardFields={[
        { key: "name", position: "title" },
        {
          key: "status",
          position: "badge",
          render: (value) => (
            <NativeBadge variant={statusVariant[value as Item["status"]]}>{String(value)}</NativeBadge>
          ),
        },
        { key: "category", position: "subtitle" },
        { key: "price", position: "meta" },
      ]}
      searchFields={["name", "category"]}
      searchPlaceholder="Search items..."
      statusFilter="status"
      onItemPress={(item) => router.push(`/items/${item.id}`)}
      onCreatePress={() => router.push("/items/create")}
      createLabel="New Item"
    />
  );
}
