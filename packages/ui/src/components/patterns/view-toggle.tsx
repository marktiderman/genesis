import { Button } from "../ui/button";
import { LayoutGrid, Table2, List } from "lucide-react";

export type ViewMode = "grid" | "table" | "list";

interface ViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function ViewToggle({ viewMode, onViewModeChange }: ViewToggleProps) {
  // Each button is icon-only, so `aria-label` supplies the accessible name
  // (`title` alone is not a reliable one) and `aria-pressed` reports which of
  // the three is current — the `default`/`ghost` variant swap conveys that to
  // sighted users only.
  return (
    <div
      className="flex items-center border rounded-lg overflow-hidden"
      role="group"
      aria-label="View mode"
    >
      <Button
        variant={viewMode === "grid" ? "default" : "ghost"}
        size="icon"
        className="h-8 w-8 rounded-none"
        onClick={() => onViewModeChange("grid")}
        title="Grid view"
        aria-label="Grid view"
        aria-pressed={viewMode === "grid"}
        testID="view-toggle-grid"
      >
        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant={viewMode === "table" ? "default" : "ghost"}
        size="icon"
        className="h-8 w-8 rounded-none"
        onClick={() => onViewModeChange("table")}
        title="Table view"
        aria-label="Table view"
        aria-pressed={viewMode === "table"}
        testID="view-toggle-table"
      >
        <Table2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant={viewMode === "list" ? "default" : "ghost"}
        size="icon"
        className="h-8 w-8 rounded-none"
        onClick={() => onViewModeChange("list")}
        title="List view"
        aria-label="List view"
        aria-pressed={viewMode === "list"}
        testID="view-toggle-list"
      >
        <List className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
