export interface Item {
  [key: string]: unknown;
  id: string;
  name: string;
  status: "Active" | "Draft" | "Archived";
  category: string;
  price: string;
  created: string;
}

export const items: Item[] = [
  { id: "1", name: "Wireless Headphones", status: "Active", category: "Electronics", price: "$79.99", created: "2026-04-01" },
  { id: "2", name: "Leather Notebook", status: "Active", category: "Stationery", price: "$24.50", created: "2026-03-28" },
  { id: "3", name: "Running Shoes", status: "Draft", category: "Apparel", price: "$129.00", created: "2026-03-20" },
  { id: "4", name: "Ceramic Mug", status: "Active", category: "Kitchen", price: "$18.00", created: "2026-03-15" },
  { id: "5", name: "Desk Lamp", status: "Archived", category: "Office", price: "$45.00", created: "2026-03-10" },
  { id: "6", name: "Yoga Mat", status: "Active", category: "Fitness", price: "$35.00", created: "2026-03-05" },
  { id: "7", name: "Coffee Beans", status: "Active", category: "Kitchen", price: "$22.00", created: "2026-02-28" },
  { id: "8", name: "Backpack", status: "Draft", category: "Apparel", price: "$89.00", created: "2026-02-20" },
];

export interface Task {
  [key: string]: unknown;
  id: string;
  title: string;
  status: "To Do" | "In Progress" | "Done";
  assignee: string;
  priority: "High" | "Medium" | "Low";
}

export const tasks: Task[] = [
  { id: "1", title: "Design homepage layout", status: "To Do", assignee: "Sarah", priority: "High" },
  { id: "2", title: "Set up CI pipeline", status: "To Do", assignee: "Mike", priority: "Medium" },
  { id: "3", title: "Write API documentation", status: "To Do", assignee: "Alex", priority: "Low" },
  { id: "4", title: "Implement auth flow", status: "In Progress", assignee: "Sarah", priority: "High" },
  { id: "5", title: "Database schema review", status: "In Progress", assignee: "Mike", priority: "Medium" },
  { id: "6", title: "Landing page copy", status: "Done", assignee: "Alex", priority: "Low" },
  { id: "7", title: "Set up monitoring", status: "Done", assignee: "Mike", priority: "Medium" },
];

export interface Order {
  id: string;
  customer: string;
  email: string;
  status: "Draft" | "Pending" | "Paid" | "Shipped";
  total: string;
  created: string;
  [key: string]: unknown;
}

export const orders: Order[] = [
  { id: "1", customer: "Alice Johnson", email: "alice@example.com", status: "Paid", total: "$450.00", created: "2026-04-10" },
  { id: "2", customer: "Bob Smith", email: "bob@example.com", status: "Pending", total: "$125.00", created: "2026-04-12" },
  { id: "3", customer: "Carol White", email: "carol@example.com", status: "Draft", total: "$0.00", created: "2026-04-14" },
];
