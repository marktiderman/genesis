// L1 Example: ResourcePage
// Full CRUD page in ~15 lines using ResourcePage.
// Compare with items-custom.tsx for the L2 (manual composition) version —
// `renderCard` below reproduces that file's custom grid card exactly, so an
// app doesn't have to give up its own card design (or its bespoke
// `gridCols` layout) to adopt ResourcePage. Grid/list views also come with
// built-in keyboard navigation (j/k focus, Enter open, Backspace back, x
// toggle-select) for free — try it below. Opt out with
// `keyboardNavigation={false}`.

import { MoreHorizontal, Package, Tag } from "lucide-react";
import { ResourcePage } from "@marktiderman/genesis-ui/data";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@marktiderman/genesis-ui";
import type { Item } from "../lib/data";

const statusVariant: Record<string, "success" | "warning" | "muted"> = {
  Active: "success",
  Draft: "warning",
  Archived: "muted",
};

export default function Items() {
  return (
    <ResourcePage<Item>
      resource="items"
      title="Items"
      subtitle="Manage your inventory and product listings."
      icon={Package}
      columns={[
        "name",
        {
          key: "status",
          header: "Status",
          render: (item) => (
            <Badge variant={statusVariant[item.status]}>{item.status}</Badge>
          ),
        },
        "category",
        { key: "price", hideBelow: "sm" },
        { key: "created", hideBelow: "md" },
      ]}
      statusFilter="status"
      searchFields={["name", "category"]}
      searchPlaceholder="Search items..."
      detail="panel"
      defaultView="grid"
      gridCols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      renderCard={(item, _index, actions) => (
        // `actions.open()` activates the row (opens the detail panel here).
        // A custom card owns its own click handling — ResourcePage doesn't
        // wrap it — so it also owns being reachable: `role="button"` +
        // `tabIndex` + Enter/Space make it a real tab stop, and nested
        // controls stopPropagation so they don't also activate the row.
        <Card
          role="button"
          tabIndex={0}
          aria-label={item.name}
          data-testid="items-card"
          className="h-full cursor-pointer hover:shadow-md motion-safe:transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={actions.open}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              actions.open();
            }
          }}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base truncate">{item.name}</CardTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={`More actions for ${item.name}`}
                    testID="items-card-menu-button"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenuItem onSelect={() => actions.open()}>
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void actions.update(item.id, {
                        status: item.status === "Archived" ? "Active" : "Archived",
                      });
                    }}
                  >
                    {item.status === "Archived" ? "Restore" : "Archive"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant={statusVariant[item.status]}>{item.status}</Badge>
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
      createLabel="New Item"
      allowCreate
      allowEdit
      onDelete={(item) => {
        if (confirm(`Delete ${item.name}?`)) {
          console.log("Delete:", item.id);
        }
      }}
    />
  );
}
