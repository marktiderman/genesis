// Example: ResourcePage with modal detail, bulk actions, and grid view
import { CheckSquare } from "lucide-react";
import { ResourcePage } from "@marktiderman/genesis-ui/data";
import { Badge } from "@marktiderman/genesis-ui";
import type { Task } from "../lib/data";

const priorityVariant: Record<string, "destructive" | "warning" | "muted"> = {
  High: "destructive",
  Medium: "warning",
  Low: "muted",
};

export default function Tasks() {
  return (
    <ResourcePage<Task>
      resource="tasks"
      title="Tasks"
      subtitle="Track work across your project."
      icon={CheckSquare}
      columns={[
        "title",
        {
          key: "status",
          header: "Status",
          render: (item) => <Badge variant="outline">{item.status}</Badge>,
        },
        "assignee",
        {
          key: "priority",
          header: "Priority",
          render: (item) => (
            <Badge variant={priorityVariant[item.priority]}>
              {item.priority}
            </Badge>
          ),
        },
      ]}
      detail="modal"
      statusFilter="status"
      searchFields={["title", "assignee"]}
      defaultView="table"
      bulkActions={[
        {
          label: "Delete",
          variant: "destructive",
          onAction: (ids) => console.log("Bulk delete:", ids),
        },
      ]}
      allowCreate
      allowEdit
      createLabel="New Task"
    />
  );
}
