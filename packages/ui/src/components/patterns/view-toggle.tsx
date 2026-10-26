import { Button } from "../ui/button";
import { LayoutGrid, Table2, List } from "lucide-react";
import { useUiMessages } from "../../messages";

export type ViewMode = "grid" | "table" | "list";

interface ViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function ViewToggle({ viewMode, onViewModeChange }: ViewToggleProps) {
  const m = useUiMessages();
  // Each button is icon-only, so `aria-label` supplies the accessible name
  // (`title` alone is not a reliable one) and `aria-pressed` reports which of
  // the three is current — the `default`/`ghost` variant swap conveys that to
  // sighted users only.
  return (
    <div
      className="flex items-center border rounded-lg overflow-hidden"
      role="group"
      aria-label={m.view.mode}
    >
      <Button
        variant={viewMode === "grid" ? "default" : "ghost"}
        size="icon"
        className="h-8 w-8 rounded-none"
        onClick={() => onViewModeChange("grid")}
        title={m.view.grid}
        aria-label={m.view.grid}
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
        title={m.view.table}
        aria-label={m.view.table}
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
        title={m.view.list}
        aria-label={m.view.list}
        aria-pressed={viewMode === "list"}
        testID="view-toggle-list"
      >
        <List className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
