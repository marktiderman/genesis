// Example: ResourcePage with field grouping, 2-column layout, and wizard mode
import { ShoppingCart } from "lucide-react";
import { ResourcePage } from "@marktiderman/genesis-ui/data";
import { Badge } from "@marktiderman/genesis-ui";
import type { Order } from "../lib/data";

const statusVariant: Record<string, "success" | "warning" | "muted" | "destructive"> = {
  Draft: "muted",
  Pending: "warning",
  Paid: "success",
  Shipped: "success",
};

export default function Orders() {
  return (
    <ResourcePage<Order>
      resource="orders"
      title="Orders"
      subtitle="Manage customer orders."
      icon={ShoppingCart}
      columns={[
        "customer",
        "email",
        {
          key: "status",
          header: "Status",
          render: (item) => (
            <Badge variant={statusVariant[item.status]}>{item.status}</Badge>
          ),
        },
        "total",
        { key: "created", hideBelow: "md" },
      ]}
      statusFilter="status"
      searchFields={["customer", "email"]}
      searchPlaceholder="Search orders..."
      allowCreate
      allowEdit
      createLabel="New Order"
      formFields={[
        { key: "customer", required: true, group: "Customer Info" },
        { key: "email", type: "email", required: true, group: "Customer Info" },
        {
          key: "status",
          type: "select",
          options: [
            { value: "Draft", label: "Draft" },
            { value: "Pending", label: "Pending" },
            { value: "Paid", label: "Paid" },
            { value: "Shipped", label: "Shipped" },
          ],
          group: "Order Details",
        },
        { key: "total", group: "Order Details" },
        { key: "created", type: "date", group: "Order Details" },
      ]}
    />
  );
}
