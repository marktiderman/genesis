import {
  Users,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Clock,
} from "lucide-react";
import { Badge } from "@marktiderman/genesis-ui";
import { StatCard, KanbanBoard, DataList, PageHeader } from "@marktiderman/genesis-ui/data";
import type { KanbanColumn } from "@marktiderman/genesis-ui/data";

/* -- Kanban data -- */

interface Task {
  id: string;
  title: string;
  assignee: string;
  priority: "low" | "medium" | "high";
}

const kanbanColumns: KanbanColumn<Task>[] = [
  {
    key: "todo",
    label: "To Do",
    status: "neutral",
    items: [
      { id: "t1", title: "Set up CI/CD pipeline", assignee: "Alice", priority: "high" },
      { id: "t2", title: "Write API documentation", assignee: "Bob", priority: "medium" },
      { id: "t3", title: "Design onboarding flow", assignee: "Carol", priority: "low" },
    ],
  },
  {
    key: "in-progress",
    label: "In Progress",
    status: "warning",
    items: [
      { id: "t4", title: "Build user dashboard", assignee: "David", priority: "high" },
      { id: "t5", title: "Implement auth flow", assignee: "Eve", priority: "medium" },
    ],
  },
  {
    key: "done",
    label: "Done",
    status: "success",
    items: [
      { id: "t6", title: "Database schema design", assignee: "Alice", priority: "high" },
      { id: "t7", title: "Project scaffolding", assignee: "Bob", priority: "medium" },
    ],
  },
];

const priorityColors: Record<string, string> = {
  high: "destructive",
  medium: "warning",
  low: "muted",
};

/* -- Recent activity data -- */

interface Activity {
  id: string;
  action: string;
  user: string;
  time: string;
}

const recentActivity: Activity[] = [
  { id: "a1", action: "New user signed up", user: "Alice Johnson", time: "2 min ago" },
  { id: "a2", action: "Order #1284 completed", user: "Bob Smith", time: "15 min ago" },
  { id: "a3", action: "Item published: Wireless Headphones", user: "Carol White", time: "1 hour ago" },
  { id: "a4", action: "Payment received: $450.00", user: "David Brown", time: "3 hours ago" },
  { id: "a5", action: "New review posted (5 stars)", user: "Eve Davis", time: "5 hours ago" },
];

/* -- Page -- */

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Welcome back"
        subtitle="Here is what is happening with your project today."
      />

      {/* Stat Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Users"
          value="2,834"
          icon={Users}
          color="primary"
          trend={{ value: 12.5, label: "from last month" }}
        />
        <StatCard
          label="Revenue"
          value="$12,450"
          icon={DollarSign}
          color="success"
          trend={{ value: 8.1, label: "from last month" }}
        />
        <StatCard
          label="Orders"
          value="1,284"
          icon={ShoppingCart}
          color="warning"
          trend={{ value: -2.4, label: "from last month" }}
        />
        <StatCard
          label="Growth"
          value="18.2%"
          icon={TrendingUp}
          color="primary"
          trend={{ value: 4.6, label: "from last quarter" }}
        />
      </div>

      {/* Kanban Board */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Task Board</h2>
        <KanbanBoard
          columns={kanbanColumns}
          renderCard={(item) => (
            <div className="rounded-lg border bg-card p-3 shadow-sm space-y-2">
              <p className="text-sm font-medium">{item.title}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{item.assignee}</span>
                <Badge variant={priorityColors[item.priority] as "destructive" | "warning" | "muted"}>
                  {item.priority}
                </Badge>
              </div>
            </div>
          )}
        />
      </div>

      {/* Recent Activity */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Recent Activity</h2>
        </div>
        <DataList
          items={recentActivity}
          renderItem={(item) => (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{item.action}</p>
                <p className="text-xs text-muted-foreground">{item.user}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{item.time}</span>
            </div>
          )}
        />
      </div>
    </div>
  );
}
