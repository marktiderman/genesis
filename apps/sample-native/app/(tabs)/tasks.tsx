import { NativeResourcePage } from "@marktiderman/genesis-ui-native/data";
import { NativeBadge } from "@marktiderman/genesis-ui-native";
import type { Task } from "../lib/data";

const priorityVariant = {
  High: "destructive" as const,
  Medium: "warning" as const,
  Low: "muted" as const,
};

export default function TasksScreen() {
  return (
    <NativeResourcePage<Task>
      resource="tasks"
      title="Tasks"
      subtitle="Track work across your project."
      cardFields={[
        { key: "title", position: "title" },
        {
          key: "priority",
          position: "badge",
          render: (value) => (
            <NativeBadge variant={priorityVariant[value as Task["priority"]]}>{String(value)}</NativeBadge>
          ),
        },
        { key: "assignee", position: "subtitle" },
        { key: "status", position: "meta" },
      ]}
      searchFields={["title", "assignee"]}
      statusFilter="status"
    />
  );
}
