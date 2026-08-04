// L2 Example: Component Composition
// This page builds the same Items view manually from Genesis data components.
// Compare with items.tsx which achieves the same result using ResourcePage (L1).

import { useState, useMemo } from "react";
import { Package, Plus, MoreHorizontal, Tag } from "lucide-react";
import { Badge, Button, Card, CardHeader, CardTitle, CardContent } from "@marktiderman/genesis-ui";
import { DataPageShell, DataFilters, DataTable, DataGrid, DataList } from "@marktiderman/genesis-ui/data";
import { useViewPreference } from "@marktiderman/genesis-ui/hooks";
import type { DataTableColumn } from "@marktiderman/genesis-ui/data";
import type { ViewMode } from "@marktiderman/genesis-ui/data";

/* -- Data -- */

interface Item {
  id: string;
  name: string;
  status: "Active" | "Draft" | "Archived";
  category: string;
  price: string;
  created: string;
}

const mockItems: Item[] = [
  { id: "1", name: "Wireless Headphones", status: "Active", category: "Electronics", price: "$79.99", created: "2026-04-01" },
  { id: "2", name: "Leather Notebook", status: "Active", category: "Stationery", price: "$24.50", created: "2026-03-28" },
  { id: "3", name: "Running Shoes", status: "Draft", category: "Apparel", price: "$129.00", created: "2026-03-20" },
  { id: "4", name: "Ceramic Mug", status: "Active", category: "Kitchen", price: "$18.00", created: "2026-03-15" },
  { id: "5", name: "Desk Lamp", status: "Archived", category: "Office", price: "$45.00", created: "2026-03-10" },
  { id: "6", name: "Yoga Mat", status: "Active", category: "Fitness", price: "$35.00", created: "2026-03-05" },
  { id: "7", name: "Coffee Beans", status: "Active", category: "Kitchen", price: "$22.00", created: "2026-02-28" },
  { id: "8", name: "Backpack", status: "Draft", category: "Apparel", price: "$89.00", created: "2026-02-20" },
];

const statusBadgeVariant: Record<Item["status"], "success" | "warning" | "muted"> = {
  Active: "success",
  Draft: "warning",
  Archived: "muted",
};

/* -- Columns for DataTable -- */

const columns: DataTableColumn<Item>[] = [
  { key: "name", header: "Name", sortable: true },
  {
    key: "status",
    header: "Status",
    sortable: true,
    render: (_item, val) => (
      <Badge variant={statusBadgeVariant[val as Item["status"]]}>
        {String(val)}
      </Badge>
    ),
  },
  { key: "category", header: "Category", sortable: true },
  { key: "price", header: "Price", sortable: true, hideBelow: "sm" },
  { key: "created", header: "Created", sortable: true, hideBelow: "md" },
];

/* -- Sorting -- */

function sortItems(items: Item[], sort: string): Item[] {
  const [field, dir] = sort.split("-") as [keyof Item, "asc" | "desc"];
  return [...items].sort((a, b) => {
    const cmp = String(a[field]).localeCompare(String(b[field]), undefined, { numeric: true });
    return dir === "asc" ? cmp : -cmp;
  });
}

/* -- Page -- */

export default function Items() {
  const [viewMode, setViewMode] = useViewPreference("items", "table");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name-asc");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let items = mockItems.filter((item) => {
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter.length === 0 || statusFilter.includes(item.status);
      return matchesSearch && matchesStatus;
    });
    items = sortItems(items, sort);
    return items;
  }, [search, sort, statusFilter]);

  const hasActiveFilters = statusFilter.length > 0;

  return (
    <DataPageShell
        title="Items"
        subtitle="Manage your inventory and product listings."
        icon={Package}
        entityName="item"
        count={filtered.length}
        totalCount={mockItems.length}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={() => setStatusFilter([])}
        isEmpty={filtered.length === 0}
        emptyIcon={Package}
        emptyMessage="No items match your criteria."
        createAction={
          <Button size="sm">
            <Plus className="h-4 w-4" /> New Item
          </Button>
        }
        filters={
          <DataFilters
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search items..."
            sort={sort}
            onSortChange={setSort}
            sortOptions={[
              { value: "name-asc", label: "Name (A-Z)" },
              { value: "name-desc", label: "Name (Z-A)" },
              { value: "price-asc", label: "Price (low-high)" },
              { value: "price-desc", label: "Price (high-low)" },
              { value: "created-desc", label: "Newest first" },
              { value: "created-asc", label: "Oldest first" },
            ]}
            statusChips={{
              options: ["Active", "Draft", "Archived"],
              selected: statusFilter,
              onChange: setStatusFilter,
            }}
            onClearAll={() => {
              setSearch("");
              setSort("name-asc");
              setStatusFilter([]);
            }}
          />
        }
      >
        <DataGrid
          items={filtered}
          viewMode={viewMode}
          getKey={(item) => item.id}
          gridCols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          renderCard={(item) => (
            <Card className="h-full hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base truncate">{item.name}</CardTitle>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant={statusBadgeVariant[item.status]}>{item.status}</Badge>
                    <span className="text-sm font-semibold">{item.price}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Tag className="h-3 w-3" />
                    {item.category}
                  </div>
                  <p className="text-xs text-muted-foreground">{item.created}</p>
                </div>
              </CardContent>
            </Card>
          )}
          renderTable={(items) => (
            <DataTable
              items={items}
              columns={columns}
              getKey={(item) => item.id}
              pagination
              pageSize={10}
            />
          )}
          renderListItem={(item) => (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.category} &middot; {item.price} &middot; {item.created}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={statusBadgeVariant[item.status]}>{item.status}</Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        />
      </DataPageShell>
  );
}
